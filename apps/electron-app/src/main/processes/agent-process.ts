/**
 * Agent Worker Process - Utility Process Entry Point
 * Runs the agent in complete isolation from the main browser process
 */

import { AgentFactory, Agent } from "@vibe/agent-core";
import type { ExtractedPage, ProcessorType } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("AgentWorker");

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface BaseMessage {
  id: string;
  type: string;
  data?: any;
}

interface InitializeData {
  config: {
    model?: string;
    processorType?: ProcessorType;
    llmProvider?: any; // LLM provider configuration
  };
}

interface ChatStreamData {
  message: string;
}

interface SaveTabMemoryData {
  extractedPage: ExtractedPage;
}

interface PingData {
  timestamp?: number;
}

interface UpdateAuthTokenData {
  token: string | null;
}

// Removed UpdateOpenAIApiKeyData - API key updates no longer supported

// ============================================================================
// PROCESS STATE
// ============================================================================

let agent: Agent | null = null;
let agentConfig: InitializeData["config"] | null = null;
let isProcessing = false;
let authToken: string | null = null;
let isCreatingAgent = false;

// Removed retry constants - no longer needed

// ============================================================================
// INFRASTRUCTURE UTILITIES
// ============================================================================

const createAgent = async () => {
  if (!agentConfig?.llmProvider) {
    logger.warn("Agent creation skipped: LLM provider configuration not available.");
    return;
  }

  // Prevent concurrent agent creation
  if (isCreatingAgent) {
    logger.warn("Agent creation already in progress");
    return;
  }

  isCreatingAgent = true;

  try {
    agent = await AgentFactory.create({
      ...agentConfig,
      llmProvider: agentConfig.llmProvider, // We already checked it exists above
      processorType: agentConfig?.processorType || "react",
      authToken: authToken ?? undefined,
    });

    logger.info("Agent created successfully in utility process");
  } finally {
    isCreatingAgent = false;
  }
};

class IPCMessenger {
  static sendResponse(id: string, data: any): void {
    if (process.parentPort?.postMessage) {
      process.parentPort.postMessage({
        id,
        type: "response",
        data,
      });
    } else {
      logger.warn("No IPC channel available for response");
    }
  }

  static sendStream(id: string, data: any): void {
    if (process.parentPort?.postMessage) {
      process.parentPort.postMessage({
        id,
        type: "stream",
        data,
      });
    }
  }

  static sendError(id: string, error: string): void {
    if (process.parentPort?.postMessage) {
      process.parentPort.postMessage({
        id,
        type: "error",
        error,
      });
    }
  }
}

class MessageValidator {
  static validateMessage(messageWrapper: any): BaseMessage {
    const message = messageWrapper.data;

    if (!message || typeof message !== "object") {
      throw new Error(`Invalid message format received: ${typeof message}`);
    }

    if (!message.type) {
      throw new Error(
        `Message missing type property. Received: ${JSON.stringify(message)}`,
      );
    }

    return message as BaseMessage;
  }

  static validateAgent(): void {
    if (!agent) {
      throw new Error("Agent not initialized");
    }
  }

  static validateConfig(config: any): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config provided");
    }
    // llmProvider is now required for agent creation
    if (config.llmProvider && typeof config.llmProvider !== "object") {
      throw new Error("LLM provider must be an object if provided");
    }
  }

  static validateProcessorType(
    processorType: any,
  ): "react" | "coact" | undefined {
    if (!processorType) return undefined;
    if (processorType === "react" || processorType === "coact") {
      return processorType;
    }
    return "react"; // default fallback
  }

  static validateChatMessage(message: any): string {
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      throw new Error("Valid message string is required");
    }
    return message.trim();
  }

  static validateTabMemoryData(data: any): SaveTabMemoryData {
    const { extractedPage } = data || {};
    if (!extractedPage || !extractedPage.url || !extractedPage.title) {
      throw new Error("Valid ExtractedPage with URL and title is required");
    }
    return { extractedPage };
  }
}

// ============================================================================
// BUSINESS LOGIC - MESSAGE HANDLERS
// ============================================================================

