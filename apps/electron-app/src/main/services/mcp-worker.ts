/**
 * MCP Worker - Manages the utility process for MCP operations
 * Handles IPC communication, process lifecycle for MCP servers
 */

import { EventEmitter } from "events";
import { utilityProcess, type UtilityProcess } from "electron";
import path from "path";
import fs from "fs";
import { setupUtilityProcessSettings } from "../ipc/settings/utility-process-settings";

export class MCPWorker extends EventEmitter {
  private workerProcess: UtilityProcess | null = null;
  private isConnected = false;
  private restartCount = 0;
  private readonly maxRestarts = 3;
  private isRestarting = false;

  constructor() {
    super();
  }

  /**
   * Start the worker process
   */
  async start(): Promise<void> {
    try {
      await this.createWorkerProcess();
      console.log("[MCPWorker] Worker process started successfully");
    } catch (error) {
      console.error("[MCPWorker] Failed to start worker:", error);
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

      this.workerProcess.kill();
      this.workerProcess = null;
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
      console.error(`[MCPWorker] Worker process file not found: ${workerPath}`);
      throw new Error(
        `MCP worker process file not found at ${workerPath}. Please ensure the build process has completed successfully.`,
      );
    }

    if (process.env.LOG_LEVEL === "debug") {
      console.log("[MCPWorker] Creating utility process:", workerPath);
    }

    // Create utility process using Electron's utilityProcess.fork()
    // Filter out undefined environment variables to avoid "Invalid value for env" error
    const cleanEnv: Record<string, string> = {};
    const envVars = {
      NODE_ENV: process.env.NODE_ENV || "development",
      LOG_LEVEL: process.env.LOG_LEVEL,
      PATH: process.env.PATH, // Pass through PATH for finding executables
      GMAIL_CLIENT_ID: process.env.GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET: process.env.GMAIL_CLIENT_SECRET,
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
    setupUtilityProcessSettings(this.workerProcess);

    // Capture stdout and stderr
    if (this.workerProcess.stdout) {
      this.workerProcess.stdout.on("data", data => {
        console.log("[MCPWorker stdout]:", data.toString());
      });
    }

    if (this.workerProcess.stderr) {
      this.workerProcess.stderr.on("data", data => {
        console.error("[MCPWorker stderr]:", data.toString());
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

    if (process.env.LOG_LEVEL === "debug") {
      console.log("[MCPWorker] Worker process connected and ready");
    }
  }

  /**
   * Handle messages from worker process
   */
  private handleWorkerMessage(message: any): void {
    if (process.env.LOG_LEVEL === "debug") {
      console.log("[MCPWorker] Received message from worker:", message.type);
    }

    if (message.type === "ready") {
      // Additional ready handling if needed
      if (process.env.LOG_LEVEL === "debug") {
        console.log("[MCPWorker] Worker ready signal received");
      }
    } else if (message.type === "mcp-server-status") {
      // Forward MCP server status updates
      this.emit("mcp-server-status", message.data);
    } else {
      console.warn(
        "[MCPWorker] Unknown message type from worker:",
        message.type,
      );
    }
  }

  /**
   * Handle worker process exit
   */
  private handleWorkerExit(code: number): void {
    console.warn(`[MCPWorker] Worker process exited with code ${code}`);
    this.isConnected = false;

    // Emit disconnected event
    this.emit("disconnected", { code, restartCount: this.restartCount });

    // Auto-restart if not too many failures
    if (
      this.restartCount < this.maxRestarts &&
      !this.isRestarting &&
      this.workerProcess !== null
    ) {
      this.attemptRestart();
    } else if (this.restartCount >= this.maxRestarts) {
      console.error("[MCPWorker] Max restart attempts reached");
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

    console.log(
      `[MCPWorker] Auto-restarting worker (attempt ${this.restartCount}/${this.maxRestarts})`,
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

      console.log("[MCPWorker] Worker successfully restarted");
      this.emit("restarted", { restartCount: this.restartCount });
    } catch (error) {
      this.isRestarting = false;
      console.error(
        `[MCPWorker] Restart attempt ${this.restartCount} failed:`,
        error,
      );

      // Try again if we haven't hit the limit
      if (this.restartCount < this.maxRestarts) {
        setTimeout(() => this.attemptRestart(), 2000);
      } else {
        this.emit("error", new Error("All restart attempts failed"));
      }
    }
  }
}
