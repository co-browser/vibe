import { Agent } from "./agent.js";
import { ToolManager } from "./managers/tool-manager.js";
import { StreamProcessor } from "./managers/stream-processor.js";
import { MCPManager } from "./services/mcp-manager.js";
import type { AgentConfig } from "./types.js";
import { createLogger, getAllMCPServerConfigs } from "@vibe/shared-types";

const logger = createLogger("AgentFactory");

// New AgentFactory class
export class AgentFactory {
  /**
   * Wait for MCP servers to be ready with timeout
   * @param mcpManager The MCP manager instance
   * @param serverConfigs The server configurations to check
   * @param timeoutMs Maximum time to wait for servers to be ready
   * @returns Promise that resolves when servers are ready or timeout is reached
   */
  private static async waitForMCPServersReady(
    mcpManager: MCPManager,
    serverConfigs: Array<{ name: string }>,
    timeoutMs: number = 10000,
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500; // Check every 500ms

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Check server status
        const status = mcpManager.getStatus();
        const connectedServers = Object.entries(status)
          .filter(([_, serverStatus]) => serverStatus.connected)
          .map(([name]) => name);

        // Check if all configured servers (except optional RAG) are connected
        const requiredServers = serverConfigs.filter(
          config => config.name !== "rag",
        );
        const allRequiredConnected = requiredServers.every(config =>
          connectedServers.includes(config.name),
        );

        if (allRequiredConnected) {
          logger.debug(`MCP servers ready: ${connectedServers.join(", ")}`);
          return;
        }

        // Log progress
        logger.debug(
          `Waiting for MCP servers... Connected: ${connectedServers.length}/${requiredServers.length} ` +
            `(${connectedServers.join(", ")})`,
        );
      } catch (error) {
        logger.debug("Error checking server readiness:", error);
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    logger.warn(`MCP servers readiness check timed out after ${timeoutMs}ms`);
  }
  static async create(config: AgentConfig): Promise<Agent> {
    // Create MCP manager for multiple server connections
    const mcpManager = new MCPManager();

    // Store auth token for later use
    logger.debug(
      `Agent factory - auth token: ${config.authToken ? "present" : "not provided"}`,
    );
    if (config.authToken) {
      try {
        await mcpManager.updateAuthToken(config.authToken);
      } catch (error) {
        logger.error("Failed to update auth token:", error);
      }
    }

    // Initialize MCP connections in background if environment variables are available
    if (typeof process !== "undefined" && process.env) {
      // Create environment variables object for MCP server configuration
      const envVars: Record<string, string> = {};
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          envVars[key] = value;
        }
      }

      // Get all MCP server configurations
      const serverConfigs = getAllMCPServerConfigs(envVars);
      logger.debug(
        "Agent factory - USE_LOCAL_RAG_SERVER:",
        envVars.USE_LOCAL_RAG_SERVER,
      );
      logger.debug(
        "Agent factory - server configs:",
        serverConfigs.map(c => c.name),
      );

      if (serverConfigs.length > 0) {
        try {
          // Initialize MCP connections
          await mcpManager.initialize(serverConfigs);

          // Wait for MCP servers to be ready with proper timeout
          await this.waitForMCPServersReady(mcpManager, serverConfigs, 10000);

          logger.debug(
            `Agent created with ${serverConfigs.length} MCP servers: ${serverConfigs.map(s => s.name).join(", ")}`,
          );
        } catch (error) {
          logger.error("MCP manager initialization failed:", error);
          // Continue even if MCP initialization fails - agent can still work without tools
        }
      } else {
        logger.warn("No MCP server configurations available");
      }
    } else {
      logger.warn(
        "Process environment not available, skipping MCP initialization",
      );
    }

    // Wire up manager dependencies with multi-MCP support
    const toolManager = new ToolManager(mcpManager);
    const streamProcessor = new StreamProcessor();

    // Create and return configured Agent with multi-MCP implementation
    return new Agent(toolManager, streamProcessor, config, mcpManager);
  }
}