class MessageHandlers {
  static async handleInitialize(message: BaseMessage): Promise<void> {
    const config = (message.data as InitializeData)?.config;

    MessageValidator.validateConfig(config);

    // Merge new config with existing config
    agentConfig = {
      ...agentConfig,
      ...config,
      model: config.model || agentConfig?.model || "gpt-4o-mini",
      processorType: MessageValidator.validateProcessorType(
        config.processorType || agentConfig?.processorType,
      ),
      llmProvider: config.llmProvider || agentConfig?.llmProvider,
    };

    // Attempt to create the agent if not already created and we have LLM provider config
    if (!agent && agentConfig?.llmProvider) {
      await createAgent();
    }

    if (agentConfig?.llmProvider) {
      logger.info(
        "Agent initialized successfully in utility process with LLM provider",
      );
    } else {
      logger.info(
        "Agent worker initialized successfully, waiting for LLM provider config to create agent",
      );
    }

    IPCMessenger.sendResponse(message.id, { success: true });
  }

  static async handleChatStream(message: BaseMessage): Promise<void> {
    MessageValidator.validateAgent();

    const userMessage = MessageValidator.validateChatMessage(
      (message.data as ChatStreamData)?.message,
    );

    isProcessing = true;
    try {
      logger.info(
        "Processing chat message:",
        userMessage.substring(0, 100) + "...",
      );

      let streamCompleted = false;
      let streamError: string | null = null;

      for await (const streamResponse of agent!.handleChatStream(userMessage)) {
        IPCMessenger.sendStream(message.id, streamResponse);

        if (streamResponse.type === "done") {
          streamCompleted = true;
          break;
        } else if (streamResponse.type === "error") {
          streamError = streamResponse.error || "Unknown stream error";
          break;
        }
      }

      logger.info("Chat stream completed");

      if (streamError) {
        IPCMessenger.sendResponse(message.id, {
          success: false,
          error: streamError,
        });
      } else {
        IPCMessenger.sendResponse(message.id, {
          success: true,
          completed: streamCompleted,
        });
      }
    } finally {
      isProcessing = false;
    }
  }

  static async handleGetStatus(message: BaseMessage): Promise<void> {
    let status: string;
    let ready: boolean = false;

    if (!agent) {
      status = agentConfig?.llmProvider
        ? "not_initialized"
        : "waiting_for_llm_provider";
    } else if (isProcessing) {
      status = "processing";
      ready = true;
    } else {
      status = "ready";
      ready = true;
    }

    const statusResponse = {
      status,
      ready,
      initialized: agent !== null,
      processing: isProcessing,
      timestamp: Date.now(),
    };

    logger.debug("Status requested:", statusResponse);
    IPCMessenger.sendResponse(message.id, statusResponse);
  }

  static async handleReset(message: BaseMessage): Promise<void> {
    logger.info("Reset requested");

    if (agent) {
      agent.reset();
      logger.info("Agent processor and tool caches cleared");
    }

    isProcessing = false;

    logger.info("Agent state reset completed");

    IPCMessenger.sendResponse(message.id, {
      success: true,
      message: "Agent state reset successfully",
      hadAgent: agent !== null,
    });
  }

  static async handlePing(message: BaseMessage): Promise<void> {
    logger.debug("Health check ping received");

    IPCMessenger.sendResponse(message.id, {
      type: "pong",
      timestamp: Date.now(),
      originalTimestamp: (message.data as PingData)?.timestamp,
    });
  }

  static async handleSaveTabMemory(message: BaseMessage): Promise<void> {
    MessageValidator.validateAgent();

    const { extractedPage } = MessageValidator.validateTabMemoryData(
      message.data,
    );

    logger.info("Saving tab memory:", extractedPage.title);

    await agent!.saveTabMemory(extractedPage);

    logger.info("Tab memory saved successfully");
    IPCMessenger.sendResponse(message.id, { success: true });
  }

