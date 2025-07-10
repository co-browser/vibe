/**
 * Agent Worker - Manages the utility process for agent operations
 * Handles IPC communication, process lifecycle, and message queuing
 */

import { EventEmitter } from "events";
import { utilityProcess, type UtilityProcess } from "electron";
import { setupProcessStorageHandler } from "../ipc/user/settings/process-storage-handler";
import path from "path";
import fs from "fs";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("AgentWorker");

interface PendingMessage {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

export class AgentWorker extends EventEmitter {
  private workerProcess: UtilityProcess | null = null;
  private messageQueue: Map<string, PendingMessage> = new Map();
  private isConnected: boolean = false;
  private restartCount: number = 0;
  private readonly maxRestarts: number = 3;
  private isRestarting: boolean = false;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private lastHealthCheck: number = 0;
  private readonly healthCheckIntervalMs: number = 30000; // 30 seconds
  private readonly healthCheckTimeoutMs: number = 5000; // 5 seconds
  private activeTimeouts: Set<NodeJS.Timeout> = new Set();

  constructor() {
    super();
  }

  /**
   * Start the worker process
   */
  async start(): Promise<void> {
    try {
      await this.createWorkerProcess();
      this.startHealthMonitoring();
      logger.info("Worker process started successfully");
    } catch (error) {
      logger.error("Failed to start worker:", error);
      throw error;
    }
  }

  /**
   * Stop the worker process
   */
  async stop(): Promise<void> {
    if (this.workerProcess) {
      this.isConnected = false;
      this.isRestarting = false;

      // Stop health monitoring
      this.stopHealthMonitoring();

      // Clear all active timeouts
      this.activeTimeouts.forEach(timeout => {
        clearTimeout(timeout);
      });
      this.activeTimeouts.clear();

      // Clear pending messages
      for (const pending of Array.from(this.messageQueue.values())) {
        clearTimeout(pending.timeout);
        pending.reject(new Error("Worker stopped"));
      }
      this.messageQueue.clear();

      this.workerProcess.kill();
      this.workerProcess = null;
    }
  }

  /**
   * Send message to worker process with Promise-based response
   */
  async sendMessage(type: string, data: any): Promise<any> {
    if (!this.isConnected || !this.workerProcess) {
      throw new Error("Worker not connected");
    }

    // Validate IPC channel exists
    if (!this.workerProcess.pid) {
      throw new Error("Worker process not properly initialized");
    }

    return new Promise((resolve, reject) => {
      // Generate unique message ID
      const messageId = crypto.randomUUID();

      // Set up timeout for message response
      const timeout = setTimeout(() => {
        this.messageQueue.delete(messageId);
        reject(new Error(`Message timeout: ${type}`));
      }, 60000); // 60 second timeout

      // Track pending message
      this.messageQueue.set(messageId, { resolve, reject, timeout });

      // Create message with explicit property assignment and validation
      const message = {
        id: messageId,
        type: type, // Explicit assignment
        data: data || {}, // Ensure data exists
      };

      // Add validation before sending
      if (!message.type) {
        throw new Error(`Invalid message type: ${type}`);
      }

      // Add debugging for message structure (only for non-ping messages)
      if (type !== "ping") {
        logger.debug("Sending message to worker:", type, "ID:", messageId);
        if (type === "update-openai-api-key") {
          logger.debug("🔑 Detailed message structure for API key update:", {
            id: messageId,
            type: type,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            hasApiKey: data && !!data.apiKey,
          });
        }
      }

      this.workerProcess!.postMessage(message);
    });
  }

  /**
   * Perform health check on worker process
   */
  async performHealthCheck(): Promise<boolean> {
    if (!this.isConnected || !this.workerProcess) {
      return false;
    }

    try {
      // Send ping and wait for pong response
      await Promise.race([
        this.sendMessage("ping", { timestamp: Date.now() }),
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Health check timeout")),
            this.healthCheckTimeoutMs,
          ),
        ),
      ]);

      this.lastHealthCheck = Date.now();
      return true;
    } catch (error) {
      logger.warn("Health check failed:", error);
      return false;
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    restartCount: number;
    isRestarting: boolean;
    lastHealthCheck: number;
  } {
    return {
      connected: this.isConnected,
      restartCount: this.restartCount,
      isRestarting: this.isRestarting,
      lastHealthCheck: this.lastHealthCheck,
    };
  }

  /**
   * Start health monitoring
   */
  private startHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      const isHealthy = await this.performHealthCheck();

