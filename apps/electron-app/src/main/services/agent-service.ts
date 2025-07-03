/**
 * Agent Service - High-level coordinator for agent operations
 * Uses AgentWorker internally to manage utility process communication
 */

import { EventEmitter } from "events";
import { AgentWorker } from "./agent-worker";
import type {
  AgentConfig,
  AgentStatus,
  IAgentService,
  ExtractedPage,
} from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";
import { getProfileService } from "./profile-service";

const logger = createLogger("AgentService");

export class AgentService extends EventEmitter implements IAgentService {
  private worker: AgentWorker | null = null;
  private config: AgentConfig | null = null;
  private status:
    | "disconnected"
    | "initializing"
    | "ready"
    | "processing"
    | "error" = "disconnected";
  private lastActivityTime: number = 0;

  constructor() {
    super();
  }

  /**
   * Initialize the agent service with configuration
   */
  async initialize(config: AgentConfig): Promise<void> {
    try {
      // Validate config using existing shared types
      this.validateConfig(config);

      this.status = "initializing";
      this.config = config;
      this.lastActivityTime = Date.now();

      logger.info("Initializing agent service");

      // Create and start AgentWorker instance
      this.worker = new AgentWorker();

      // Handle worker events (connected, disconnected, etc.)
      this.setupWorkerEventHandlers();

      // Start the worker process
      await this.worker.start();

      // Send initialization to worker process
      await this.worker.sendMessage("initialize", {
        config: {
          openaiApiKey: config.openaiApiKey || undefined,
          model: config.model,
          processorType: config.processorType,
        },
      });

      this.status = "ready";
      this.lastActivityTime = Date.now();
      logger.info("Agent service initialized successfully");
      this.monitorProfileChanges();
    } catch (error) {
      this.status = "error";
      this.lastActivityTime = Date.now();
      logger.error("Initialization failed:", error);

      // Cleanup on failure
      if (this.worker) {
        await this.worker.stop().catch(() => {});
        this.worker = null;
      }

      // Emit error event
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Send message to agent and handle response
   */
  async sendMessage(message: string): Promise<void> {
    // Validate worker is ready
    if (!this.worker) {
      throw new Error("Agent service not initialized");
    }

    if (this.status !== "ready") {
      throw new Error(`Agent service not ready: ${this.status}`);
    }

    // Validate message input
    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      throw new Error("Message must be a non-empty string");
    }

    if (message.length > 50000) {
      throw new Error("Message too long (max 50000 characters)");
    }

    try {
      this.status = "processing";
      this.lastActivityTime = Date.now();
      logger.info("Processing message:", message.substring(0, 100) + "...");

      // Set up stream listener before sending message
      const streamHandler = (_messageId: string, data: any) => {
        logger.debug("Stream data:", data.type);

        // Update activity time on stream data
        this.lastActivityTime = Date.now();

        // Forward streaming response to listeners
        this.emit("message-stream", data);
      };

      // Set up stream listener
      this.worker.on("stream", streamHandler);

      try {
        // Send message to worker and wait for completion
        // This now properly resolves when the stream is complete
        await this.worker.sendMessage("chat-stream", {
          message: message.trim(),
        });

        this.status = "ready";
        this.lastActivityTime = Date.now();
        logger.info("Message processing completed");
      } finally {
        // Always clean up the stream listener
        this.worker.removeListener("stream", streamHandler);
      }
    } catch (error) {
      this.status = "ready";
      this.lastActivityTime = Date.now();
      logger.error("Message processing failed:", error);
      throw error;
    }
  }

  /**
   * Get current agent service status
   */
  getStatus(): AgentStatus {
    const baseStatus: AgentStatus = {
      ready: this.status === "ready",
      initialized: this.worker !== null && this.config !== null,
      serviceStatus: this.status,
    };

    // Get worker status if available
    let workerStatus:
      | {
          connected: boolean;
          restartCount: number;
          isRestarting: boolean;
          lastHealthCheck: number;
        }
      | undefined = undefined;
    if (this.worker) {
      try {
        workerStatus = this.worker.getConnectionStatus();
      } catch (error) {
        logger.warn("Failed to get worker status:", error);
      }
    }

    // Determine overall health
    const isHealthy = this.isHealthy();

    // Combine service state with worker status
    const status: AgentStatus = {
      ...baseStatus,
      workerStatus,
      config: this.config ? this.sanitizeConfig(this.config) : undefined,
      lastActivity: this.lastActivityTime,
      isHealthy,
    };

    logger.debug("Status requested:", status);
    return status;
  }

  /**
   * Check if the agent service is healthy
   */
  private isHealthy(): boolean {
    // Service must be ready or processing
    if (!["ready", "processing"].includes(this.status)) {
      return false;
    }

    // Must have worker and config
    if (!this.worker || !this.config) {
      return false;
    }

    // Check worker health
    try {
      const workerStatus = this.worker.getConnectionStatus();

      // Worker must be connected
      if (!workerStatus.connected) {
        return false;
      }

      // Check if worker is restarting too frequently
      if (workerStatus.restartCount > 2) {
        return false;
      }

      // Check if recent health check was successful (within last 2 minutes)
      const now = Date.now();
      if (
        workerStatus.lastHealthCheck > 0 &&
        now - workerStatus.lastHealthCheck > 120000
      ) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Terminate the agent service
   */
  async terminate(): Promise<void> {
    try {
      logger.info("Terminating agent service");

      // Prevent new operations during shutdown
      const originalStatus = this.status;
      this.status = "disconnected";
      this.lastActivityTime = Date.now();

      // Remove all event listeners to prevent memory leaks
      this.removeAllListeners();

      // Stop AgentWorker cleanly with timeout
      if (this.worker) {
        try {
          // Set a timeout for worker shutdown
          await Promise.race([
            this.worker.stop(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Worker shutdown timeout")),
                10000,
              ),
            ),
          ]);

          logger.info("Worker stopped successfully");
        } catch (workerError) {
          logger.warn("Worker shutdown error:", workerError);
          // Continue with cleanup even if worker shutdown fails
        } finally {
          this.worker = null;
        }
      }

      // Clear internal state completely
      this.config = null;
      this.lastActivityTime = Date.now();

      // Emit service stopped events (create new emitter instance to ensure delivery)
      const terminatedEvent = {
        timestamp: this.lastActivityTime,
        previousStatus: originalStatus,
        graceful: true,
      };

      // Use setImmediate to ensure event is emitted before cleanup completes
      setImmediate(() => {
        this.emit("terminated", terminatedEvent);
      });

      logger.info("Agent service terminated successfully");
    } catch (error) {
      logger.error("Error during termination:", error);

      // Force cleanup even on error
      this.status = "error";
      this.lastActivityTime = Date.now();

      if (this.worker) {
        this.worker = null;
      }
      this.config = null;

      // Emit error termination event
      setImmediate(() => {
        this.emit("terminated", {
          timestamp: this.lastActivityTime,
          graceful: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });

      throw error;
    }
  }

  /**
   * Get service lifecycle state for debugging
   */
  getLifecycleState(): {
    hasWorker: boolean;
    hasConfig: boolean;
    status: string;
    lastActivity: number;
    uptime?: number;
  } {
    const initTime = this.config ? this.lastActivityTime : 0;
    return {
      hasWorker: this.worker !== null,
      hasConfig: this.config !== null,
      status: this.status,
      lastActivity: this.lastActivityTime,
      uptime: initTime > 0 ? Date.now() - initTime : undefined,
    };
  }

  /**
   * Validate agent configuration
   */
  private validateConfig(config: AgentConfig): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config: must be an object");
    }

    if (
      !config.openaiApiKey ||
      typeof config.openaiApiKey !== "string" ||
      config.openaiApiKey.trim().length === 0
    ) {
      throw new Error(
        "Invalid config: openaiApiKey is required and must be a non-empty string",
      );
    }

    if (config.model && typeof config.model !== "string") {
      throw new Error("Invalid config: model must be a string");
    }

    if (
      config.temperature !== undefined &&
      (typeof config.temperature !== "number" ||
        config.temperature < 0 ||
        config.temperature > 2)
    ) {
      throw new Error(
        "Invalid config: temperature must be a number between 0 and 2",
      );
    }

    if (
      config.processorType &&
      !["react", "coact"].includes(config.processorType)
    ) {
      throw new Error(
        'Invalid config: processorType must be "react" or "coact"',
      );
    }
  }

  /**
   * Setup event handlers for worker events
   */
  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    // Handle worker connection events
    this.worker.on("connected", data => {
      logger.debug("Worker connected:", data);
      this.lastActivityTime = Date.now();
      this.emit("connected", data);
    });

    this.worker.on("disconnected", data => {
      logger.warn("Worker disconnected:", data);
      this.status = "error";
      this.lastActivityTime = Date.now();
      this.emit("disconnected", data);
    });

    this.worker.on("unhealthy", error => {
      logger.warn("Worker unhealthy:", error);
      this.status = "error";
      this.lastActivityTime = Date.now();
      this.emit("unhealthy", error);
    });

    this.worker.on("restarted", data => {
      logger.debug("Worker restarted:", data);
      this.status = "ready";
      this.lastActivityTime = Date.now();
      this.emit("restarted", data);
    });

    this.worker.on("error", error => {
      logger.error("Worker error:", error);
      this.status = "error";
      this.lastActivityTime = Date.now();
      this.emit("error", error);
    });

    // Handle streaming data from worker
    this.worker.on("stream", (messageId, data) => {
      logger.debug("Stream data received:", messageId, data.type);
      this.lastActivityTime = Date.now();
      this.emit("stream", messageId, data);
    });
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  private sanitizeConfig(config: AgentConfig): Partial<AgentConfig> {
    return {
      model: config.model,
      temperature: config.temperature,
      processorType: config.processorType,
      // Exclude openaiApiKey for security
    };
  }

  /**
   * Monitor profile changes for API key updates
   */
  private monitorProfileChanges(): void {
    const profileService = getProfileService();

    const updateApiKey = async () => {
      if (!this.worker) return;

      const apiKey = profileService.getApiKey("openai");
      if (apiKey) {
        logger.info("OpenAI API key found, importing to agent.");
        try {
          await this.worker.sendMessage("update-openai-api-key", { apiKey });
          logger.info("OpenAI API key updated successfully");
        } catch (error) {
          logger.warn("Failed to update OpenAI API key:", error);
          // Don't throw - this is a non-critical operation that shouldn't break the service
        }
      } else {
        logger.info("No OpenAI API key found for the current profile.");
      }
    };

    // Initial check
    updateApiKey().catch(error => {
      logger.warn("Initial API key update failed:", error);
    });

    // Listen for changes
    profileService.on("profile-switched", () => {
      updateApiKey().catch(error => {
        logger.warn("Profile switch API key update failed:", error);
      });
    });
    profileService.on("api-key-set", data => {
      if (data.keyType === "openai") {
        updateApiKey().catch(error => {
          logger.warn("API key set update failed:", error);
        });
      }
    });
  }

  /**
   * Check if the service can be safely terminated
   */
  canTerminate(): { canTerminate: boolean; reason?: string } {
    // Always allow termination, but warn about ongoing operations
    if (this.status === "processing") {
      return {
        canTerminate: true,
        reason:
          "Service is currently processing a message - termination will interrupt it",
      };
    }

    if (this.status === "initializing") {
      return {
        canTerminate: true,
        reason:
          "Service is still initializing - termination may leave resources in inconsistent state",
      };
    }

    return { canTerminate: true };
  }

  /**
   * Reset agent state without terminating the service
   */
  async reset(): Promise<void> {
    if (!this.worker) {
      throw new Error("Agent service not initialized");
    }

    if (this.status === "processing") {
      throw new Error(
        "Cannot reset while processing - wait for completion or terminate first",
      );
    }

    try {
      logger.info("Resetting agent state");

      // Send reset command to worker
      await this.worker.sendMessage("reset", {});

      this.lastActivityTime = Date.now();
      logger.info("Agent state reset successfully");

      // Emit reset event
      this.emit("reset", {
        timestamp: this.lastActivityTime,
      });
    } catch (error) {
      logger.error("Reset failed:", error);
      this.lastActivityTime = Date.now();
      throw error;
    }
  }

  /**
   * Force immediate termination without graceful shutdown
   */
  async forceTerminate(): Promise<void> {
    logger.warn("Force terminating agent service");

    const originalStatus = this.status;
    this.status = "disconnected";
    this.lastActivityTime = Date.now();

    // Immediate cleanup without waiting
    this.removeAllListeners();

    if (this.worker) {
      try {
        // Force kill worker without waiting
        this.worker.stop().catch(() => {}); // Fire and forget
      } catch {
        // Ignore errors during force termination
      }
      this.worker = null;
    }

    this.config = null;

    // Emit forced termination event
    setImmediate(() => {
      this.emit("terminated", {
        timestamp: this.lastActivityTime,
        previousStatus: originalStatus,
        graceful: false,
        forced: true,
      });
    });

    logger.warn("Agent service force terminated");
  }

  /**
   * Save tab memory (for compatibility with tab-agent integration)
   */
  async saveTabMemory(extractedPage: ExtractedPage): Promise<void> {
    if (!this.worker) {
      throw new Error("Agent service not initialized");
    }

    if (this.status !== "ready") {
      throw new Error(`Agent service not ready: ${this.status}`);
    }

    // Validate inputs
    if (!extractedPage || typeof extractedPage !== "object") {
      throw new Error("Valid ExtractedPage is required");
    }
    if (!extractedPage.url || typeof extractedPage.url !== "string") {
      throw new Error("ExtractedPage must have a valid URL");
    }
    if (!extractedPage.title || typeof extractedPage.title !== "string") {
      throw new Error("ExtractedPage must have a valid title");
    }

    try {
      logger.info("Saving tab memory:", extractedPage.title);

      // Send the full ExtractedPage to the worker process
      await this.worker.sendMessage("save-tab-memory", {
        extractedPage,
      });

      this.lastActivityTime = Date.now();
      logger.info("Tab memory saved successfully");
    } catch (error) {
      logger.error("Failed to save tab memory:", error);
      this.lastActivityTime = Date.now();
      throw error;
    }
  }

  /**
   * Update authentication token for cloud MCP services
   */
  async updateAuthToken(token: string | null): Promise<void> {
    if (!this.worker) {
      throw new Error("Agent service not initialized");
    }

    if (!["ready", "processing"].includes(this.status)) {
      throw new Error(`Agent service not ready: ${this.status}`);
    }

    try {
      logger.info("Updating auth token:", token ? "present" : "null");

      // Send token update to worker process
      await this.worker.sendMessage("update-auth-token", { token });

      this.lastActivityTime = Date.now();
      logger.info("Auth token updated successfully");

      // Emit token update event
      this.emit("auth-token-updated", {
        hasToken: !!token,
        timestamp: this.lastActivityTime,
      });
    } catch (error) {
      logger.error("Failed to update auth token:", error);
      this.lastActivityTime = Date.now();
      throw error;
    }
  }
}
