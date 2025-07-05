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
    openaiApiKey?: string; // Made optional
    model?: string;
    processorType?: ProcessorType;
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

interface UpdateOpenAIApiKeyData {
  apiKey: string;
}

// ============================================================================
// PROCESS STATE
// ============================================================================

let agent: Agent | null = null;
let agentConfig: InitializeData["config"] | null = null;
let isProcessing = false;
let authToken: string | null = null;
let isCreatingAgent = false;
let isDestroyingAgent = false;

// Retry mechanism constants
const MAX_UPDATE_RETRIES = 3;
const MAX_CLEAR_RETRIES = 3;

// ============================================================================
// INFRASTRUCTURE UTILITIES
// ============================================================================

const createAgent = async () => {
  if (!agentConfig?.openaiApiKey) {
    logger.warn("Agent creation skipped: OpenAI API key not available.");
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
      model: agentConfig?.model || "gpt-4o-mini",
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
    // openaiApiKey is now optional for initialization
    if (
      config.openaiApiKey !== undefined &&
      typeof config.openaiApiKey !== "string"
    ) {
      throw new Error("OpenAI API key must be a string if provided");
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

    // Merge new config with existing config (from env vars)
    agentConfig = {
      ...agentConfig,
      ...config,
      openaiApiKey: config.openaiApiKey?.trim() || agentConfig?.openaiApiKey,
      model: config.model || agentConfig?.model || "gpt-4o-mini",
      processorType: MessageValidator.validateProcessorType(
        config.processorType || agentConfig?.processorType,
      ),
    };

    // Attempt to create the agent if not already created and we have an API key
    if (!agent && agentConfig?.openaiApiKey) {
      await createAgent();
    }

    if (agentConfig?.openaiApiKey) {
      logger.info(
        "Agent initialized successfully in utility process with API key",
      );
    } else {
      logger.info(
        "Agent worker initialized successfully, waiting for API key to create agent",
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
      status = agentConfig?.openaiApiKey
        ? "not_initialized"
        : "waiting_for_api_key";
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
  //function that asks for the api key and watches for changes
  // RPM
  static async handleUpdateOpenAIApiKey(
    message: BaseMessage,
    retryCount = 0,
  ): Promise<void> {
    logger.info(
      "🔑 handleUpdateOpenAIApiKey called - processing API key update...",
    );
    const data = message.data as UpdateOpenAIApiKeyData;
    const apiKey = data.apiKey;

    logger.debug(
      "API key data received:",
      apiKey ? "present" : "null/undefined",
    );

    if (!apiKey || typeof apiKey !== "string" || apiKey.trim().length === 0) {
      logger.error("Invalid API key received for update");
      throw new Error("Valid OpenAI API key is required for update");
    }

    const trimmedKey = apiKey.trim();

    // Check if key actually changed
    if (agentConfig?.openaiApiKey === trimmedKey) {
      logger.info("API key unchanged, skipping update");
      IPCMessenger.sendResponse(message.id, { success: true });
      return;
    }

    // Wait if agent is being created or destroyed
    if (isCreatingAgent || isDestroyingAgent) {
      logger.warn("Agent operation in progress, deferring API key update");
      if (retryCount >= MAX_UPDATE_RETRIES) {
        logger.error("Max retries exceeded for API key update");
        IPCMessenger.sendError(message.id, "Max retries exceeded");
        return;
      }
      // Use async delay instead of setTimeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      return MessageHandlers.handleUpdateOpenAIApiKey(message, retryCount + 1);
    }

    // Wait if agent is processing
    if (isProcessing) {
      logger.warn("Agent is processing, waiting before API key update...");
      // Wait up to 5 seconds for processing to complete
      await Promise.race([
        new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (!isProcessing) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        }),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);

      if (isProcessing) {
        logger.warn("Agent still processing after 5s, proceeding with update");
      }
    }

    isDestroyingAgent = true;
    try {
      // Always restart the agent to ensure clean MCP connections
      if (agent) {
        // Destroy existing agent
        agent = null;
        logger.info("Destroying existing agent for clean restart");
      }

      // Update config with new key
      agentConfig = { ...agentConfig, openaiApiKey: trimmedKey };

      isDestroyingAgent = false;

      // Create fresh agent instance - this will reinitialize all MCP connections
      await createAgent();

      if (agent) {
        logger.info("Agent restarted successfully with new OpenAI API key");
      } else {
        logger.warn("Failed to create agent with new API key");
      }

      IPCMessenger.sendResponse(message.id, { success: true });
    } catch (error) {
      isDestroyingAgent = false;
      throw error;
    }
  }

  static async handleClearAgent(
    message: BaseMessage,
    retryCount = 0,
  ): Promise<void> {
    logger.info("🔑 Clearing agent due to API key removal");

    // Wait if agent is being created
    if (isCreatingAgent) {
      logger.warn("Agent creation in progress, deferring clear operation");
      if (retryCount >= MAX_CLEAR_RETRIES) {
        logger.error("Max retries exceeded for clear agent");
        IPCMessenger.sendError(message.id, "Max retries exceeded");
        return;
      }
      // Use async delay instead of setTimeout
      await new Promise(resolve => setTimeout(resolve, 500));
      return MessageHandlers.handleClearAgent(message, retryCount + 1);
    }

    // Wait if agent is processing
    if (isProcessing) {
      logger.warn("Agent is processing, waiting before clearing...");
      // Wait up to 5 seconds for processing to complete
      await Promise.race([
        new Promise<void>(resolve => {
          const checkInterval = setInterval(() => {
            if (!isProcessing) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        }),
        new Promise<void>(resolve => setTimeout(resolve, 5000)),
      ]);

      if (isProcessing) {
        logger.warn("Agent still processing after 5s, forcing clear");
      }
    }

    isDestroyingAgent = true;
    try {
      if (agent) {
        agent = null;
        logger.info("Agent cleared successfully");
      }

      // Clear the API key from config
      if (agentConfig) {
        delete agentConfig.openaiApiKey;
        logger.info("Removed API key from agent config");
      }

      IPCMessenger.sendResponse(message.id, {
        success: true,
      });
    } finally {
      isDestroyingAgent = false;
    }
  }
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

      case "update-openai-api-key":
        await MessageHandlers.handleUpdateOpenAIApiKey(message);
        break;

      case "clear-agent":
        await MessageHandlers.handleClearAgent(message);
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

    if (
      messageWrapper.type === "settings:changed" &&
      messageWrapper.data?.key === "openaiApiKey"
    ) {
      logger.info("📨 Processing settings:changed message for OpenAI API key");
      MessageHandlers.handleUpdateOpenAIApiKey({
        id: "settings-update",
        type: "update-openai-api-key",
        data: { apiKey: messageWrapper.data.newValue },
      });
    } else {
      if (messageWrapper.type === "update-openai-api-key") {
        logger.info(
          "📨 Received direct update-openai-api-key message, routing to handler",
        );
      }
      handleMessageWithErrorHandling(messageWrapper);
    }
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
