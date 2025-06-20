import { createLogger } from "@vibe/shared-types";
import type {
  ExtractedPage,
  IMCPManager,
  MCPTool,
  MCPCallResult,
} from "@vibe/shared-types";

import type { IToolManager } from "../interfaces/index.js";
import type { ReactObservation } from "../react/types.js";
import type { CoreMessage } from "ai";

const logger = createLogger("ToolManager");
// Constants
const LOG_PREFIX = "[AgentCore]";

export class ToolManager implements IToolManager {
  private conversationHistory: CoreMessage[] = [];
  private cachedTools: Record<string, MCPTool> | null = null;
  private cachedFormattedTools: string | null = null;

  constructor(private mcpManager?: IMCPManager) {}

  async getTools(): Promise<Record<string, MCPTool> | undefined> {
    // Return cached tools if available
    if (this.cachedTools) {
      return this.cachedTools;
    }

    if (!this.mcpManager) {
      return undefined;
    }

    try {
      this.cachedTools = await this.mcpManager.getAllTools();
      logger.debug(
        `${LOG_PREFIX} Tools cached (${Object.keys(this.cachedTools || {}).length} tools from multiple servers)`,
      );
      return this.cachedTools;
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to get MCP tools:`, error);
      return undefined;
    }
  }

  async executeTools(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId: string,
  ): Promise<ReactObservation> {
    try {
      logger.debug(
        `${LOG_PREFIX} Executing tool: ${toolName} with args:`,
        args,
      );

      if (!this.mcpManager) {
        return {
          tool_call_id: toolCallId,
          tool_name: toolName,
          result: null,
          error: "MCP manager not available",
        };
      }

      // Validate arguments
      if (!args || typeof args !== "object") {
        return {
          tool_call_id: toolCallId,
          tool_name: toolName,
          result: null,
          error: "Invalid arguments provided",
        };
      }

      // Call the tool through MCP manager - it will route to the correct server
      const callResult: MCPCallResult = await this.mcpManager.callTool(
        toolName,
        args,
      );

      if (!callResult.success) {
        return {
          tool_call_id: toolCallId,
          tool_name: toolName,
          result: null,
          error: callResult.error || "Tool execution failed",
        };
      }

      return {
        tool_call_id: toolCallId,
        tool_name: toolName,
        result: this.formatToolResult(callResult.data),
      };
    } catch (error) {
      logger.error(
        `${LOG_PREFIX} Tool execution failed for ${toolName}:`,
        error,
      );
      return {
        tool_call_id: toolCallId,
        tool_name: toolName,
        result: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async formatToolsForReact(): Promise<string> {
    // Return cached formatted tools if available
    if (this.cachedFormattedTools) {
      return this.cachedFormattedTools;
    }

    try {
      const tools = await this.getTools();
      if (!tools) {
        return "No tools available";
      }

      logger.debug(
        `${LOG_PREFIX} Formatting ${Object.keys(tools).length} MCP tools for ReAct from multiple servers`,
      );

      // Convert tools to ReAct format
      const toolDescriptions = Object.entries(tools)
        .map(([name, tool]) => {
          const description = tool.description || "No description";
          const parameters = this.formatToolSchema(tool.inputSchema);

          // Include server information in description
          const serverInfo = tool.serverName
            ? ` (from ${tool.serverName} server)`
            : "";
          const enhancedDescription = `${description}${serverInfo}`;

          logger.debug(
            `${LOG_PREFIX} Tool ${name} formatted from server ${tool.serverName || "unknown"}`,
          );

          return `<tool>
<n>${name}</n>
<description>${enhancedDescription}</description>
<parameters_json_schema>${parameters}</parameters_json_schema>
</tool>`;
        })
        .join("\n\n");

      this.cachedFormattedTools = toolDescriptions;
      logger.debug(
        `${LOG_PREFIX} Tools formatted and cached for LLM (${Object.keys(tools).length} total from multiple servers)`,
      );
      return this.cachedFormattedTools;
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to format tools for ReAct:`, error);
      return "No tools available";
    }
  }

  async saveTabMemory(extractedPage: ExtractedPage): Promise<void> {
    if (!this.mcpManager) {
      logger.warn(
        `${LOG_PREFIX} No MCP manager available for saving tab memory`,
      );
      return;
    }

    try {
      // Check if ingest_extracted_page tool is available (from RAG MCP server)
      const tools = await this.getTools();
      const ragIngestTool = this.findToolByName(tools, "ingest_extracted_page");

      if (!ragIngestTool) {
        logger.warn(
          `${LOG_PREFIX} ingest_extracted_page tool not available in any connected server`,
        );
        return;
      }

      // Call the RAG ingestion tool with the full ExtractedPage object
      const ingestResult = await this.mcpManager.callTool(ragIngestTool, {
        extractedPage,
      });

      if (!ingestResult.success) {
        throw new Error(ingestResult.error || "Failed to ingest page");
      }
      logger.debug(
        `${LOG_PREFIX} Saved tab memory to RAG system for: ${extractedPage.title}`,
      );
    } catch (error) {
      logger.error(
        `${LOG_PREFIX} Failed to save tab memory to RAG system:`,
        error,
      );
    }
  }

  async saveConversationMemory(
    userMessage: string,
    response: string,
  ): Promise<void> {
    try {
      // Add to local conversation history for current session context
      this.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: response },
      );

      // Keep only last 10 exchanges (20 messages) to prevent unbounded growth
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      // PERSISTENT MEMORY: Save both user message and response to MCP server
      if (this.mcpManager) {
        const tools = await this.getTools();
        const memoryTool = this.findToolByName(
          tools,
          "save_conversation_memory",
        );

        if (memoryTool) {
          try {
            // Save user message
            const trimmedUserMessage = this.trimMessage(userMessage, 500);
            const userResult = await this.mcpManager.callTool(memoryTool, {
              information: `User: ${trimmedUserMessage}`,
            });

            // Save agent response
            const trimmedResponse = this.trimMessage(response, 500);
            const assistantResult = await this.mcpManager.callTool(memoryTool, {
              information: `Assistant: ${trimmedResponse}`,
            });

            if (!userResult.success || !assistantResult.success) {
              throw new Error("Failed to save conversation to memory");
            }

            logger.debug(
              `${LOG_PREFIX} Saved conversation exchange to persistent memory`,
            );
          } catch (error) {
            logger.error(`${LOG_PREFIX} Failed to save to MCP memory:`, error);
          }
        }
      }

      logger.debug(
        `${LOG_PREFIX} Saved conversation memory (local + persistent)`,
      );
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to save conversation memory:`, error);
    }
  }

  async getConversationHistory(): Promise<CoreMessage[]> {
    return [...this.conversationHistory];
  }

  // Clear cache if needed (e.g., when MCP servers restart)
  clearToolCache(): void {
    this.cachedTools = null;
    this.cachedFormattedTools = null;
    logger.debug(`${LOG_PREFIX} Tool cache cleared`);
  }

  /**
   * Safely format tool result for display
   */
  private formatToolResult(data: unknown): string {
    if (typeof data === "string") {
      return data;
    }

    if (data === null || data === undefined) {
      return "";
    }

    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }

  /**
   * Format tool schema for display
   */
  private formatToolSchema(schema: unknown): string {
    try {
      return JSON.stringify(schema, null, 2);
    } catch {
      return "{}";
    }
  }

  /**
   * Find a tool by name pattern in the tools collection
   */
  private findToolByName(
    tools: Record<string, MCPTool> | undefined,
    namePattern: string,
  ): string | null {
    if (!tools) {
      return null;
    }

    return (
      Object.keys(tools).find(toolName => toolName.includes(namePattern)) ||
      null
    );
  }

  /**
   * Safely trim message to specified length
   */
  private trimMessage(message: string, maxLength: number): string {
    if (message.length <= maxLength) {
      return message;
    }
    return message.substring(0, maxLength) + "...";
  }
}
