/**
 * MCP Manager Process - Utility Process Entry Point
 * Manages MCP servers as child processes
 */

import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import http from "http";
import {
  getAllMCPServerConfigs,
  type MCPServerConfig,
  findWorkspaceRoot,
  getMonorepoPackagePath,
  createLogger,
} from "@vibe/shared-types";

const logger = createLogger("MCPManagerProcess");

interface MCPServer {
  name: string;
  process: ChildProcess;
  port: number;
  status: "starting" | "ready" | "error" | "stopped";
  config: MCPServerConfig;
}

class MCPManager {
  private servers: Map<string, MCPServer> = new Map();
  private restartAttempts: Map<string, number> = new Map();
  private readonly maxRestartAttempts = 3;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      logger.info("[MCPManager] Initializing MCP manager");

      // Always start MCP servers as child processes (consistent dev/prod behavior)
      const envVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value;
        }
      }
      const serverConfigs = getAllMCPServerConfigs(envVars);
      logger.info(
        `[MCPManager] Found ${serverConfigs.length} server configurations`,
      );

      for (const config of serverConfigs) {
        await this.startMCPServer(config);
      }

      // Signal ready to parent process
      if (process.parentPort) {
        process.parentPort.postMessage({ type: "ready" });
        logger.info("[MCPManager] Ready signal sent to parent");
      }
    } catch (error) {
      logger.error("[MCPManager] Initialization failed:", error);
      process.exit(1);
    }
  }

  private async startMCPServer(config: MCPServerConfig): Promise<void> {
    logger.info(
      `[MCPManager] Starting ${config.name} MCP server on port ${config.port}`,
    );
    if (process.env.LOG_LEVEL === "debug") {
      logger.debug(`[MCPManager] Current working directory: ${process.cwd()}`);
      logger.debug(`[MCPManager] __dirname: ${__dirname}`);
    }

    // Determine paths based on environment
    const isDev = process.env.NODE_ENV === "development";

    // Try multiple possible locations
    let possiblePaths: string[] = [];

    if (isDev) {
      // Use the shared utility to find package path
      const packagePath = getMonorepoPackagePath(
        `mcp-${config.name}`,
        __dirname,
      );

      if (packagePath) {
        possiblePaths = [
          // Try built JavaScript first (most reliable)
          path.join(packagePath, "dist", "index.js"),
          // Fallback to TypeScript source (requires tsx)
          path.join(packagePath, "src", "index.ts"),
        ];
      } else {
        // Fallback to manual resolution if package utility fails
        const workspaceRoot = findWorkspaceRoot(__dirname);

        if (workspaceRoot) {
          possiblePaths = [
            path.join(
              workspaceRoot,
              "packages",
              `mcp-${config.name}`,
              "dist",
              "index.js",
            ),
            path.join(
              workspaceRoot,
              "packages",
              `mcp-${config.name}`,
              "src",
              "index.ts",
            ),
          ];
        } else {
          // Last resort: try process.cwd()
          logger.warn(
            "[MCPManager] Package and workspace root not found, falling back to process.cwd()",
          );
          possiblePaths = [
            path.join(
              process.cwd(),
              "packages",
              `mcp-${config.name}`,
              "dist",
              "index.js",
            ),
            path.join(
              process.cwd(),
              "packages",
              `mcp-${config.name}`,
              "src",
              "index.ts",
            ),
          ];
        }
      }
    } else {
      // Production paths
      possiblePaths = [
        path.join(
          __dirname,
          "..",
          "..",
          "mcp-servers",
          `mcp-${config.name}`,
          "index.js",
        ),
        ...(process.resourcesPath
          ? [
              path.join(
                process.resourcesPath,
                "mcp-servers",
                `mcp-${config.name}`,
                "index.js",
              ),
            ]
          : []),
      ];
    }

    let mcpPath: string | null = null;
    for (const testPath of possiblePaths) {
      if (fs.existsSync(testPath)) {
        mcpPath = testPath;
        break;
      }
    }

    if (!mcpPath) {
      logger.error(
        `[MCPManager] MCP server not found. Tried paths:`,
        possiblePaths,
      );
      // For development, we'll continue without the server
      if (isDev) {
        logger.warn(
          `[MCPManager] Continuing in development mode without ${config.name} server`,
        );
        return;
      }
      throw new Error(`MCP server not found: ${config.name}`);
    }

    if (process.env.LOG_LEVEL === "debug") {
      logger.debug(`[MCPManager] Found MCP server at: ${mcpPath}`);
    }

    // Use node for JavaScript files, tsx for TypeScript (with proper path resolution)
    let command: string = "";
    let args: string[] = [];

    if (mcpPath.endsWith(".js")) {
      // For JavaScript files, use node (PATH should be available now)
      command = "node";
      args = [mcpPath];
      if (process.env.LOG_LEVEL === "debug") {
        logger.debug(`[MCPManager] Using Node.js: node (from PATH)`);
      }
    } else if (mcpPath.endsWith(".ts")) {
      // Try to find tsx in node_modules
      const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      if (fs.existsSync(tsxPath)) {
        command = tsxPath;
        args = [mcpPath];
      } else {
        logger.warn(`[MCPManager] tsx not found, trying global tsx`);
        command = "tsx";
        args = [mcpPath];
      }
    } else {
      throw new Error(`Unsupported file type: ${mcpPath}`);
    }

    if (process.env.LOG_LEVEL === "debug") {
      logger.debug(`[MCPManager] Spawning command: ${command}`);
      logger.debug(`[MCPManager] With args:`, args);
    }

    const serverProcess = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        PORT: config.port.toString(),
        ...(config.env || {}),
        // Ensure PATH is available for finding executables
        PATH:
          process.env.PATH ||
          (process.platform === "win32"
            ? "C:\\Windows\\System32;C:\\Windows"
            : "/usr/local/bin:/usr/bin:/bin"),
      },
      cwd: path.dirname(mcpPath),
    });

    const server: MCPServer = {
      name: config.name,
      process: serverProcess,
      port: config.port,
      status: "starting",
      config,
    };

    this.servers.set(config.name, server);

    // Handle process output
    serverProcess.stdout?.on("data", data => {
      const output = data.toString();

      // Log output if debug level or contains errors
      if (output.includes("ERROR") || process.env.LOG_LEVEL === "debug") {
        logger.debug(`[MCP-${config.name}]:`, output);
      }
    });

    serverProcess.stderr?.on("data", data => {
      logger.error(`[MCP-${config.name} error]:`, data.toString());
    });

    serverProcess.on("error", error => {
      logger.error(`[MCP-${config.name}] Failed to start:`, error);
      server.status = "error";
      this.notifyServerStatus(config.name, "error");
    });

    serverProcess.on("exit", code => {
      logger.info(`[MCP-${config.name}] Exited with code ${code}`);
      server.status = "stopped";
      this.servers.delete(config.name);
      this.notifyServerStatus(config.name, "stopped");

      // Attempt restart if not a clean exit
      if (code !== 0 && code !== null) {
        const attempts = this.restartAttempts.get(config.name) || 0;
        if (attempts >= this.maxRestartAttempts) {
          logger.error(
            `[MCP-${config.name}] Max restart attempts (${this.maxRestartAttempts}) reached - stopping restart attempts`,
          );
          return;
        }
        this.restartAttempts.set(config.name, attempts + 1);
        logger.info(
          `[MCP-${config.name}] Attempting restart after crash (attempt ${attempts + 1}/${this.maxRestartAttempts})`,
        );
        setTimeout(() => this.startMCPServer(config), 2000);
      }
    });

    // Wait for server to be ready (with timeout)
    await this.waitForServerReady(config.name, 10000);
  }

  private async healthCheck(_name: string, port: number): Promise<boolean> {
    return new Promise(resolve => {
      const req = http.request(
        {
          hostname: "localhost",
          port: port,
          path: "/health",
          method: "GET",
          timeout: 2000,
        },
        res => {
          resolve(res.statusCode === 200);
        },
      );

      req.on("error", () => {
        resolve(false);
      });

      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });

      req.end();
    });
  }

  private async waitForServerReady(
    name: string,
    timeout: number,
  ): Promise<void> {
    const server = this.servers.get(name);
    if (!server) return;

    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms
    let lastHealthCheck = 0;

    while (server.status === "starting" && Date.now() - startTime < timeout) {
      const now = Date.now();

      // Perform health check every checkInterval ms
      if (now - lastHealthCheck >= checkInterval) {
        const isHealthy = await this.healthCheck(server.name, server.port);
        lastHealthCheck = now;

        if (isHealthy) {
          logger.info(
            `[MCPManager] Server ${name} health check passed - marking as ready`,
          );
          server.status = "ready";
          // Reset restart attempts on successful startup
          this.restartAttempts.delete(name);
          this.notifyServerStatus(name, "ready");
          return;
        }
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (server.status !== "ready") {
      logger.warn(
        `[MCPManager] Server ${name} did not become ready within timeout - health checks failed`,
      );
      server.status = "error";
      this.notifyServerStatus(name, "error");
    }
  }

  private notifyServerStatus(name: string, status: string): void {
    if (process.parentPort) {
      process.parentPort.postMessage({
        type: "mcp-server-status",
        data: { name, status },
      });
    }
  }

  async stopAllServers(): Promise<void> {
    logger.info("[MCPManager] Stopping all MCP servers");

    for (const [name, server] of this.servers) {
      logger.info(`[MCPManager] Stopping ${name} server`);
      server.process.kill("SIGTERM");
    }

    // Wait for all servers to stop
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

// Bootstrap the MCP manager
const manager = new MCPManager();

// Handle IPC messages from parent
process.parentPort?.on("message", async (message: any) => {
  logger.debug("[MCPManager] Received message:", message.type);

  switch (message.type) {
    case "stop":
      await manager.stopAllServers();
      process.exit(0);
      break;
    default:
      logger.warn("[MCPManager] Unknown message type:", message.type);
  }
});

// Handle process lifecycle
process.on("SIGTERM", async () => {
  logger.info("[MCPManager] Received SIGTERM, shutting down");
  await manager.stopAllServers();
  process.exit(0);
});

process.on("uncaughtException", error => {
  logger.error("[MCPManager] Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  logger.error("[MCPManager] Unhandled promise rejection:", reason);
  process.exit(1);
});

logger.info("[MCPManager] MCP manager process started");
logger.info("[MCPManager] Parent port available:", !!process.parentPort);
