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
import { getSetting } from "../ipc/user/shared-utils";
import {
  isValidOpenAIApiKey,
  sanitizeApiKeyForLogging,
} from "../utils/api-key-validation";

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
  private isInitializing: boolean = false;
  private apiKeyUpdateDebounceTimer: NodeJS.Timeout | null = null;

  // Event listener handlers for proper cleanup
  private profileSwitchedHandler?: () => void;
  private apiKeySetHandler?: (data: any) => void;
  private apiKeyRemovedHandler?: (data: any) => void;

  constructor() {
    super();
  }

  /**
   * Initialize the agent service with configuration
   */
  async initialize(config: AgentConfig): Promise<void> {
    // Prevent concurrent initialization
    if (this.isInitializing) {
      logger.warn(
        "Agent service is already initializing, skipping duplicate call",
      );
      return;
    }

    if (this.worker && this.status !== "disconnected") {
      logger.warn("Agent service already initialized, skipping");
      return;
    }

    this.isInitializing = true;

    try {
      this.status = "initializing";
      this.lastActivityTime = Date.now();

      logger.info("Initializing agent service");

      // Get API key using centralized logic from shared-utils
      const finalConfig = { ...config };
      let apiKeySource = "none";

      try {
        const profileApiKey = await getSetting("openai");

        if (profileApiKey) {
          logger.info("Using OpenAI API key from settings");
          finalConfig.openaiApiKey = profileApiKey;
          apiKeySource = "settings";
        } else {
          logger.warn("No OpenAI API key found");
          apiKeySource = "none";
        }
      } catch (error) {
        logger.warn("Failed to get API key from settings:", error);
        // Fallback to config as-is
        if (config.openaiApiKey) {
          apiKeySource = "config-fallback";
        }
      }

      logger.info(`🔑 API key source: ${apiKeySource}`);

      // Validate final config using existing shared types (allow empty API key during init)
      this.validateConfig(finalConfig, true); // true = allowEmptyApiKey
      this.config = finalConfig;

      // Create and start AgentWorker instance
      this.worker = new AgentWorker();

      // Handle worker events (connected, disconnected, etc.)
      this.setupWorkerEventHandlers();

      // Start the worker process
      await this.worker.start();

      // Send initialization to worker process
      const workerConfig: any = {
        model: finalConfig.model,
        processorType: finalConfig.processorType,
      };

      // Only include API key if it's actually present and non-empty
      if (
        finalConfig.openaiApiKey &&
        finalConfig.openaiApiKey.trim().length > 0
      ) {
        workerConfig.openaiApiKey = finalConfig.openaiApiKey;
        logger.info("Initializing agent worker with API key");
      } else {
        logger.warn(
          "Initializing agent worker without API key - will be set when available",
        );
      }

      await this.worker.sendMessage("initialize", { config: workerConfig });

      this.status = "ready";
      this.lastActivityTime = Date.now();
      this.isInitializing = false;
      logger.info("Agent service initialized successfully");

      // Start monitoring profile changes AFTER worker is ready (fire and forget)
      this.monitorProfileChanges().catch(error => {
        logger.warn("Failed to start profile monitoring:", error);
      });
    } catch (error) {
      this.status = "error";
      this.lastActivityTime = Date.now();
      this.isInitializing = false;
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
      hasApiKey: !!this.config?.openaiApiKey, // Add flag without exposing the key
    };

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

      // Cancel any pending API key updates
      if (this.apiKeyUpdateDebounceTimer) {
        clearTimeout(this.apiKeyUpdateDebounceTimer);
        this.apiKeyUpdateDebounceTimer = null;
      }

      // Prevent new operations during shutdown
      const originalStatus = this.status;
      this.status = "disconnected";
      this.lastActivityTime = Date.now();

      // Remove all event listeners to prevent memory leaks
      this.removeAllListeners();

      // Also remove profile service listeners
      try {
        const profileService = await getProfileService();
        if (this.profileSwitchedHandler) {
          profileService.removeListener(
            "profile-switched",
            this.profileSwitchedHandler,
          );
          this.profileSwitchedHandler = undefined;
        }
        if (this.apiKeySetHandler) {
          profileService.removeListener("api-key-set", this.apiKeySetHandler);
          this.apiKeySetHandler = undefined;
        }
        if (this.apiKeyRemovedHandler) {
          profileService.removeListener(
            "api-key-removed",
            this.apiKeyRemovedHandler,
          );
          this.apiKeyRemovedHandler = undefined;
        }
      } catch (error) {
        logger.debug("Failed to remove profile service listeners:", error);
      }

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
  private validateConfig(
    config: AgentConfig,
    allowEmptyApiKey: boolean = false,
  ): void {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config: must be an object");
    }

    if (!allowEmptyApiKey) {
      if (!config.openaiApiKey) {
        throw new Error("Invalid config: openaiApiKey is required");
      }
      if (!isValidOpenAIApiKey(config.openaiApiKey)) {
        throw new Error("Invalid config: openaiApiKey format is invalid");
      }
    } else {
      // During initialization, API key can be empty (will be set later via profile)
      if (config.openaiApiKey !== undefined) {
        if (typeof config.openaiApiKey !== "string") {
          throw new Error(
            "Invalid config: openaiApiKey must be a string when provided",
          );
        }
        // If API key is provided during init, validate it
        if (
          config.openaiApiKey.trim().length > 0 &&
          !isValidOpenAIApiKey(config.openaiApiKey)
        ) {
          throw new Error("Invalid config: openaiApiKey format is invalid");
        }
      }
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
  private async monitorProfileChanges(): Promise<void> {
    logger.info("Monitoring profile changes for API key updates");
    const profileService = await getProfileService();
    const updateApiKey = async (retryCount = 0) => {
      if (!this.worker || this.status === "disconnected") {
        logger.debug("Worker not ready for API key update");
        return;
      }

      const apiKey = await getSetting("openaiApiKey");

      // Check if key actually changed
      if (apiKey === this.config?.openaiApiKey) {
        logger.debug("API key unchanged, skipping update");
        return;
      }

      if (apiKey && apiKey.trim().length > 0) {
        // Use centralized API key validation
        if (!isValidOpenAIApiKey(apiKey)) {
          logger.warn("Invalid OpenAI API key format detected", {
            keyPreview: sanitizeApiKeyForLogging(apiKey),
          });
          return;
        }

        logger.info("Valid OpenAI API key detected, updating agent...", {
          keyPreview: sanitizeApiKeyForLogging(apiKey),
        });
        try {
          // Check if agent is currently processing
          if (this.status === "processing") {
            if (retryCount >= 5) {
              logger.error("Max retries exceeded for API key update");
              return;
            }
            logger.warn(
              "Agent is currently processing, deferring API key update",
            );
            // Retry after a delay
            setTimeout(() => updateApiKey(retryCount + 1), 2000);
            return;
          }

          await this.worker.sendMessage("update-openai-api-key", { apiKey });
          logger.info("✅ OpenAI API key updated successfully");

          // Update our stored config to reflect the new key
          if (this.config) {
            this.config.openaiApiKey = apiKey;

            // Emit status change to notify renderer
            logger.info("Emitting agent status change after API key update");
            this.emit("status-changed", this.getStatus());
          }
        } catch (error) {
          logger.warn(
            "❌ Failed to update OpenAI API key in agent worker:",
            error,
          );
          // Don't throw - this is a non-critical operation that shouldn't break the service
        }
      }
    };

    // Debounced version of updateApiKey
    const debouncedUpdateApiKey = () => {
      if (this.apiKeyUpdateDebounceTimer) {
        clearTimeout(this.apiKeyUpdateDebounceTimer);
      }

      this.apiKeyUpdateDebounceTimer = setTimeout(() => {
        updateApiKey().catch(error => {
          logger.warn("Debounced API key update failed:", error);
        });
      }, 500); // 500ms debounce
    };

    // Listen for changes
    // Initial key check removed - agent already receives key during initialization
    this.profileSwitchedHandler = () => {
      debouncedUpdateApiKey();
    };
    profileService.on("profile-switched", this.profileSwitchedHandler);

    this.apiKeySetHandler = data => {
      if (data.keyType === "openai") {
        logger.info("🔑 OpenAI API key was set in profile, updating agent...");
        debouncedUpdateApiKey();
      }
    };
    profileService.on("api-key-set", this.apiKeySetHandler);

    this.apiKeyRemovedHandler = data => {
      if (data.keyType === "openai") {
        logger.info(
          "🔑 OpenAI API key was removed from profile, clearing agent...",
        );
        // Don't debounce removal - should be immediate
        this.handleApiKeyRemoval().catch(error => {
          logger.warn("API key removal handling failed:", error);
        });
      }
    };
    profileService.on("api-key-removed", this.apiKeyRemovedHandler);
  }

  /**
   * Handle API key removal
   */
  private async handleApiKeyRemoval(): Promise<void> {
    if (!this.worker) {
      return;
    }

    // Cancel any pending API key updates
    if (this.apiKeyUpdateDebounceTimer) {
      clearTimeout(this.apiKeyUpdateDebounceTimer);
      this.apiKeyUpdateDebounceTimer = null;
    }

    try {
      logger.info("Handling OpenAI API key removal");

      // Wait if agent is currently processing
      if (this.status === "processing") {
        logger.warn("Agent is processing, waiting before key removal...");
        // Wait up to 5 seconds for processing to complete
        const waitStart = Date.now();
        while (this.status === "processing" && Date.now() - waitStart < 5000) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (this.status === "processing") {
          logger.warn("Agent still processing after 5s, forcing key removal");
        }
      }

      // Clear the API key from our config
      if (this.config) {
        delete this.config.openaiApiKey;
      }

      // Send message to worker to clear the agent
      await this.worker.sendMessage("clear-agent", {});

      // Update status to reflect no API key
      this.status = "ready";
      logger.info("Agent cleared due to API key removal");

      // Emit status change
      this.emit("status-changed", this.getStatus());
    } catch (error) {
      logger.error("Failed to handle API key removal:", error);
    }
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

  /**
   * Update Gmail OAuth tokens for cloud Gmail MCP service
   */
  async updateGmailTokens(tokens: any): Promise<void> {
    if (!this.worker) {
      throw new Error("Agent service not initialized");
    }

    if (!["ready", "processing"].includes(this.status)) {
      throw new Error(`Agent service not ready: ${this.status}`);
    }

    try {
      logger.info("Updating Gmail tokens:", tokens ? "present" : "null");

      // Send token update to worker process
      await this.worker.sendMessage("update-gmail-tokens", { tokens });

      this.lastActivityTime = Date.now();
      logger.info("Gmail tokens updated successfully");

      // Emit token update event
      this.emit("gmail-tokens-updated", {
        hasTokens: !!tokens,
        timestamp: this.lastActivityTime,
      });
    } catch (error) {
      logger.error("Failed to update Gmail tokens:", error);
      this.lastActivityTime = Date.now();
      throw error;
    }
  }
}
