/**
 * MCP Manager - Clean orchestrator with proper separation of concerns
 */

import {
  createLogger,
  MCPServerConfig,
  MCPConnection,
  MCPTool,
  MCPCallResult,
  MCPConnectionStatus,
  MCPConnectionError,
  MCPToolError,
  IMCPManager,
} from "@vibe/shared-types";

import { MCPConnectionManager } from "./mcp-connection-manager.js";
import { MCPToolRouter } from "./mcp-tool-router.js";

const logger = createLogger("McpManager");

/**
 * Manages MCP connection lifecycle including initialization, health monitoring, and reconnection.
 * Maintains the canonical connection map that other components reference.
 */
class ConnectionOrchestrator {
  private readonly connections = new Map<string, MCPConnection>();
  private readonly connectionManager = new MCPConnectionManager();

  async initializeConnections(
    configs: MCPServerConfig[],
  ): Promise<Map<string, MCPConnection>> {
    if (configs.length === 0) {
      logger.warn("No MCP server configurations provided");
      return this.connections;
    }

    logger.debug(`Initializing ${configs.length} MCP servers`);

    const results = await Promise.allSettled(
      configs.map(async config => {
        const connection =
          await this.connectionManager.createConnection(config);
        await this.fetchTools(connection);
        return { name: config.name, connection };
      }),
    );

    let successCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled") {
        this.connections.set(result.value.name, result.value.connection);
        successCount++;
      } else {
        logger.error("Connection failed:", result.reason);
      }
    }

    logger.info(`Initialized ${successCount}/${configs.length} MCP servers`);

    if (successCount === 0) {
      throw new MCPConnectionError("Failed to connect to any MCP servers");
    }

    return this.connections;
  }

  async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(connection =>
      this.connectionManager.testConnection(connection),
    );
    await Promise.allSettled(promises);
  }

  async disconnectAll(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(connection =>
      this.connectionManager.closeConnection(connection),
    );
    await Promise.allSettled(promises);
    this.connections.clear();
  }

  getStatus(): Record<string, MCPConnectionStatus> {
    const status: Record<string, MCPConnectionStatus> = {};
    for (const [name, connection] of this.connections) {
      status[name] = {
        connected: connection.isConnected,
        toolCount: Object.keys(connection.tools || {}).length,
        lastCheck: connection.lastHealthCheck,
        errorCount: connection.connectionAttempts,
      };
    }
    return status;
  }

  getConnections(): Map<string, MCPConnection> {
    return this.connections;
  }

  getConnection(serverName: string): MCPConnection | null {
    return this.connections.get(serverName) || null;
  }

  async ensureConnectionHealth(connection: MCPConnection): Promise<boolean> {
    const now = Date.now();

    // If recently checked, trust it
    if (
      connection.isConnected &&
      connection.lastHealthCheck &&
      now - connection.lastHealthCheck < 5000
    ) {
      return true;
    }

    // Test connection
    const isHealthy = await this.connectionManager.testConnection(connection);
    if (isHealthy) {
      connection.lastHealthCheck = now;
      return true;
    }

    // Try to reconnect
    try {
      await this.connectionManager.closeConnection(connection);
      const newConnection = await this.connectionManager.createConnection(
        connection.config,
      );
      await this.fetchTools(newConnection);

      // Replace connection in map
      this.connections.set(connection.serverName, newConnection);
      return true;
    } catch (error) {
      logger.error(`Reconnection failed for ${connection.serverName}:`, error);
      return false;
    }
  }

  private async fetchTools(connection: MCPConnection): Promise<void> {
    const result = await connection.client.listTools();
    const toolRouter = new MCPToolRouter();

    if (result?.tools) {
      const tools: Record<string, MCPTool> = {};

      for (const tool of result.tools) {
        if (tool?.name) {
          const toolKey = toolRouter.formatToolName(
            connection.serverName,
            tool.name,
          );
          tools[toolKey] = {
            name: toolKey,
            description: tool.description || "No description",
            inputSchema: tool.inputSchema || { type: "object" },
            serverName: connection.serverName,
            originalName: tool.name,
          };
        }
      }

      connection.tools = tools;
    }
  }
}

