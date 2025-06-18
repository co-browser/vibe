import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ToolManager");
import type { IToolManager } from "../interfaces/index.js";
import type { ReactObservation } from "../react/types.js";
import type { CoreMessage } from "ai";

// Constants
const LOG_PREFIX = "[AgentCore]";

export class ToolManager implements IToolManager {
  private conversationHistory: CoreMessage[] = [];

  constructor() {}

  async getTools(): Promise<any> {
    // No tools available without MCP
    return [];
  }

  async executeTools(
    toolName: string,
    args: any,
    toolCallId: string,
  ): Promise<ReactObservation> {
    logger.debug(
      `${LOG_PREFIX} Tool execution attempted: ${toolName} (no tools available without MCP)`,
    );

    return {
      tool_call_id: toolCallId,
      tool_name: toolName,
      result: null,
      error: "No tools available - MCP servers have been removed",
    };
  }

  async formatToolsForReact(): Promise<string> {
    return "No tools available";
  }

  async saveTabMemory(
    _url: string,
    title: string,
    _content: string,
  ): Promise<void> {
    logger.debug(
      `${LOG_PREFIX} Tab memory save requested for: ${title} (no MCP available)`,
    );
    // No-op without MCP
  }

  async saveConversationMemory(
    userMessage: string,
    response: string,
  ): Promise<void> {
    try {
      // Keep local conversation history for current session context
      this.conversationHistory.push(
        { role: "user", content: userMessage },
        { role: "assistant", content: response },
      );

      // Keep only last 10 exchanges (20 messages) to prevent unbounded growth
      if (this.conversationHistory.length > 20) {
        this.conversationHistory = this.conversationHistory.slice(-20);
      }

      logger.debug(`${LOG_PREFIX} Saved conversation memory (local only)`);
    } catch (error) {
      logger.error(`${LOG_PREFIX} Failed to save conversation memory:`, error);
    }
  }

  async getConversationHistory(): Promise<CoreMessage[]> {
    return [...this.conversationHistory];
  }

  clearToolCache(): void {
    logger.debug(`${LOG_PREFIX} Tool cache cleared (no-op without MCP)`);
  }
}
