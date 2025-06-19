/**
 * Agent Worker Process - Utility Process Entry Point
 * Runs the agent in complete isolation from the main browser process
 */

import { AgentFactory, Agent } from "@vibe/agent-core";
import type { ExtractedPage } from "@vibe/shared-types";
import { MEMORY_CONFIG } from "@vibe/shared-types";

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
    openaiApiKey: string;
    model?: string;
    processorType?: string;
    mcpServerUrl?: string;
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

// ============================================================================
// PROCESS STATE
// ============================================================================

let agent: Agent | null = null;
let isProcessing = false;

// ============================================================================
// INFRASTRUCTURE UTILITIES
// ============================================================================

class IPCMessenger {
  static sendResponse(id: string, data: any): void {
    if (process.parentPort?.postMessage) {
      process.parentPort.postMessage({
        id,
        type: "response",
        data,
      });
    } else {
      console.warn("[AgentWorker] No IPC channel available for response");
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

    if (
      !config.openaiApiKey ||
      typeof config.openaiApiKey !== "string" ||
      config.openaiApiKey.trim().length === 0
    ) {
      throw new Error("Valid OpenAI API key is required");
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

    agent = AgentFactory.create({
      openaiApiKey: config.openaiApiKey.trim(),
      model: config.model || "gpt-4o-mini",
      processorType: MessageValidator.validateProcessorType(
        config.processorType,
      ),
      mcpServerUrl: config.mcpServerUrl || MEMORY_CONFIG.MCP_SERVER_URL,
    });

    console.log(
      "[AgentWorker] Agent initialized successfully in utility process",
    );

    IPCMessenger.sendResponse(message.id, { success: true });
  }

  static async handleChatStream(message: BaseMessage): Promise<void> {
    MessageValidator.validateAgent();

    const userMessage = MessageValidator.validateChatMessage(
      (message.data as ChatStreamData)?.message,
    );

    isProcessing = true;
    console.log(
      "[AgentWorker] Processing chat message:",
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

    console.log("[AgentWorker] Chat stream completed");

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
  }

  static async handleGetStatus(message: BaseMessage): Promise<void> {
    let status: string;
    let ready: boolean = false;

    if (!agent) {
      status = "not_initialized";
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

    console.log("[AgentWorker] Status requested:", statusResponse);
    IPCMessenger.sendResponse(message.id, statusResponse);
  }

  static async handleReset(message: BaseMessage): Promise<void> {
    console.log("[AgentWorker] Reset requested");

    if (agent) {
      agent.reset();
      console.log("[AgentWorker] Agent processor and tool caches cleared");
    }

    isProcessing = false;

    console.log("[AgentWorker] Agent state reset completed");

    IPCMessenger.sendResponse(message.id, {
      success: true,
      message: "Agent state reset successfully",
      hadAgent: agent !== null,
    });
  }

  static async handlePing(message: BaseMessage): Promise<void> {
    console.log("[AgentWorker] Health check ping received");

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

    console.log("[AgentWorker] Saving tab memory:", extractedPage.title);

    await agent!.saveTabMemory(extractedPage);

    console.log("[AgentWorker] Tab memory saved successfully");
    IPCMessenger.sendResponse(message.id, { success: true });
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
    console.error("[AgentWorker] Message validation error:", error);
    return;
  }

  console.log("[AgentWorker] Processing message:", message.type);

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

      default:
        console.log("[AgentWorker] Unknown message type:", message.type);
        IPCMessenger.sendError(
          message.id,
          `Unknown message type: ${message.type}`,
        );
        break;
    }
  } catch (error) {
    console.error(`[AgentWorker] Error handling ${message.type}:`, error);

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

// Main IPC message handler
process.parentPort?.on("message", handleMessageWithErrorHandling);

// Process error handlers
process.on("error", error => {
  console.error("[AgentWorker] Process error:", error);
});

process.on("uncaughtException", error => {
  console.error("[AgentWorker] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, _promise) => {
  console.error("[AgentWorker] Unhandled promise rejection:", reason);
  process.exit(1);
});

// Signal ready state
console.log("[AgentWorker] Worker process started and ready");
console.log(
  "[AgentWorker] process.parentPort available:",
  !!process.parentPort,
);
console.log(
  "[AgentWorker] process.parentPort.postMessage available:",
  !!process.parentPort?.postMessage,
);

if (process.parentPort?.postMessage) {
  try {
    process.parentPort.postMessage({ type: "ready" });
    console.log("[AgentWorker] Ready signal sent successfully");
  } catch (error) {
    console.error("[AgentWorker] Failed to send ready signal:", error);
  }
} else {
  console.log("[AgentWorker] No IPC channel available (running standalone)");
}
