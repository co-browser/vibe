/**
 * MCP Worker - Manages the utility process for MCP operations
 * Handles IPC communication, process lifecycle for MCP servers
 */

import { EventEmitter } from "events";
import { utilityProcess, type UtilityProcess } from "electron";
import { setupProcessStorageHandler } from "../ipc/user/settings/process-storage-handler";
import path from "path";
import fs from "fs";
import { createElectronLogger } from "../utils/electron-logger";
import { getStorageService } from "../store/storage-service";

const logger = createElectronLogger("MCPWorker");

export class MCPWorker extends EventEmitter {
  private workerProcess: UtilityProcess | null = null;
  private isConnected = false;
  private restartCount = 0;
  private readonly maxRestarts = 3;
  private isRestarting = false;
  private isShuttingDown = false;

  constructor() {
    super();
  }

  /**
   * Start the worker process
   */
  async start(): Promise<void> {
    try {
      await this.createWorkerProcess();
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
      this.isShuttingDown = true;

      try {
        // Send stop message to allow graceful shutdown of child processes
        this.workerProcess.postMessage({ type: "stop" });

        // Wait for the manager to clean up child processes
        await new Promise<void>(resolve => {
          const timeout = setTimeout(() => {
            logger.warn(
              "Worker process did not exit gracefully, force killing",
            );
            resolve();
          }, 6000); // 6 seconds total (5s for child processes + 1s buffer)

          this.workerProcess!.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        // Log PID for debugging
        if (this.workerProcess && this.workerProcess.pid) {
          logger.info(
            `Worker process PID ${this.workerProcess.pid} has exited`,
          );
        }
      } catch (error) {
        logger.error("Error during graceful shutdown:", error);
      } finally {
        // Ensure the process is killed
        if (this.workerProcess) {
          this.workerProcess.kill();
        }
        this.workerProcess = null;
      }
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): {
    connected: boolean;
    restartCount: number;
    isRestarting: boolean;
    pid?: number;
  } {
    return {
      connected: this.isConnected,
      restartCount: this.restartCount,
      isRestarting: this.isRestarting,
      pid: this.workerProcess?.pid,
    };
  }

  /**
   * Create the utility process for MCP operations
   */
  private async createWorkerProcess(): Promise<void> {
    const workerPath = path.resolve(
      __dirname,
      "./processes/mcp-manager-process.js",
    );

    // Verify file exists before creating process
    if (!fs.existsSync(workerPath)) {
      logger.error(`Worker process file not found: ${workerPath}`);
      throw new Error(
        `MCP worker process file not found at ${workerPath}. Please ensure the build process has completed successfully.`,
      );
    }

    logger.debug("Creating utility process:", workerPath);

    // Create utility process using Electron's utilityProcess.fork()
    // Filter out undefined environment variables to avoid "Invalid value for env" error
    const cleanEnv: Record<string, string> = {};
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || "development",
      LOG_LEVEL: process.env.LOG_LEVEL,
      PATH: process.env.PATH, // Pass through PATH for finding executables
      GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
      // OAuth server environment variables
      OAUTH_SERVER_URL: (() => {
        const url =
          process.env.OAUTH_SERVER_URL || "https://oauth.cobrowser.xyz";
        try {
          const parsed = new URL(url);
          if (parsed.protocol !== "https:") {
            throw new Error("OAuth server must use HTTPS");
          }
          return url;
        } catch {
          throw new Error(`Invalid OAuth server URL: ${url}`);
        }
      })(),
      USE_LOCAL_GMAIL_AUTH: process.env.USE_LOCAL_GMAIL_AUTH || "false",
      // RAG server environment variables (default to "false" if not set)
      USE_LOCAL_RAG_SERVER: process.env.USE_LOCAL_RAG_SERVER || "false",
      RAG_SERVER_URL: process.env.RAG_SERVER_URL || "https://rag.cobrowser.xyz",
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      TURBOPUFFER_API_KEY: process.env.TURBOPUFFER_API_KEY,
      ENABLE_PPL_CHUNKING: process.env.ENABLE_PPL_CHUNKING,
      FAST_MODE: process.env.FAST_MODE,
      VERBOSE_LOGS: process.env.VERBOSE_LOGS,
    };

    // Only include defined environment variables
    for (const [key, value] of Object.entries(envVars)) {
      if (value !== undefined) {
        cleanEnv[key] = value;
      }
    }

    this.workerProcess = utilityProcess.fork(workerPath, [], {
      stdio: "pipe",
      serviceName: "mcp-manager",
      env: cleanEnv,
    });

    // Set up settings access for the utility process
    setupProcessStorageHandler(this.workerProcess);

    // Capture stdout and stderr
    if (this.workerProcess.stdout) {
      this.workerProcess.stdout.on("data", data => {
        logger.info("Worker stdout:", data.toString());
      });
    }

    if (this.workerProcess.stderr) {
      this.workerProcess.stderr.on("data", data => {
        logger.error("Worker stderr:", data.toString());
      });
    }

    // Set up process event handlers
    this.workerProcess.on("message", this.handleWorkerMessage.bind(this));
    this.workerProcess.on("exit", this.handleWorkerExit.bind(this));

    // Wait for worker ready signal
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Worker startup timeout"));
      }, 10000);

      const readyHandler = (message: any) => {
        if (message.type === "ready") {
          clearTimeout(timeout);
          this.isConnected = true;
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

    logger.debug("Worker process connected and ready");
  }

  /**
   * Handle messages from worker process
   */
  private handleWorkerMessage(message: any): void {
    logger.debug("Received message from worker:", message);

    // Handle different message types
    switch (message?.type) {
      case "ready":
        logger.debug("Worker ready signal received");
        break;

      case "gmail-tokens-request":
        this.handleGmailTokenRequest();
        break;

      case "gmail-tokens-update":
        this.handleGmailTokensUpdate(message);
        break;

      case "mcp-server-status":
        this.emit("mcp-server-status", message.data);
        break;

      default:
        logger.warn("Unknown message type from worker:", message?.type);
    }
  }

  /**
   * Handle Gmail token request from MCP server
   */
  private async handleGmailTokenRequest(): Promise<void> {
    try {
      logger.debug("Handling Gmail token request from MCP server");

      // Get storage service instance
      const storageService = getStorageService();

      // Get tokens from secure storage
      const tokens = await storageService.get("secure.oauth.gmail.tokens");

      logger.debug(
        "Retrieved tokens from storage:",
        tokens ? "found" : "not found",
      );

      // Create response message with explicit type
      const response = {
        type: "gmail-tokens-response",
        tokens: tokens || undefined,
        error: tokens ? undefined : "No Gmail tokens found in storage",
      };

      logger.debug("Sending response to worker:", {
        hasTokens: !!tokens,
        type: response.type,
      });

      if (this.workerProcess) {
        this.workerProcess.postMessage(response);
        logger.debug("Gmail tokens response sent to worker process");
      } else {
        logger.error("Worker process not available");
      }
    } catch (error) {
      logger.error("Error retrieving Gmail tokens:", error);
      const errorResponse = {
        type: "gmail-tokens-response",
        tokens: undefined,
        error: error instanceof Error ? error.message : "Unknown error",
      };

      if (this.workerProcess) {
        this.workerProcess.postMessage(errorResponse);
      }
    }
  }

  /**
   * Handle Gmail tokens update from MCP server
   */
  private async handleGmailTokensUpdate(message: any): Promise<void> {
    try {
      logger.debug("Handling Gmail tokens update from MCP server");

      // Get storage service instance
      const storageService = getStorageService();

      // Update tokens in secure storage
      await storageService.set("secure.oauth.gmail.tokens", message.tokens);

      logger.debug("Gmail tokens updated successfully");

      // Create response message
      const response = {
        type: "gmail-tokens-update-response",
        success: true,
      };

      if (this.workerProcess) {
        this.workerProcess.postMessage(response);
        logger.debug("Gmail tokens update response sent to worker process");
      } else {
        logger.error("Worker process not available");
      }
    } catch (error) {
      logger.error("Error updating Gmail tokens:", error);
      const errorResponse = {
        type: "gmail-tokens-update-response",
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };

      if (this.workerProcess) {
        this.workerProcess.postMessage(errorResponse);
      }
    }
  }

  /**
   * Handle worker process exit
   */
  private handleWorkerExit(code: number): void {
    logger.warn(`Worker process exited with code ${code}`);
    this.isConnected = false;

    // Emit disconnected event
    this.emit("disconnected", { code, restartCount: this.restartCount });

    // Auto-restart if not too many failures and not shutting down
    if (
      this.restartCount < this.maxRestarts &&
      !this.isRestarting &&
      !this.isShuttingDown &&
      this.workerProcess !== null
    ) {
      this.attemptRestart();
    } else if (this.restartCount >= this.maxRestarts) {
      logger.error("Max restart attempts reached");
      this.emit("error", new Error("Worker process repeatedly crashed"));
    } else if (this.isShuttingDown) {
      logger.info("Worker process exited during shutdown - not restarting");
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

      // Reset restart flag on success
      this.isRestarting = false;

      logger.info("Worker successfully restarted");
      this.emit("restarted", { restartCount: this.restartCount });
    } catch (error) {
      this.isRestarting = false;
      logger.error(`Restart attempt ${this.restartCount} failed:`, error);

      // Try again if we haven't hit the limit
      if (this.restartCount < this.maxRestarts) {
        setTimeout(() => this.attemptRestart(), 2000);
      } else {
        this.emit("error", new Error("All restart attempts failed"));
      }
    }
  }
}
