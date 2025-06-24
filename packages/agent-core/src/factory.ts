import { Agent } from "./agent.js";
import { ToolManager } from "./managers/tool-manager.js";
import { StreamProcessor } from "./managers/stream-processor.js";
import { MCPManager } from "./services/mcp-manager.js";
import type { AgentConfig } from "./types.js";
import { createLogger, getAllMCPServerConfigs } from "@vibe/shared-types";

const logger = createLogger("AgentFactory");

// New AgentFactory class
export class AgentFactory {
  static create(config: AgentConfig): Agent {
    // Create MCP manager for multiple server connections
    const mcpManager = new MCPManager();

    // Store auth token for later use
    if (config.authToken) {
      (mcpManager as any).authToken = config.authToken;
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

      if (serverConfigs.length > 0) {
        mcpManager.initialize(serverConfigs).catch((error: Error) => {
          logger.error("MCP manager initialization failed:", error);
        });

        logger.debug(
          `Agent created with ${serverConfigs.length} MCP servers: ${serverConfigs.map(s => s.name).join(", ")}`,
        );
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
