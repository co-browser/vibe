import { Agent } from "./agent.js";
import { ToolManager } from "./managers/tool-manager.js";
import { StreamProcessor } from "./managers/stream-processor.js";
import { MCPConnectionService } from "./services/mcp-service.js";
import type { AgentConfig } from "./types.js";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("AgentFactory");

// Constants for MCP configuration
const MCP_MAX_ATTEMPTS = 3;
const MCP_RETRY_DELAY = 1000;
const LOG_PREFIX = "[AgentCore]";

// New AgentFactory class
export class AgentFactory {
  static create(config: AgentConfig): Agent {
    // Create MCP service if server URL provided
    const mcpService = config.mcpServerUrl
      ? new MCPConnectionService({
          serverUrl: config.mcpServerUrl,
          maxAttempts: MCP_MAX_ATTEMPTS,
          retryDelay: MCP_RETRY_DELAY,
          logPrefix: LOG_PREFIX,
        })
      : undefined;

    // Initialize MCP connection in background if service exists
    if (mcpService) {
      mcpService.connect().catch(error => {
        logger.error("MCP initialization failed:", error);
      });
    }

    // Wire up manager dependencies (no context manager needed - ReAct handles memory via tools)
    const toolManager = new ToolManager(mcpService);
    const streamProcessor = new StreamProcessor();

    // Create and return configured Agent with pure ReAct implementation
    return new Agent(toolManager, streamProcessor, config);
  }
}
