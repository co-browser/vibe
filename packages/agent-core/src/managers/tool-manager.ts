import { createLogger } from "@vibe/shared-types";
import type { ExtractedPage } from "@vibe/shared-types";

import type { IToolManager } from "../interfaces/index.js";
import type { ReactObservation } from "../react/types.js";
import type { IMCPConnectionService } from "../services/mcp-service.js";
import type { CoreMessage } from "ai";

const logger = createLogger("ToolManager");
// Constants
const LOG_PREFIX = "[AgentCore]";

export class ToolManager implements IToolManager {
  private conversationHistory: CoreMessage[] = [];
  private cachedTools: any = null;
  private cachedFormattedTools: string | null = null;

  constructor(private mcpService?: IMCPConnectionService) {}

  async getTools(): Promise<any> {
    // Return cached tools if available
    if (this.cachedTools) {
      return this.cachedTools;
    }

    if (!this.mcpService) {
      return undefined;
    }

    try {
      this.cachedTools = await this.mcpService.getTools();
      logger.debug(
        `${LOG_PREFIX} Tools cached (${Object.keys(this.cachedTools || {}).length} tools)`,
      );
      return this.cachedTools;
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to get MCP tools:`, error);
      return undefined;
    }
  }

  async executeTools(
    toolName: string,
    args: any,
    toolCallId: string,
  ): Promise<ReactObservation> {
    try {
      logger.debug(
        `${LOG_PREFIX} Executing tool: ${toolName} with args:`,
        args,
      );

      if (!this.mcpService) {
        return {
          tool_call_id: toolCallId,
          tool_name: toolName,
          result: null,
          error: "MCP service not available",
        };
      }

      // Call the tool directly through MCP service - no LLM needed
      const result = await this.mcpService.callTool(toolName, args);

      return {
        tool_call_id: toolCallId,
        tool_name: toolName,
        result: typeof result === "string" ? result : JSON.stringify(result),
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
        `${LOG_PREFIX} Formatting ${Object.keys(tools).length} MCP tools for ReAct`,
      );

      // Convert tools to ReAct format
      const toolDescriptions = Object.entries(tools)
        .map(([name, tool]: [string, any]) => {
          const description = tool.description || "No description";
          const parameters = tool.inputSchema
            ? JSON.stringify(tool.inputSchema, null, 2)
            : "{}";

          logger.debug(`${LOG_PREFIX} Tool ${name} formatted`);

          return `<tool>
<name>${name}</name>
<description>${description}</description>
<parameters_json_schema>${parameters}</parameters_json_schema>
</tool>`;
        })
        .join("\n\n");

      this.cachedFormattedTools = toolDescriptions;
      logger.debug(
        `${LOG_PREFIX} Tools formatted and cached for LLM (${Object.keys(tools).length} total)`,
      );
      return this.cachedFormattedTools;
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to format tools for ReAct:`, error);
      return "No tools available";
    }
  }

  async saveTabMemory(extractedPage: ExtractedPage): Promise<void> {
    if (!this.mcpService) {
      logger.warn(
        `${LOG_PREFIX} No MCP service available for saving tab memory`,
      );
      return;
    }

    try {
      // Check if ingest_extracted_page tool is available (from RAG MCP server)
      const tools = await this.getTools();
      if (!tools || !tools.ingest_extracted_page) {
        logger.warn(`${LOG_PREFIX} ingest_extracted_page tool not available`);
        return;
      }

      // Call the RAG ingestion tool with the full ExtractedPage object
      await this.mcpService.callTool("ingest_extracted_page", {
        extractedPage,
      });
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
      if (this.mcpService) {
        const tools = await this.getTools();
        if (tools && tools.save_conversation_memory) {
          try {
            // Save user message
            const trimmedUserMessage =
              userMessage.length > 500
                ? userMessage.substring(0, 500) + "..."
                : userMessage;

            await this.mcpService.callTool("save_conversation_memory", {
              information: `User: ${trimmedUserMessage}`,
            });

            // Save agent response
            const trimmedResponse =
              response.length > 500
                ? response.substring(0, 500) + "..."
                : response;

            await this.mcpService.callTool("save_conversation_memory", {
              information: `Assistant: ${trimmedResponse}`,
            });

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

  // Clear cache if needed (e.g., when MCP server restarts)
  clearToolCache(): void {
    this.cachedTools = null;
    this.cachedFormattedTools = null;
    logger.debug(`${LOG_PREFIX} Tool cache cleared`);
  }
}
