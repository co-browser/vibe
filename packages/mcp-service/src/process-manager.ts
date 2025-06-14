/**
 * Professional Process Manager for MCP Server
 * Handles Python process lifecycle with robust error handling and cleanup
 */
import { spawn, ChildProcess } from "child_process";
import { existsSync } from "node:fs";
import { EventEmitter } from "events";
import path from "path";
import { logger } from "./logger";
import type {
  McpServerConfig,
  McpServerStatus,
  StartupOptions,
  McpServiceEvents,
} from "./types";

export class ProcessManager extends EventEmitter<McpServiceEvents> {
  private config: Required<McpServerConfig>;
  private process: ChildProcess | null = null;
  private status: McpServerStatus;
  private shutdownPromise: Promise<void> | null = null;
  private startupTimeout: NodeJS.Timeout | null = null;

  constructor(config: McpServerConfig) {
    super();

    // Provide defaults for required config
    this.config = {
      pythonPath: config.pythonPath ?? "uv",
      projectPath: path.resolve(config.projectPath),
      port: config.port,
      host: config.host ?? "localhost",
      env: config.env ?? {},
      startupTimeout: config.startupTimeout ?? 30000,
      healthCheckInterval: config.healthCheckInterval ?? 5000,
    };

    this.status = {
      isRunning: false,
      isHealthy: false,
    };

    // Ensure graceful shutdown on process exit
    this.setupGracefulShutdown();
  }

  /**
   * Get current server status
   */
  getStatus(): McpServerStatus {
    return { ...this.status };
  }

  /**
   * Start the MCP server process
   */
  async start(options: StartupOptions = {}): Promise<McpServerStatus> {
    if (this.status.isRunning) {
      logger.warn("MCP server is already running");
      return this.status;
    }

    try {
      logger.info("Starting MCP server process", {
        projectPath: this.config.projectPath,
        port: this.config.port,
        host: this.config.host,
      });

      // Clear any previous state
      this.status = {
        isRunning: false,
        isHealthy: false,
      };

      // Prepare environment
      const env = {
        ...process.env,
        ...this.config.env,
        ...options.env,
        MCP_SERVER_PORT: this.config.port.toString(),
        PYTHONUNBUFFERED: "1", // Ensure immediate output
      };

      // Check if we're in development (source code available) or production (binary available)
      const isDevelopment = existsSync(
        path.join(this.config.projectPath, "pyproject.toml"),
      );

      if (isDevelopment) {
        console.info(
          "[mcp-service] development init - using uv to run Python project",
        );
        console.info(`starting mcp-service @ ${this.config.projectPath}`);

        // Use uv to run the Python project directly
        this.process = spawn(
          this.config.pythonPath || "uv",
          ["run", "python", "src/main.py"],
          {
            cwd: this.config.projectPath,
            env,
            stdio: ["pipe", "pipe", "pipe"],
            detached: false,
          },
        );
      } else {
        console.info("[mcp-service] production init - using bundled binary");
        const execBundledPy = "mcp-server-backend";
        const pathToBundledPy =
          "/Applications/vibe.app/Contents/Resources/app.asar.unpacked/dist-py/";
        console.info(
          `starting mcp-service @ ${pathToBundledPy}${execBundledPy}`,
        );

        // Spawn the precompiled binary
        this.process = spawn(`${pathToBundledPy}${execBundledPy}`, [], {
          env,
          stdio: ["pipe", "pipe", "pipe"],
          detached: false,
        });
      }

      // Set up process event handlers
      this.setupProcessHandlers();

      // Update status
      this.status = {
        isRunning: true,
        isHealthy: false,
        pid: this.process.pid,
        startedAt: new Date(),
      };

      // Set startup timeout
      this.startupTimeout = setTimeout(() => {
        const error = new Error(
          `MCP server failed to start within ${this.config.startupTimeout}ms`,
        );
        this.handleError(error);
      }, this.config.startupTimeout);

      logger.info("MCP server process started", {
        pid: this.process.pid,
      });

      this.emit("started", this.status);
      return this.status;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error("Failed to start MCP server process:", err);
      this.handleError(err);
      throw err;
    }
  }

  /**
   * Stop the MCP server process
   */
  async stop(reason: string = "Manual shutdown"): Promise<void> {
    if (!this.status.isRunning || !this.process) {
      logger.debug("MCP server is not running, nothing to stop");
      return;
    }

    // Prevent multiple shutdown attempts
    if (this.shutdownPromise) {
      return this.shutdownPromise;
    }

    this.shutdownPromise = this.performShutdown(reason);
    return this.shutdownPromise;
  }

  /**
   * Mark server as healthy (called by health checker)
   */
  markHealthy(): void {
    if (!this.status.isHealthy) {
      this.status.isHealthy = true;
      this.status.url = `http://${this.config.host}:${this.config.port}`;

      // Clear startup timeout since we're now healthy
      if (this.startupTimeout) {
        clearTimeout(this.startupTimeout);
        this.startupTimeout = null;
      }

      logger.info("MCP server is now healthy", { url: this.status.url });
      this.emit("healthy", this.status);
    }
  }

