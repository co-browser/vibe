/**
 * MCP Manager - Lean orchestrator for multiple MCP connections
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

export class MCPManager implements IMCPManager {
  private readonly connections = new Map<string, MCPConnection>();
  private readonly connectionManager = new MCPConnectionManager();
  private readonly toolRouter = new MCPToolRouter();

  /**
   * Initialize connections to MCP servers
   */
  async initialize(configs: MCPServerConfig[]): Promise<void> {
    if (configs.length === 0) {
      logger.warn("No MCP server configurations provided");
      return;
    }

    logger.debug(`Initializing ${configs.length} MCP servers`);

    // Create connections in parallel
    const results = await Promise.allSettled(
      configs.map(async config => {
        const connection =
          await this.connectionManager.createConnection(config);
        await this.fetchTools(connection);
        return { name: config.name, connection };
      }),
    );

    // Store successful connections
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
  }

  /**
   * Get all tools from connected servers
   */
  async getAllTools(): Promise<Record<string, MCPTool>> {
    const allTools: Record<string, MCPTool> = {};

    for (const connection of this.connections.values()) {
      if (connection.isConnected && connection.tools) {
        Object.assign(allTools, connection.tools);
      }
    }

    return allTools;
  }

  /**
   * Call a tool on the appropriate server
   */
  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

    try {
      // Find connection
      const connection = this.toolRouter.findTool(toolName, this.connections);
      if (!connection) {
        throw new MCPToolError(`Tool '${toolName}' not found`);
      }

      // Ensure connection is healthy
      if (!(await this.ensureConnectionHealth(connection))) {
        throw new MCPConnectionError(
          `Connection to ${connection.serverName} unavailable`,
        );
      }

      // Execute tool
      const originalToolName = this.toolRouter.getOriginalToolName(toolName);
      const result = await connection.client.callTool({
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

  /**
   * Get connection status
   */
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

  /**
   * Get specific connection
   */
  getConnection(serverName: string): MCPConnection | null {
    return this.connections.get(serverName) || null;
  }

  /**
   * Health check all connections
   */
  async performHealthChecks(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(connection =>
      this.connectionManager.testConnection(connection),
    );
    await Promise.allSettled(promises);
  }

  /**
   * Disconnect all servers
   */
  async disconnect(): Promise<void> {
    const promises = Array.from(this.connections.values()).map(connection =>
      this.connectionManager.closeConnection(connection),
    );

    await Promise.allSettled(promises);
    this.connections.clear();
    this.toolRouter.clearCache();
  }

  /**
   * Ensure connection is healthy
   */
  private async ensureConnectionHealth(
    connection: MCPConnection,
  ): Promise<boolean> {
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

      // Replace connection
      this.connections.set(connection.serverName, newConnection);
      return true;
    } catch (error) {
      logger.error(`Reconnection failed for ${connection.serverName}:`, error);
      return false;
    }
  }

  /**
   * Fetch tools for a connection
   */
  private async fetchTools(connection: MCPConnection): Promise<void> {
    const result = await connection.client.listTools();

    if (result?.tools) {
      const tools: Record<string, MCPTool> = {};

      for (const tool of result.tools) {
        if (tool?.name) {
          const toolKey = this.toolRouter.formatToolName(
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
