/**
 * MCP Manager - Clean, Professional, Lean Implementation
 * 
 * Orchestrates multiple MCP connections using focused, single-responsibility components.
 * Leverages shared infrastructure from @vibe/shared-types.
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
  MCP_DEFAULTS,
  debounce,
  IMCPManager
} from "@vibe/shared-types";

import { MCPConnectionManager } from "./mcp-connection-manager.js";
import { MCPToolRouter } from "./mcp-tool-router.js";

const logger = createLogger("McpManager");

export class MCPManager implements IMCPManager {
  private readonly connections = new Map<string, MCPConnection>();
  private readonly connectionManager = new MCPConnectionManager();
  private readonly toolRouter = new MCPToolRouter();
  private toolsCache: Record<string, MCPTool> | null = null;
  private healthCheckInterval?: NodeJS.Timeout;

  // Debounced cache invalidation to prevent excessive recalculation
  private readonly invalidateToolsCache = debounce(() => {
    this.toolsCache = null;
    logger.debug("Tools cache invalidated");
  }, 100);

  /**
   * Initialize connections to multiple MCP servers with parallel execution
   */
  async initialize(configs: MCPServerConfig[]): Promise<void> {
    if (configs.length === 0) {
      logger.warn("No MCP server configurations provided");
      return;
    }

    logger.debug(`Initializing MCP manager with ${configs.length} servers`);

    // Validate configs before processing
    const validConfigs = configs.filter(this.isValidConfig);
    if (validConfigs.length !== configs.length) {
      logger.warn(`Filtered out ${configs.length - validConfigs.length} invalid configurations`);
    }

    // Create connections in parallel for better performance
    const connectionPromises = validConfigs.map(async (config) => {
      try {
        const connection = await this.connectionManager.createConnection(config);
        await this.fetchAndCacheTools(connection);
        return { success: true, serverName: config.name, connection };
      } catch (error) {
        logger.error(`Failed to initialize ${config.name}:`, error);
        return { success: false, serverName: config.name, error };
      }
    });

    const results = await Promise.allSettled(connectionPromises);

    // Process results and store successful connections
    let successCount = 0;
    for (const result of results) {
      if (result.status === "fulfilled" && result.value.success && result.value.connection) {
        this.connections.set(result.value.serverName, result.value.connection);
        successCount++;
      }
    }

    // Invalidate cache and start health checks
    this.invalidateToolsCache();
    this.startPeriodicHealthChecks();

    logger.info(`MCP manager initialized: ${successCount}/${validConfigs.length} servers connected`);

    if (successCount === 0) {
      throw new MCPConnectionError("Failed to connect to any MCP servers");
    }
  }

  /**
   * Get all available tools from connected servers
   */
  async getAllTools(): Promise<Record<string, MCPTool>> {
    if (this.toolsCache) {
      return { ...this.toolsCache }; // Return copy to prevent mutation
    }

    const allTools: Record<string, MCPTool> = {};

    for (const connection of this.connections.values()) {
      if (connection.isConnected && connection.tools) {
        Object.assign(allTools, connection.tools);
      }
    }

    this.toolsCache = allTools;
    return { ...allTools };
  }

  /**
   * Call a tool with proper routing and error handling
   */
  async callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPCallResult<T>> {
    const startTime = Date.now();

    try {
      // Validate inputs
      if (!this.toolRouter.validateToolName(toolName)) {
        throw new MCPToolError(`Invalid tool name format: ${toolName}`);
      }

      if (!args || typeof args !== 'object') {
        throw new MCPToolError(`Invalid arguments provided for tool: ${toolName}`);
      }

      // Find the connection that has this tool
      const connection = this.toolRouter.findTool(toolName, this.connections);
      if (!connection) {
        const availableTools = Object.keys(await this.getAllTools());
        throw new MCPToolError(
          `Tool '${toolName}' not found. Available tools: ${availableTools.join(', ')}`
        );
      }

      // Get the original tool name for the call
      const originalToolName = this.toolRouter.getOriginalToolName(toolName);

      // Execute the tool call with timeout
      const callPromise = connection.client.callTool({
        name: originalToolName,
        arguments: args
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new MCPToolError(
          `Tool execution timeout after ${MCP_DEFAULTS.TOOL_EXECUTION_TIMEOUT_MS}ms`,
          connection.serverName,
          toolName
        )), MCP_DEFAULTS.TOOL_EXECUTION_TIMEOUT_MS)
      );

      const result = await Promise.race([callPromise, timeoutPromise]);

      if (result.isError) {
        throw new MCPToolError(
          `Tool execution failed: ${result.error}`,
          connection.serverName,
          toolName
        );
      }

      const executionTime = Date.now() - startTime;
      logger.debug(`Tool '${toolName}' executed successfully in ${executionTime}ms`);

      return {
        success: true,
        data: result.content as T,
        executionTime
      };

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logger.error(`Tool '${toolName}' execution failed after ${executionTime}ms:`, error);

      return {
        success: false,
        error: errorMessage,
        executionTime
      };
    }
  }

  /**
   * Get connection status for monitoring
   */
  getStatus(): Record<string, MCPConnectionStatus> {
    const status: Record<string, MCPConnectionStatus> = {};

    for (const [name, connection] of this.connections) {
      status[name] = {
        connected: connection.isConnected,
        toolCount: Object.keys(connection.tools || {}).length,
        lastCheck: connection.lastHealthCheck,
        errorCount: connection.connectionAttempts // Using as error counter
      };
    }

    return status;
  }

  /**
   * Get a specific connection (for advanced usage)
   */
  getConnection(serverName: string): MCPConnection | null {
    return this.connections.get(serverName) || null;
  }

  /**
   * Perform health checks on all connections
   */
  async performHealthChecks(): Promise<void> {
    if (this.connections.size === 0) {
      return;
    }

    logger.debug(`Performing health checks on ${this.connections.size} connections`);

    const healthPromises = Array.from(this.connections.values()).map(async (connection) => {
      try {
        const wasConnected = connection.isConnected;
        const isHealthy = await this.connectionManager.testConnection(connection);

        // If connection status changed, invalidate cache
        if (wasConnected !== connection.isConnected) {
          this.invalidateToolsCache();
        }

        if (!isHealthy) {
          logger.warn(`Health check failed for ${connection.serverName}`);
        }
      } catch (error) {
        logger.error(`Health check error for ${connection.serverName}:`, error);
        connection.isConnected = false;
        this.invalidateToolsCache();
      }
    });

    await Promise.allSettled(healthPromises);
  }

  /**
   * Gracefully disconnect from all servers
   */
  async disconnect(): Promise<void> {
    logger.debug("Disconnecting from all MCP servers");

    // Stop health checks
    this.stopPeriodicHealthChecks();

    // Close all connections
    const disconnectPromises = Array.from(this.connections.values()).map(
      connection => this.connectionManager.closeConnection(connection)
    );

    await Promise.allSettled(disconnectPromises);

    // Clean up resources
    this.connections.clear();
    this.toolsCache = null;
    this.toolRouter.clearCache();

    logger.info("All MCP connections closed and resources cleaned up");
  }

  /**
   * Start periodic health checks
   */
  private startPeriodicHealthChecks(): void {
    // Perform health checks every 30 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch(error => {
        logger.error("Periodic health check failed:", error);
      });
    }, 30000);

    logger.debug("Periodic health checks started");
  }

  /**
   * Stop periodic health checks
   */
  private stopPeriodicHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logger.debug("Periodic health checks stopped");
    }
  }

  /**
   * Validates server configuration
   */
  private isValidConfig(config: MCPServerConfig): boolean {
    return !!(
      config &&
      typeof config === 'object' &&
      config.name &&
      config.url &&
      typeof config.port === 'number' &&
      config.port > 0 &&
      config.port < 65536
    );
  }

  /**
   * Fetch and cache tools for a specific connection
   */
  private async fetchAndCacheTools(connection: MCPConnection): Promise<void> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < MCP_DEFAULTS.MAX_RETRY_ATTEMPTS; attempt++) {
      try {
        const result = await connection.client.listTools();

        if (result?.tools) {
          const toolsObject: Record<string, MCPTool> = {};

          for (const tool of result.tools) {
            if (tool?.name) {
              const toolKey = this.toolRouter.formatToolName(connection.serverName, tool.name);
              toolsObject[toolKey] = {
                name: toolKey,
                description: tool.description || "No description",
                inputSchema: tool.inputSchema || { type: "object" },
                serverName: connection.serverName,
                originalName: tool.name
              };
            }
          }

          connection.tools = toolsObject;
          logger.debug(`Fetched ${Object.keys(toolsObject).length} tools from ${connection.serverName}`);
          return;
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger.warn(`Tools fetch attempt ${attempt + 1} failed for ${connection.serverName}`);

        if (attempt < MCP_DEFAULTS.MAX_RETRY_ATTEMPTS - 1) {
          await new Promise(resolve => setTimeout(resolve, MCP_DEFAULTS.RETRY_DELAY_MS));
        }
      }
    }

    throw new MCPConnectionError(
      `Failed to fetch tools after ${MCP_DEFAULTS.MAX_RETRY_ATTEMPTS} attempts`,
      connection.serverName,
      lastError
    );
  }
} 