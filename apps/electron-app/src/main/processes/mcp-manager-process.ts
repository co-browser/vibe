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
} from "@vibe/shared-types";
import {
  findWorkspaceRoot,
  getMonorepoPackagePath,
} from "@vibe/shared-types/utils/path";
import { createElectronLogger } from "../utils/electron-logger";

const logger = createElectronLogger("MCPManager");

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
  private isShuttingDown = false;

  constructor() {
    this.initialize();
  }

  private async initialize() {
    try {
      logger.info("Initializing MCP manager");

      // Always start MCP servers as child processes (consistent dev/prod behavior)
      const envVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value;
        }
      }

      // Debug: Log the environment state
      logger.debug("MCP Manager Environment:", {
        USE_LOCAL_RAG_SERVER: envVars.USE_LOCAL_RAG_SERVER || "undefined",
        NODE_ENV: envVars.NODE_ENV || "undefined",
        PATH: envVars.PATH
          ? `${envVars.PATH.substring(0, 100)}...`
          : "undefined",
        OPENAI_API_KEY: envVars.OPENAI_API_KEY ? "present" : "not set",
        LaunchMethod: envVars.PATH?.includes("/usr/local/bin")
          ? "terminal"
          : "finder/dock",
      });

      const serverConfigs = getAllMCPServerConfigs(envVars);
      logger.info(`Found ${serverConfigs.length} server configurations`);
      logger.info(
        `Server configurations: ${serverConfigs.map(c => c.name).join(", ")}`,
      );

      // Start all servers and wait for them to be ready
      const startPromises = serverConfigs.map(config =>
        this.startMCPServer(config),
      );
      await Promise.all(startPromises);

      // Verify all servers are ready
      const readyServers = Array.from(this.servers.values()).filter(
        server => server.status === "ready",
      ).length;

      logger.info(`${readyServers}/${serverConfigs.length} servers are ready`);

      // Signal ready to parent process
      if (process.parentPort) {
        process.parentPort.postMessage({ type: "ready" });
        logger.info("Ready signal sent to parent");
      }
    } catch (error) {
      logger.error("Initialization failed:", error);
      process.exit(1);
    }
  }

  private async startMCPServer(config: MCPServerConfig): Promise<void> {
    logger.info(`Starting ${config.name} MCP server on port ${config.port}`);
    logger.debug(`Current working directory: ${process.cwd()}`);
    logger.debug(`__dirname: ${__dirname}`);
    logger.debug(`process.resourcesPath: ${process.resourcesPath}`);
    logger.debug(`NODE_ENV: ${process.env.NODE_ENV}`);

    // Log environment details for debugging
    logger.debug(`Environment details for ${config.name}:`, {
      PATH: process.env.PATH,
      NODE_BINARY: process.env.NODE_BINARY,
      ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE,
      configEnv: config.env,
    });

    // Determine paths based on environment
    // In production, app.isPackaged is true, but we're in a child process
    // Check if we're in dev mode by looking at the actual path structure
    const isDevPath =
      __dirname.includes("/apps/electron-app/out/") ||
      __dirname.includes("/apps/electron-app/src/");
    const isDev = process.env.NODE_ENV === "development" || isDevPath;

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
          // If we can't find workspace root in what appears to be dev mode,
          // it's likely we're actually in production. Use production paths.
          logger.warn(
            "Package and workspace root not found, assuming production environment",
          );
          possiblePaths = [
            path.join(
              __dirname,
              "..",
              "..",
              "mcp-servers",
              `mcp-${config.name}`,
              "dist",
              "index.js",
            ),
            ...(process.resourcesPath
              ? [
                  path.join(
                    process.resourcesPath,
                    "mcp-servers",
                    `mcp-${config.name}`,
                    "dist",
                    "index.js",
                  ),
                ]
              : []),
          ];
        }
      }
    } else {
      // Production paths – ONLY use bundled versions that include all dependencies
      // Do NOT include index.js which requires node_modules
      possiblePaths = [
        // Prefer ES-module wrapper (executes CJS bundle)
        path.join(
          __dirname,
          "..",
          "..",
          "mcp-servers",
          `mcp-${config.name}`,
          "dist",
          "bundle-wrapper.mjs",
        ),
        // Fallback to raw bundle (CJS). Node can run this directly.
        path.join(
          __dirname,
          "..",
          "..",
          "mcp-servers",
          `mcp-${config.name}`,
          "dist",
          "bundle.cjs",
        ),
        // Try resourcesPath as well
        ...(process.resourcesPath
          ? [
              path.join(
                process.resourcesPath,
                "mcp-servers",
                `mcp-${config.name}`,
                "dist",
                "bundle-wrapper.mjs",
              ),
              path.join(
                process.resourcesPath,
                "mcp-servers",
                `mcp-${config.name}`,
                "dist",
                "bundle.cjs",
              ),
            ]
          : []),
      ];

      // Log warning about production bundle requirement
      logger.info(
        `Production mode: Only checking for bundled MCP server files`,
      );
    }

    // Log path resolution at debug level to avoid log spam in production
    logger.debug(`Path resolution for ${config.name}:`, {
      isDev,
      __dirname,
      resourcesPath: process.resourcesPath,
    });
    logger.debug(`Checking paths for ${config.name}:`, possiblePaths);

    let mcpPath: string | null = null;
    for (const testPath of possiblePaths) {
      logger.debug(`Checking path: ${testPath}`);
      if (fs.existsSync(testPath)) {
        logger.info(`Found MCP server at: ${testPath}`);
        mcpPath = testPath;
        break;
      }
    }

    if (!mcpPath) {
      logger.error(`MCP server not found. Tried paths:`, possiblePaths);
      // For development, we'll continue without the server
      if (isDev) {
        logger.warn(
          `Continuing in development mode without ${config.name} server`,
        );
        return;
      }
      throw new Error(`MCP server not found: ${config.name}`);
    }

    // Special check for Gmail server dependencies
    if (config.name === "gmail") {
      const oauthPath = path.join(
        process.env.HOME || "",
        ".gmail-mcp",
        "gcp-oauth.keys.json",
      );
      const credentialsPath = path.join(
        process.env.HOME || "",
        ".gmail-mcp",
        "credentials.json",
      );

      logger.debug(`Checking Gmail OAuth files:`, {
        oauthPath,
        oauthExists: fs.existsSync(oauthPath),
        credentialsPath,
        credentialsExists: fs.existsSync(credentialsPath),
      });

      if (!fs.existsSync(oauthPath)) {
        logger.error(`Gmail OAuth keys not found at: ${oauthPath}`);
        logger.error(`Please ensure Gmail is properly configured in the app`);
      }

      if (!fs.existsSync(credentialsPath)) {
        logger.error(`Gmail credentials not found at: ${credentialsPath}`);
        logger.error(`Please authenticate with Gmail through the app first`);
      }
    }

    logger.debug(`Found MCP server at: ${mcpPath}`);

    // Use node for JavaScript files, tsx for TypeScript (with proper path resolution)
    let command: string = "";
    let args: string[] = [];

    if (mcpPath.endsWith(".js") || mcpPath.endsWith(".mjs")) {
      // For JavaScript files, locate a reliable Node executable
      const candidateNodes: string[] = [];

      // 1️⃣ User-supplied override via NODE_BINARY env
      if (process.env.NODE_BINARY) {
        candidateNodes.push(process.env.NODE_BINARY);
      }

      // 2️⃣ Common brew / system locations
      candidateNodes.push(
        "/opt/homebrew/bin/node",
        "/usr/local/bin/node",
        "/usr/bin/node",
      );

      // 3️⃣ Fallback to PATH lookup
      candidateNodes.push("node");

      const foundNode =
        candidateNodes.find(p => {
          try {
            return fs.existsSync(p) || p === "node";
          } catch {
            return false;
          }
        }) || "node";

      command = foundNode;
      args = [mcpPath];
      logger.debug(`Using Node.js executable: ${foundNode}`);
    } else if (mcpPath.endsWith(".ts")) {
      // Try to find tsx in node_modules
      const tsxPath = path.resolve(process.cwd(), "node_modules/.bin/tsx");
      if (fs.existsSync(tsxPath)) {
        command = tsxPath;
        args = [mcpPath];
      } else {
        logger.warn(`tsx not found, trying global tsx`);
        command = "tsx";
        args = [mcpPath];
      }
    } else {
      throw new Error(`Unsupported file type: ${mcpPath}`);
    }

    logger.debug(`Spawning command: ${command}`);
    logger.debug(`With args:`, args);
    logger.debug(`Working directory: ${path.dirname(mcpPath)}`);

    const serverProcess = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        PORT: config.port.toString(),
        ...(config.env || {}),
        // Mark as electron subprocess to prevent loading .env files
        ELECTRON_RUN_AS_NODE: "1",
        // Ensure PATH is available for finding executables – append common Node install locations
        PATH: (() => {
          const defaultUnix = "/usr/local/bin:/usr/bin:/bin";
          const darwinExtras = "/opt/homebrew/bin:/usr/local/bin"; // Homebrew locations (Apple Silicon & Intel)
          const winDefault = "C:\\Windows\\System32;C:\\Windows";

          // Start with existing PATH if present
          let base = process.env.PATH ?? "";

          // Append platform-specific default paths if they are not already included
          if (process.platform === "darwin") {
            for (const p of darwinExtras.split(":")) {
              if (!base.includes(p)) {
                base += `${path.delimiter}${p}`;
              }
            }
            // Fallback to standard unix defaults if PATH was originally empty
            if (!base) base = defaultUnix;
          } else if (process.platform === "win32") {
            if (!base) base = winDefault;
          } else {
            if (!base) base = defaultUnix;
          }

          return base;
        })(),
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
      const output = data.toString().trim();

      // Always log output from Gmail server for debugging
      if (
        config.name === "gmail" ||
        output.includes("ERROR") ||
        output.includes("WARN")
      ) {
        logger.info(`[MCP-${config.name} stdout]:`, output);
      } else {
        logger.debug(`[MCP-${config.name} stdout]:`, output);
      }
    });

    // Handle Gmail token requests from child process
    if (config.name === "gmail") {
      serverProcess.on("message", async (message: any) => {
        logger.debug(
          `[Gmail] Received message from Gmail server:`,
          message.type,
        );
        if (message.type === "gmail-tokens-request") {
          logger.info("[Gmail] Forwarding token request to parent process");
          // Forward request to parent process
          if (process.parentPort) {
            process.parentPort.postMessage({
              type: "gmail-tokens-request",
              serverName: config.name,
            });
          } else {
            logger.error(
              "[Gmail] No parent port available to forward token request",
            );
          }
        }
      });
    }

    serverProcess.stderr?.on("data", data => {
      const error = data.toString().trim();
      logger.error(`[MCP-${config.name} stderr]:`, error);

      // Check for specific Gmail OAuth errors
      if (config.name === "gmail" && error.includes("No credentials found")) {
        logger.error(
          `Gmail OAuth credentials missing. Please authenticate through the Electron app first.`,
        );
      }
    });

    serverProcess.on("error", error => {
      logger.error(`[MCP-${config.name}] Failed to start:`, error);
      logger.error(`[MCP-${config.name}] Spawn details:`, {
        command,
        args,
        cwd: path.dirname(mcpPath),
        PATH: process.env.PATH,
        errorCode: (error as any).code,
        errorMessage: (error as any).message,
      });
      server.status = "error";
      this.notifyServerStatus(config.name, "error");
    });

    serverProcess.on("exit", code => {
      logger.info(`[MCP-${config.name}] Exited with code ${code}`);
      server.status = "stopped";
      this.servers.delete(config.name);
      this.notifyServerStatus(config.name, "stopped");

      // Attempt restart if not a clean exit and not shutting down
      if (code !== 0 && code !== null && !this.isShuttingDown) {
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

    // Give the server a moment to fully start before checking
    // This helps avoid 404 errors when the server is still initializing routes
    await new Promise(resolve => setTimeout(resolve, 1000));

    while (server.status === "starting" && Date.now() - startTime < timeout) {
      const now = Date.now();

      // Perform health check every checkInterval ms
      if (now - lastHealthCheck >= checkInterval) {
        const isHealthy = await this.healthCheck(server.name, server.port);
        lastHealthCheck = now;

        if (isHealthy) {
          logger.info(`Server ${name} health check passed - marking as ready`);
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
        `Server ${name} did not become ready within timeout - health checks failed`,
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
    logger.info("Stopping all MCP servers");
    this.isShuttingDown = true;

    const stopPromises: Promise<void>[] = [];

    for (const [name, server] of this.servers) {
      logger.info(`Stopping ${name} server`);

      // Create a promise that resolves when the process exits
      const stopPromise = new Promise<void>(resolve => {
        const timeout = setTimeout(() => {
          logger.warn(`${name} server did not exit gracefully, force killing`);
          server.process.kill("SIGKILL");
          resolve();
        }, 5000); // 5 second timeout for graceful shutdown

        server.process.once("exit", () => {
          clearTimeout(timeout);
          logger.info(`${name} server exited`);
          resolve();
        });

        // Send SIGTERM to initiate graceful shutdown
        server.process.kill("SIGTERM");
      });

      stopPromises.push(stopPromise);
    }

    // Wait for all servers to stop
    await Promise.all(stopPromises);
    logger.info("All MCP servers stopped");
  }

  getServer(name: string): MCPServer | undefined {
    return this.servers.get(name);
  }
}

// Bootstrap the MCP manager
const manager = new MCPManager();

// Handle IPC messages from parent
process.parentPort?.on("message", async (event: any) => {
  logger.debug("Received message event:", JSON.stringify(event));

  // Extract the actual message from the event data
  const message = event?.data || event;

  // Ensure message has type property
  if (!message || typeof message !== "object") {
    logger.error("Invalid message received:", message);
    return;
  }

  logger.debug("Extracted message:", {
    type: message.type,
    hasTokens: !!message.tokens,
  });

  switch (message.type) {
    case "stop": {
      await manager.stopAllServers();
      process.exit(0); // No break needed, process exits
    }
    // eslint-disable-next-line no-fallthrough
    case "gmail-tokens-response": {
      logger.info(
        "[Gmail] Received tokens response from parent, forwarding to Gmail server",
      );
      logger.debug("[Gmail] Tokens response details:", {
        hasTokens: !!message.tokens,
        hasError: !!message.error,
      });

      // Forward tokens to Gmail server
      const gmailServer = manager.getServer("gmail");
      if (gmailServer && gmailServer.process.send) {
        logger.debug("[Gmail] Sending tokens response to Gmail server process");
        gmailServer.process.send({
          type: "gmail-tokens-response",
          tokens: message.tokens,
          error: message.error,
        });
        logger.debug("[Gmail] Tokens response sent to Gmail server");
      } else {
        logger.error("[Gmail] Gmail server not found or cannot send messages");
      }
      break;
    }
    default:
      logger.warn("Unknown message type:", message.type);
  }
});

// Handle process lifecycle
process.on("SIGTERM", async () => {
  logger.info("Received SIGTERM, shutting down");
  await manager.stopAllServers();
  process.exit(0);
});

process.on("uncaughtException", error => {
  logger.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", reason => {
  logger.error("Unhandled promise rejection:", reason);
  process.exit(1);
});

logger.info("MCP manager process started");
logger.debug("Parent port available:", !!process.parentPort);
