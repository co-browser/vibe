import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import type { ChatCompletionTool, ChatCompletionMessageParam } from 'openai/resources/index.js';
import { RAGTestClient } from './mcp-client.js';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
}

export class RAGAgent {
  private llm: OpenAI;
  private mcpClient: RAGTestClient;
  private tools: MCPTool[] = [];

  constructor(mcpServerUrl: string = 'http://localhost:3000') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.llm = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    this.mcpClient = new RAGTestClient(mcpServerUrl);
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
      model: 'gpt-4o-mini',
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
        if (toolName === 'ingest_url') {
          const args = JSON.parse(toolArgs);
          result = await this.mcpClient.ingestUrl(args.url);
        } else if (toolName === 'query_kb') {
          const args = JSON.parse(toolArgs);
          result = await this.mcpClient.queryKnowledgeBase(args.query, args.top_k || 5);
        } else {
          console.log(`❌ Unknown tool: ${toolName}`);
          continue;
        }

        if (result.success) {
          const toolOutput = JSON.stringify(result.data, null, 2);
          console.log(`✅ Tool '${toolName}' result:\n${toolOutput}`);

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
        model: 'gpt-4o-mini',
        max_tokens: 1000,
        messages,
        tools: this.tools.map(this.mcpToolToOpenAITool),
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
} 