  /**
   * Mark server as unhealthy (called by health checker)
   */
  markUnhealthy(error: Error): void {
    if (this.status.isHealthy) {
      this.status.isHealthy = false;
      this.status.url = undefined;
      this.status.lastError = error.message;

      logger.warn("MCP server became unhealthy:", error.message);
      this.emit("unhealthy", error);
    }
  }

  /**
   * Set up process event handlers
   */
  private setupProcessHandlers(): void {
    if (!this.process) return;

    // Handle process output with better filtering
    this.process.stdout?.on("data", data => {
      const output = data.toString().trim();
      if (
        output &&
        !output.includes("Processing request of type") &&
        !output.includes("GET /sse HTTP/1.1") &&
        !output.includes("POST /messages") &&
        !output.includes("INFO:     127.0.0.1") &&
        !output.includes("HTTP Request: POST https://api.openai.com")
      ) {
        // Filter out noisy MCP protocol messages
        if (output.includes("ERROR") || output.includes("CRITICAL")) {
          logger.error(`[MCP Server] ${output}`);
        } else if (output.includes("WARNING") || output.includes("WARN")) {
          logger.warn(`[MCP Server] ${output}`);
        } else if (
          output.includes("Starting") ||
          output.includes("Server will run") ||
          output.includes("Uvicorn running")
        ) {
          logger.info(`[MCP Server] ${output}`);
        } else {
          logger.debug(`[MCP Server] ${output}`);
        }
      }
    });

    this.process.stderr?.on("data", data => {
      const output = data.toString().trim();
      if (
        output &&
        !output.includes("GET /sse HTTP/1.1") &&
        !output.includes("POST /messages") &&
        !output.includes("INFO:     127.0.0.1") &&
        !output.includes("HTTP Request: POST https://api.openai.com")
      ) {
        // Many Python frameworks send INFO logs to stderr, so filter appropriately
        if (output.includes("ERROR") || output.includes("CRITICAL")) {
          logger.error(`[MCP Server Error] ${output}`);
        } else if (output.includes("WARNING") || output.includes("WARN")) {
          logger.warn(`[MCP Server] ${output}`);
        } else if (
          output.includes("INFO") ||
          output.includes("Starting") ||
          output.includes("Server will run")
        ) {
          logger.info(`[MCP Server] ${output}`);
        } else {
          logger.debug(`[MCP Server] ${output}`);
        }
      }
    });

    // Handle process exit
    this.process.on("exit", (code, signal) => {
      const reason = signal
        ? `Process killed with signal ${signal}`
        : `Process exited with code ${code}`;

      logger.info("MCP server process exited", { code, signal });
      this.handleProcessExit(reason);
    });

    // Handle process errors
    this.process.on("error", error => {
      logger.error("MCP server process error:", error);
      this.handleError(error);
    });
  }

  /**
   * Handle process exit
   */
  private handleProcessExit(reason: string): void {
    this.status.isRunning = false;
    this.status.isHealthy = false;
    this.status.pid = undefined;
    this.status.url = undefined;
    this.process = null;
    this.shutdownPromise = null;

    if (this.startupTimeout) {
      clearTimeout(this.startupTimeout);
      this.startupTimeout = null;
    }

    logger.info("MCP server stopped", { reason });
    this.emit("stopped", reason);
  }

  /**
   * Handle process errors
   */
  private handleError(error: Error): void {
    this.status.lastError = error.message;
    logger.error("MCP server error:", error);
    this.emit("error", error);
  }

  /**
   * Perform graceful shutdown
   */
  private async performShutdown(reason: string): Promise<void> {
    if (!this.process) return;

    logger.info("Shutting down MCP server", { reason });

    return new Promise<void>(resolve => {
      if (!this.process) {
        resolve();
        return;
      }

      const forceKillTimeout = setTimeout(() => {
        if (this.process && !this.process.killed) {
          logger.warn("Force killing MCP server process");
          this.process.kill("SIGKILL");
        }
      }, 5000);

      this.process.once("exit", () => {
        clearTimeout(forceKillTimeout);
        resolve();
      });

      // Try graceful shutdown first
      if (!this.process.killed) {
        this.process.kill("SIGTERM");
      }
    });
  }

  /**
   * Set up graceful shutdown handlers
   */
  private setupGracefulShutdown(): void {
    const shutdown = (signal: string) => {
      logger.info(`Received ${signal}, shutting down MCP server`);
      this.stop(`Received ${signal}`)
        .catch(error => logger.error("Error during shutdown:", error))
        .finally(() => process.exit(0));
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGHUP", () => shutdown("SIGHUP"));
  }
}
