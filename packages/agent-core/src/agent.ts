import {
  ReActProcessor,
  CoActProcessor,
  ProcessorFactory,
} from "./react/index.js";
import type {
  IToolManager,
  IStreamProcessor,
  IAgentConfig,
} from "./interfaces/index.js";
import type {
  StreamResponse,
  ExtractedPage,
  IMCPManager,
} from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("Agent");

export class Agent {
  private _processor?: ReActProcessor | CoActProcessor;

  constructor(
    private toolManager: IToolManager,
    private streamProcessor: IStreamProcessor,
    private config: IAgentConfig,
    private mcpManager?: IMCPManager,
  ) {}

  private async getProcessor(): Promise<ReActProcessor | CoActProcessor> {
    if (!this._processor) {
      // Clear any stale tool cache before creating processor
      this.toolManager.clearToolCache();
      this._processor = await ProcessorFactory.create(
        this.config,
        this.toolManager,
      );
    }
    return this._processor;
  }

  async *handleChatStream(
    userMessage: string,
  ): AsyncGenerator<StreamResponse, void, undefined> {
    const startTime = performance.now();
    const requestId = Math.random().toString(36).substring(7);
    const processorType = this.config.processorType || "react";

    logger.debug(
      `Processing request ${requestId} with ${processorType.toUpperCase()}`,
    );

    try {
      const chatHistory = await this.toolManager.getConversationHistory();
      const processor = await this.getProcessor();

      for await (const part of processor.process(userMessage, chatHistory)) {
        const response = this.streamProcessor.processStreamPart(part);

        if (response) {
          if (response.content) {
            await this.toolManager.saveConversationMemory(
              userMessage,
              response.content,
            );
          }
          yield response;

          if (response.type === "error" || response.type === "done") {
            const totalTime = performance.now() - startTime;
            logger.debug(
              `Request ${requestId} completed with ${response.type} in ${totalTime.toFixed(2)}ms`,
            );
            return;
          }
        }
      }
      yield { type: "done" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  reset(): void {
    this.toolManager.clearToolCache();
    this._processor = undefined;
  }

  async saveTabMemory(extractedPage: ExtractedPage): Promise<void> {
    const startTime = performance.now();
    const result = await this.toolManager.saveTabMemory(extractedPage);
    const endTime = performance.now();
    logger.debug(`Tab memory saved in ${(endTime - startTime).toFixed(2)}ms`);
    return result;
  }

  async updateMCPConnections(authToken: string | null): Promise<void> {
    if (!this.mcpManager) {
      logger.warn("No MCP manager available for connection updates");
      return;
    }

    try {
      // Update auth token and manage RAG connections dynamically
      await this.mcpManager.updateAuthToken(authToken);
      logger.info("MCP connections updated with new auth token");

      // Clear tool cache and recreate processor to include new tools
      this.toolManager.clearToolCache();
      this._processor = await ProcessorFactory.create(
        this.config,
        this.toolManager,
      );
      logger.info("Processor recreated with updated MCP connections");
    } catch (error) {
      logger.error("Failed to update MCP connections:", error);
      throw error;
    }
  }

  async updateGmailTokens(tokens: any): Promise<void> {
    if (!this.mcpManager) {
      logger.warn("No MCP manager available for Gmail token updates");
      return;
    }

    try {
      await this.mcpManager.updateGmailTokens(tokens);
      logger.info("Gmail tokens updated in MCP manager");

      // Clear tool cache and recreate processor to include new tools
      // This follows the same pattern as updateMCPConnections for RAG
      this.toolManager.clearToolCache();
      this._processor = await ProcessorFactory.create(
        this.config,
        this.toolManager,
      );
      logger.info("Processor recreated with updated Gmail connections");
    } catch (error) {
      logger.error("Failed to update Gmail tokens:", error);
      throw error;
    }
  }

  // Note: updateOpenAIApiKey method has been removed.
  // When the OpenAI API key changes, the entire agent is restarted
  // to ensure clean MCP connections. See agent-process.ts handleUpdateOpenAIApiKey.
}
