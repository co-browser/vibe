import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from "openai/resources/index";
import { RAGTestClient } from "./mcp-client";

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class RAGAgent {
  private llm: OpenAI;
  private mcpClient: RAGTestClient;
  private tools: MCPTool[] = [];
  private toolHandlers: Record<string, (args: any) => Promise<any>> = {};

  constructor(mcpServerUrl: string = 'http://localhost:3000/mcp') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.llm = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.mcpClient = new RAGTestClient(mcpServerUrl);
    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.toolHandlers = {
      'ingest_url': async (args) => {
        return await this.mcpClient.ingestUrl(args.url);
      },
      'query_kb': async (args) => {
        return await this.mcpClient.queryKnowledgeBase(args.query, args.top_k || 5);
      },
      'ingest_extracted_page': async (args) => {
        return await this.mcpClient.ingestExtractedPage(args.extractedPage);
      }
    };
  }

  async connect() {
    await this.mcpClient.connect();
    const result = await this.mcpClient.listTools();
    
    if (result.success && result.data) {
      this.tools = result.data;
      console.log(`🔧 Loaded ${this.tools.length} MCP tools: ${this.tools.map(t => t.name).join(', ')}`);
    }
  }

  async disconnect() {
    await this.mcpClient.disconnect();
  }

  async *query(userQuery: string) {
    console.log(`\n🤖 Processing user query: "${userQuery}"`);
    
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: `You are a helpful RAG assistant that can search knowledge bases and ingest web content. 
You have access to the following tools: ${this.tools.map(tool => `${tool.name}: ${tool.description}`).join(', ')}.
Always provide helpful and accurate responses based on the information you find.`,
      },
      {
        role: 'user',
        content: userQuery,
      },
    ];

    console.log('💭 Thinking...');
    
    const response = await this.llm.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages,
      tools: this.tools.map(this.mcpToolToOpenAITool),
      parallel_tool_calls: false,
    });

    const choice = response.choices[0];
    const toolCalls = choice.message.tool_calls;
    const content = choice.message.content;

    if (content) {
      console.log(`\n🤖 Assistant: ${content}`);
      yield content;
    }

    if (toolCalls && toolCalls.length > 0) {
      messages.push(choice.message);

      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = toolCall.function.arguments;
        
        console.log(`\n🔧 Using tool '${toolName}' with arguments: ${toolArgs}`);

        let result;
        try {
          const parsedArgs = JSON.parse(toolArgs);
          
          if (this.toolHandlers[toolName]) {
            result = await this.toolHandlers[toolName](parsedArgs);
          } else {
            console.log(`❌ Unknown tool: ${toolName}`);
            continue;
          }
        } catch (error) {
          console.log(`❌ Error invoking tool '${toolName}': ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }

        if (result.success) {
          // Extract the actual result from MCP response format
          let toolOutput: string;
          
          if (Array.isArray(result.data) && result.data.length > 0 && result.data[0].text) {
            // Extract the actual result from MCP response text using robust parsing
            const mcpText = result.data[0].text;
            toolOutput = this.extractResultFromMCPText(mcpText);
          } else {
            // Fallback to original behavior
            toolOutput = JSON.stringify(result.data, null, 2);
          }
          
          // Truncate long outputs to prevent terminal clogging
          const maxOutputLength = 500;
          const displayOutput = toolOutput.length > maxOutputLength 
            ? toolOutput.substring(0, maxOutputLength) + `\n... [${toolOutput.length - maxOutputLength} more chars]`
            : toolOutput;
          
          console.log(`✅ Tool '${toolName}' result:\n${displayOutput}`);

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolOutput,
          });
        } else {
          console.log(`❌ Tool '${toolName}' failed: ${result.error}`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `Error: ${result.error}`,
          });
        }
      }

      console.log('💭 Processing tool results...');
      
      const followUpResponse = await this.llm.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 1000,
        messages,
        // No tools and no tool_choice - just generate a regular response
      });

      const followUpChoice = followUpResponse.choices[0];
      if (followUpChoice.message.content) {
        console.log(`\n🤖 Assistant: ${followUpChoice.message.content}`);
        yield followUpChoice.message.content;
      }
    }

    console.log('\n✅ Query completed.\n');
  }

  private mcpToolToOpenAITool(tool: MCPTool): ChatCompletionTool {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    };
  }

  private extractResultFromMCPText(mcpText: string): string {
    // Strategy 1: Look for "Result: " pattern with structured parsing
    const resultIndex = mcpText.lastIndexOf('Result: ');
    if (resultIndex !== -1) {
      const potentialJson = mcpText.substring(resultIndex + 8).trim();
      
      // Try to parse as JSON
      const jsonResult = this.safeParseJSON(potentialJson);
      if (jsonResult !== null) {
        return JSON.stringify(jsonResult, null, 2);
      }
      
      // If not valid JSON, return the text after "Result: "
      return potentialJson;
    }
    
    // Strategy 2: Look for JSON-like patterns in the entire text
    const jsonResult = this.extractJSONFromText(mcpText);
    if (jsonResult !== null) {
      return JSON.stringify(jsonResult, null, 2);
    }
    
    // Strategy 3: Fallback to the full MCP text
    return mcpText;
  }
  
  private safeParseJSON(text: string): any | null {
    try {
      return JSON.parse(text);
    } catch {
      // Try to find and extract a JSON object from the text
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          return JSON.parse(jsonMatch[0]);
        } catch {
          return null;
        }
      }
      return null;
    }
  }
  
  private extractJSONFromText(text: string): any | null {
    // Look for JSON objects or arrays in the text
    const patterns = [
      /\{[\s\S]*\}/,  // JSON object
      /\[[\s\S]*\]/   // JSON array
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        for (const match of matches) {
          const parsed = this.safeParseJSON(match);
          if (parsed !== null) {
            return parsed;
          }
        }
      }
    }
    
    return null;
  }
} 