      if (!isHealthy && this.isConnected) {
        logger.warn("Worker failed health check");
        this.emit("unhealthy", new Error("Worker failed health check"));

        // Mark as disconnected and potentially restart
        this.isConnected = false;
        if (this.restartCount < this.maxRestarts) {
          this.attemptRestart();
        }
      }
    }, this.healthCheckIntervalMs);

    logger.debug("Health monitoring started");
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info("Health monitoring stopped");
    }
  }

  /**
   * Create the utility process for agent operations
   */
  private async createWorkerProcess(): Promise<void> {
    // Use absolute path to avoid __dirname inconsistencies during restarts
    const workerPath = path.resolve(__dirname, "./processes/agent-process.js");

    // Verify file exists before creating process
    if (!fs.existsSync(workerPath)) {
      throw new Error(`Worker process file not found: ${workerPath}`);
    }

    logger.debug("Creating utility process:", workerPath);
    logger.debug("Current __dirname:", __dirname);
    logger.debug("Resolved worker path:", workerPath);

    // Create utility process using Electron's utilityProcess.fork()
    // Filter out undefined environment variables to avoid "Invalid value for env" error
    const cleanEnv: Record<string, string> = {};
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || "development",
      LOG_LEVEL: process.env.LOG_LEVEL,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      RAG_SERVER_URL: process.env.RAG_SERVER_URL || "https://rag.cobrowser.xyz",
      TURBOPUFFER_API_KEY: process.env.TURBOPUFFER_API_KEY,
      USE_LOCAL_RAG_SERVER: process.env.USE_LOCAL_RAG_SERVER || "false",
    };

    // Only include defined environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    this.workerProcess = utilityProcess.fork(workerPath, [], {
      stdio: "pipe",
      serviceName: "agent-worker",
      env: cleanEnv,
    });

    // Set up settings access for the utility process
    setupProcessStorageHandler(this.workerProcess);

    // Capture stdout and stderr to see actual errors from utility process
    if (this.workerProcess.stdout) {
      this.workerProcess.stdout.on("data", data => {
        const output = data.toString();
        // Only log important messages
        if (output.includes("ERROR") || output.includes("WARN")) {
          logger.info("Worker stdout:", output);
        } else {
          logger.debug("Worker stdout:", output);
        }
      });
    }

    if (this.workerProcess.stderr) {
      this.workerProcess.stderr.on("data", data => {
        logger.error("Worker stderr:", data.toString());
      });
    }

    // Set up basic process event handlers
    this.workerProcess.on("message", this.handleWorkerMessage.bind(this));
    this.workerProcess.on("exit", this.handleWorkerExit.bind(this));

    // Wait for worker ready signal with enhanced detection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker startup timeout"));
      }, 10000); // 10 second timeout

      const readyHandler = (message: any) => {
        if (message.type === "ready") {
          clearTimeout(timeout);
          this.isConnected = true;
          this.lastHealthCheck = Date.now();
          this.workerProcess!.removeListener("message", readyHandler);

          // Emit connected event
          this.emit("connected", {
            pid: this.workerProcess!.pid,
            restartCount: this.restartCount,
          });

          resolve();
        }
      };

      this.workerProcess!.on("message", readyHandler);
    });

    logger.info("Worker process connected and ready");
  }

  /**
   * Handle messages from worker process
   */
  private handleWorkerMessage(message: any): void {
    // Only log non-ping messages
    if (message.type !== "response") {
      logger.debug("Received message from worker:", message.type);
    }

    // Handle different message types
    if (message.type === "response" && message.id) {
      // Handle response to a pending message
      const pending = this.messageQueue.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.messageQueue.delete(message.id);

        if (message.error) {
          pending.reject(new Error(message.error));
        } else {
          pending.resolve(message.data);
        }
      }
    } else if (message.type === "stream" && message.id) {
      // Handle streaming data - emit as event for now
      this.emit("stream", message.id, message.data);
    } else if (message.type === "ready") {
      // Ready signal - enhanced detection for health monitoring
      logger.debug("Worker ready signal received");
      this.lastHealthCheck = Date.now();

      if (!this.isConnected) {
        this.isConnected = true;
        this.emit("connected", {
          pid: this.workerProcess?.pid,
          restartCount: this.restartCount,
        });
      }
    } else if (message.type === "pong") {
      // Health check response
      logger.debug("Health check pong received");
    } else {
      logger.warn("Unknown message type from worker:", message.type);
    }
  }

  /**
   * Handle worker process exit with restart logic
   */
  private handleWorkerExit(code: number): void {
    logger.warn(`Worker process exited with code ${code}`);
    this.isConnected = false;

    // Stop health monitoring
    this.stopHealthMonitoring();

    // Reject all pending messages
    for (const pending of Array.from(this.messageQueue.values())) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("Worker process crashed"));
    }
    this.messageQueue.clear();

    // Emit disconnected event
    this.emit("disconnected", { code, restartCount: this.restartCount });

    // Auto-restart if not too many failures and not manually stopped
    if (
      this.restartCount < this.maxRestarts &&
      !this.isRestarting &&
      this.workerProcess !== null
    ) {
      this.attemptRestart();
    } else if (this.restartCount >= this.maxRestarts) {
      logger.error("Max restart attempts reached");
      this.emit("error", new Error("Worker process repeatedly crashed"));
    }
  }

  /**
   * Attempt to restart the worker process
   */
  private async attemptRestart(): Promise<void> {
    if (this.isRestarting) return;

    this.isRestarting = true;
    this.restartCount++;

    logger.info(
      `Auto-restarting worker (attempt ${this.restartCount}/${this.maxRestarts})`,
    );

    try {
      // Wait a bit before restarting
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Reset worker process reference
      this.workerProcess = null;

      // Attempt to create new worker process
      await this.createWorkerProcess();

      // Start health monitoring again
      this.startHealthMonitoring();

      // Reset restart flag on success
      this.isRestarting = false;

      logger.info("Worker successfully restarted");
      this.emit("restarted", { restartCount: this.restartCount });
    } catch (error) {
      this.isRestarting = false;
      logger.error(`Restart attempt ${this.restartCount} failed:`, error);

      // Try again if we haven't hit the limit
      if (this.restartCount < this.maxRestarts) {
        this.createTimeout(() => this.attemptRestart(), 2000); // Wait longer before next attempt
      } else {
        this.emit("error", new Error("All restart attempts failed"));
      }
    }
  }

  /**
   * Create a tracked timeout that will be automatically cleaned up
   */
  private createTimeout(callback: () => void, delay: number): NodeJS.Timeout {
    const timeout = setTimeout(() => {
      this.activeTimeouts.delete(timeout);
      try {
        callback();
      } catch (error) {
        logger.error("Timer callback error:", error);
      }
    }, delay);
    this.activeTimeouts.add(timeout);
    return timeout;
  }
}