/**
 * Registry that provides access to current tool-to-connection mappings.
 * Prevents stale connection references by always querying the live connection map.
 */
class ToolRegistry {
  private connections: Map<string, MCPConnection> = new Map();

  constructor(private readonly toolRouter: MCPToolRouter) {}

  registerConnections(connections: Map<string, MCPConnection>): void {
    this.connections = connections;
  }

  getAllTools(): Record<string, MCPTool> {
    const allTools: Record<string, MCPTool> = {};

    for (const connection of this.connections.values()) {
      if (connection.isConnected && connection.tools) {
        Object.assign(allTools, connection.tools);
      }
    }

    return allTools;
  }

  findCurrentToolConnection(toolName: string): MCPConnection | null {
    return this.toolRouter.findTool(toolName, this.connections);
  }

  clear(): void {
    this.connections.clear();
  }
}

/**
 * Executes MCP tools with automatic health checking and reconnection handling.
 */
class ToolInvoker {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly orchestrator: ConnectionOrchestrator,
    private readonly toolRouter: MCPToolRouter,
  ) {}

  async invokeTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

    try {
      const connection = this.registry.findCurrentToolConnection(toolName);
      if (!connection) {
        throw new MCPToolError(`Tool '${toolName}' not found`);
      }

      const isHealthy =
        await this.orchestrator.ensureConnectionHealth(connection);
      if (!isHealthy) {
        throw new MCPConnectionError(
          `Connection to ${connection.serverName} unavailable`,
        );
      }

      const currentConnection =
        this.registry.findCurrentToolConnection(toolName);
      if (!currentConnection) {
        throw new MCPConnectionError(
          `Tool connection lost during health check`,
        );
      }

      // Execute tool with current connection
      const originalToolName = this.toolRouter.getOriginalToolName(toolName);
      const result = await currentConnection.client.callTool({
        name: originalToolName,
        arguments: args,
      });

      if (result.isError) {
        throw new MCPToolError(`Tool failed: ${result.error}`);
      }

      const executionTime = Date.now() - startTime;
      return {
        success: true,
        data: result.content as T,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      return {
        success: false,
        error: errorMessage,
        executionTime,
      };
    }
  }
}

/**
 * Main facade for MCP operations. Coordinates between connection management,
 * tool discovery, and execution while maintaining a clean external API.
 *
 * @example
 * ```typescript
 * const manager = new MCPManager();
 * await manager.initialize(configs);
 * const result = await manager.callTool("server:tool_name", { arg: "value" });
 * ```
 */
export class MCPManager implements IMCPManager {
  private readonly orchestrator = new ConnectionOrchestrator();
  private readonly toolRouter = new MCPToolRouter();
  private readonly toolRegistry = new ToolRegistry(this.toolRouter);
  private readonly invoker = new ToolInvoker(
    this.toolRegistry,
    this.orchestrator,
    this.toolRouter,
  );

  async initialize(configs: MCPServerConfig[]): Promise<void> {
    const connections = await this.orchestrator.initializeConnections(configs);
    this.toolRegistry.registerConnections(connections);
  }

  async getAllTools(): Promise<Record<string, MCPTool>> {
    return this.toolRegistry.getAllTools();
  }

  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult<T>> {
    logger.debug(`Executing tool: ${toolName} with args:`, args);
    return this.invoker.invokeTool<T>(toolName, args);
  }

  getStatus(): Record<string, MCPConnectionStatus> {
    return this.orchestrator.getStatus();
  }

  getConnection(serverName: string): MCPConnection | null {
    return this.orchestrator.getConnection(serverName);
  }

  async performHealthChecks(): Promise<void> {
    await this.orchestrator.performHealthChecks();
  }

  async disconnect(): Promise<void> {
    await this.orchestrator.disconnectAll();
    this.toolRegistry.clear();
    this.toolRouter.clearCache();
  }
}