  static async handleUpdateAuthToken(message: BaseMessage): Promise<void> {
    const data = message.data as UpdateAuthTokenData;
    const oldToken = authToken;
    authToken = data.token;

    logger.info("Auth token updated:", authToken ? "present" : "null");

    // If agent is initialized, update its MCP connections
    if (agent) {
      try {
        await agent.updateMCPConnections(authToken);
        logger.info("MCP connections updated with new auth token");
      } catch (error) {
        logger.error("Failed to update MCP connections:", error);
        // Don't fail the token update, just log the error
      }
    }

    IPCMessenger.sendResponse(message.id, {
      success: true,
      hadToken: !!oldToken,
      hasToken: !!authToken,
    });
  }
  // Removed API key update handlers - no longer supported
}

// ============================================================================
// ORCHESTRATION - MAIN MESSAGE HANDLER
// ============================================================================

async function handleMessageWithErrorHandling(
  messageWrapper: any,
): Promise<void> {
  let message: BaseMessage;

  try {
    message = MessageValidator.validateMessage(messageWrapper);
  } catch (error) {
    logger.error("Message validation error:", error);
    return;
  }

  // Only log non-ping messages
  if (message.type !== "ping") {
    logger.debug("Processing message:", message.type);
  }

  try {
    switch (message.type) {
      case "initialize":
        await MessageHandlers.handleInitialize(message);
        break;

      case "chat-stream":
        await MessageHandlers.handleChatStream(message);
        break;

      case "get-status":
        await MessageHandlers.handleGetStatus(message);
        break;

      case "reset":
        await MessageHandlers.handleReset(message);
        break;

      case "ping":
        await MessageHandlers.handlePing(message);
        break;

      case "save-tab-memory":
        await MessageHandlers.handleSaveTabMemory(message);
        break;

      case "update-auth-token":
        await MessageHandlers.handleUpdateAuthToken(message);
        break;

      default:
        logger.warn("Unknown message type:", message.type);
        IPCMessenger.sendError(
          message.id,
          `Unknown message type: ${message.type}`,
        );
        break;
    }
  } catch (error) {
    logger.error(`Error handling ${message.type}:`, error);

    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    if (message.type === "chat-stream") {
      IPCMessenger.sendStream(message.id, {
        type: "error",
        error: errorMessage,
      });
    }

    IPCMessenger.sendResponse(message.id, {
      success: false,
      error: errorMessage,
    });
  } finally {
    if (message.type === "chat-stream") {
      isProcessing = false;
    }
  }
}

// ============================================================================
// PROCESS BOOTSTRAP & LIFECYCLE
// ============================================================================

const bootstrap = () => {
  // Note: API key management is now handled by AgentService
  // Worker always waits for initialization message from AgentService
  logger.info(
    "Agent worker process started, waiting for initialization message from AgentService...",
  );

  // Main IPC message handler
  process.parentPort?.on("message", (messageWrapper: any) => {
    logger.debug("🔍 Worker received message:", {
      type: messageWrapper.type,
      hasData: !!messageWrapper.data,
      messageId: messageWrapper.id,
    });

    handleMessageWithErrorHandling(messageWrapper);
  });

  // Process error handlers
  process.on("error", error => {
    logger.error("Process error:", error);
  });

  process.on("uncaughtException", error => {
    logger.error("Uncaught exception:", error);
    process.exit(1);
  });

  process.on("unhandledRejection", (reason, _promise) => {
    logger.error("Unhandled promise rejection:", reason);
    process.exit(1);
  });

  // Clean up on process exit
  process.on("exit", () => {
    logger.info("Agent process exiting");
  });

  // Signal ready state
  logger.info("Worker process started and ready");
  logger.debug("process.parentPort available:", !!process.parentPort);
  logger.debug(
    "process.parentPort.postMessage available:",
    !!process.parentPort?.postMessage,
  );

  if (process.parentPort?.postMessage) {
    try {
      process.parentPort.postMessage({ type: "ready" });
      logger.debug("Ready signal sent successfully");
    } catch (error) {
      logger.error("Failed to send ready signal:", error);
    }
  } else {
    logger.info("No IPC channel available (running standalone)");
  }
};

bootstrap();
