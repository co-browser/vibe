import { EventEmitter } from "events";
import { AgentWorker } from "../agent-worker";
import type { AgentConfig } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("AgentWorkerManager");

/**
 * Agent Worker Manager
 *
 * Handles worker lifecycle management, process communication, and health monitoring.
 * Extracted from AgentService for better separation of concerns.
 */
export class AgentWorkerManager extends EventEmitter {
  private worker: AgentWorker | null = null;
  private isHealthy: boolean = false;
  private lastHealthCheck: number = 0;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private isTerminating: boolean = false;

  constructor() {
    super();
    this.startHealthMonitoring();
  }

  /**
   * Initialize the worker with configuration
   */
  async initialize(config: AgentConfig): Promise<void> {
    if (this.worker) {
      throw new Error("Worker already initialized");
    }

    logger.info("Initializing agent worker");

    try {
      // Create and start AgentWorker instance
      this.worker = new AgentWorker();
      this.setupWorkerEventHandlers();

      // Start the worker process
      await this.worker.start();

      // Send initialization to worker process
      await this.worker.sendMessage("initialize", { config });

      this.isHealthy = true;
      this.lastHealthCheck = Date.now();

      logger.info("Agent worker initialized successfully");
      this.emit("worker-ready", { config });
    } catch (error) {
      logger.error("Worker initialization failed:", error);

      // Cleanup on failure
      if (this.worker) {
        await this.worker.stop().catch(() => {});
        this.worker = null;
      }

      this.isHealthy = false;
      this.emit("worker-error", error);
      throw error;
    }
  }

  /**
   * Send message to worker
   */
  async sendMessage(type: string, data: any): Promise<any> {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }

    if (!this.isHealthy) {
      throw new Error("Worker not healthy");
    }

    try {
      return await this.worker.sendMessage(type, data);
    } catch (error) {
      logger.error(`Worker message failed (${type}):`, error);
      this.isHealthy = false;
      this.emit("worker-error", error);
      throw error;
    }
  }

  /**
   * Send streaming message to worker
   */
  async sendStreamingMessage(
    type: string,
    data: any,
    streamHandler: (messageId: string, data: any) => void,
  ): Promise<void> {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }

    if (!this.isHealthy) {
      throw new Error("Worker not healthy");
    }

    try {
      // Set up stream listener
      this.worker.on("stream", streamHandler);

      try {
        await this.worker.sendMessage(type, data);
      } finally {
        // Always clean up the stream listener
        this.worker.removeListener("stream", streamHandler);
      }
    } catch (error) {
      logger.error(`Worker streaming message failed (${type}):`, error);
      this.isHealthy = false;
      this.emit("worker-error", error);
      throw error;
    }
  }

  /**
   * Get worker connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    restartCount: number;
    isRestarting: boolean;
    lastHealthCheck: number;
  } {
    if (!this.worker) {
      return {
        connected: false,
        restartCount: 0,
        isRestarting: false,
        lastHealthCheck: this.lastHealthCheck,
      };
    }

    return this.worker.getConnectionStatus();
  }

  /**
   * Check if worker is healthy
   */
  isWorkerHealthy(): boolean {
    if (!this.worker || this.isTerminating) {
      return false;
    }

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

      return this.isHealthy;
    } catch {
      return false;
    }
  }

  /**
   * Perform health check
   */
  async performHealthCheck(): Promise<boolean> {
    if (!this.worker || this.isTerminating) {
      this.isHealthy = false;
      return false;
    }

    try {
      await this.worker.sendMessage("ping", { timestamp: Date.now() });
      this.isHealthy = true;
      this.lastHealthCheck = Date.now();
      return true;
    } catch (error) {
      logger.warn("Health check failed:", error);
      this.isHealthy = false;
      this.emit("worker-unhealthy", error);
      return false;
    }
  }

  /**
   * Reset worker state
   */
  async reset(): Promise<void> {
    if (!this.worker) {
      throw new Error("Worker not initialized");
    }

    try {
      await this.worker.sendMessage("reset", {});
      logger.info("Worker state reset successfully");
      this.emit("worker-reset");
    } catch (error) {
      logger.error("Worker reset failed:", error);
      this.isHealthy = false;
      throw error;
    }
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (!this.worker) {
      logger.info("Worker already terminated");
      return;
    }

    logger.info("Terminating agent worker");
    this.isTerminating = true;

    // Stop health monitoring
    this.stopHealthMonitoring();

    try {
      // Set a timeout for worker shutdown
      await Promise.race([
        this.worker.stop(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Worker shutdown timeout")), 10000),
        ),
      ]);

      logger.info("Worker stopped successfully");
    } catch (error) {
      logger.warn("Worker shutdown error:", error);
    } finally {
      this.worker = null;
      this.isHealthy = false;
      this.isTerminating = false;
      this.removeAllListeners();
    }

    this.emit("worker-terminated");
  }

  /**
   * Setup event handlers for worker events
   */
  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on("connected", data => {
      logger.debug("Worker connected:", data);
      this.isHealthy = true;
      this.lastHealthCheck = Date.now();
      this.emit("worker-connected", data);
    });

    this.worker.on("disconnected", data => {
      logger.warn("Worker disconnected:", data);
      this.isHealthy = false;
      this.emit("worker-disconnected", data);
    });

    this.worker.on("unhealthy", error => {
      logger.warn("Worker unhealthy:", error);
      this.isHealthy = false;
      this.emit("worker-unhealthy", error);
    });

    this.worker.on("restarted", data => {
      logger.info("Worker restarted:", data);
      this.isHealthy = true;
      this.lastHealthCheck = Date.now();
      this.emit("worker-restarted", data);
    });

    this.worker.on("error", error => {
      logger.error("Worker error:", error);
      this.isHealthy = false;
      this.emit("worker-error", error);
    });

    // Forward streaming data
    this.worker.on("stream", (messageId, data) => {
      this.emit("stream", messageId, data);
    });
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    // Perform health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      if (this.worker && !this.isTerminating) {
        await this.performHealthCheck().catch(error => {
          logger.debug("Scheduled health check failed:", error);
        });
      }
    }, 30000);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Get worker manager state for debugging
   */
  getManagerState(): {
    hasWorker: boolean;
    isHealthy: boolean;
    lastHealthCheck: number;
    isTerminating: boolean;
  } {
    return {
      hasWorker: this.worker !== null,
      isHealthy: this.isHealthy,
      lastHealthCheck: this.lastHealthCheck,
      isTerminating: this.isTerminating,
    };
  }
}
