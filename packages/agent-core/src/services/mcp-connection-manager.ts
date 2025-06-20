/**
 * MCP Connection Manager - Handles individual server connections
 * 
 * Focused responsibility: Create, test, and manage single MCP connections
 * Uses defensive programming and proper resource cleanup.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  createLogger,
  MCPServerConfig,
  MCPConnection,
  MCPConnectionError,
  MCPTimeoutError,
  MCP_DEFAULTS,
  MCP_CLIENT_CONFIG,
  MCP_ENDPOINTS,
  IMCPConnectionManager
} from "@vibe/shared-types";

const logger = createLogger("McpConnectionManager");

export class MCPConnectionManager implements IMCPConnectionManager {

  /**
   * Creates a new MCP connection with proper error handling and timeouts
   */
  async createConnection(config: MCPServerConfig): Promise<MCPConnection> {
    this.validateConfig(config);

    const serverUrl = this.buildServerUrl(config);
    logger.debug(`Creating connection to ${config.name} at ${serverUrl}`);

    // Create transport with proper URL validation
    let transport: StreamableHTTPClientTransport;
    try {
      transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    } catch (error) {
      throw new MCPConnectionError(
        `Invalid server URL: ${serverUrl}`,
        config.name,
        error instanceof Error ? error : new Error(String(error))
      );
    }

    // Create client with consistent naming
    const client = new Client({
      name: `${MCP_CLIENT_CONFIG.NAME_PREFIX}-${config.name}-client`,
      version: MCP_DEFAULTS.CLIENT_VERSION
    });

    const connection: MCPConnection = {
      client,
      transport,
      config,
      serverName: config.name,
      isConnected: false,
      connectionAttempts: 0,
      lastHealthCheck: undefined,
      tools: undefined
    };

    try {
      // Connect with timeout and retry logic
      await this.connectWithTimeout(connection);

      connection.isConnected = true;
      connection.lastHealthCheck = Date.now();

      logger.debug(`Successfully connected to ${config.name}`);
      return connection;

    } catch (error) {
      connection.connectionAttempts++;

      // Clean up transport on failure
      await this.safeCloseTransport(transport);

      const errorMessage = `Failed to connect to ${config.name} MCP server`;
      logger.error(errorMessage, error);

      throw new MCPConnectionError(
        errorMessage,
        config.name,
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Tests if a connection is still healthy
   */
  async testConnection(connection: MCPConnection): Promise<boolean> {
    if (!connection.isConnected) {
      return false;
    }

    try {
      // Simple health check by listing tools with timeout
      const healthCheckPromise = connection.client.listTools();
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new MCPTimeoutError(
          'Health check timeout',
          connection.serverName
        )), 5000)
      );

      await Promise.race([healthCheckPromise, timeoutPromise]);

      connection.lastHealthCheck = Date.now();
      return true;

    } catch (error) {
      logger.warn(`Health check failed for ${connection.serverName}:`, error);
      connection.isConnected = false;
      return false;
    }
  }

  /**
   * Gracefully closes a connection with proper cleanup
   */
  async closeConnection(connection: MCPConnection): Promise<void> {
    try {
      if (connection.isConnected) {
        await this.safeCloseTransport(connection.transport);
        connection.isConnected = false;
        logger.debug(`Closed connection to ${connection.serverName}`);
      }
    } catch (error) {
      logger.error(`Error closing connection to ${connection.serverName}:`, error);
      // Still mark as disconnected even if close failed
      connection.isConnected = false;
    }
  }

  /**
   * Validates server configuration
   */
  private validateConfig(config: MCPServerConfig): void {
    if (!config) {
      throw new MCPConnectionError("Configuration is required");
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new MCPConnectionError("Server name is required and must be a string");
    }

    if (!config.url || typeof config.url !== 'string') {
      throw new MCPConnectionError("Server URL is required and must be a string", config.name);
    }

    if (typeof config.port !== 'number' || config.port <= 0 || config.port >= 65536) {
      throw new MCPConnectionError("Server port must be a valid number between 1 and 65535", config.name);
    }
  }

  /**
   * Builds the complete server URL with endpoint
   */
  private buildServerUrl(config: MCPServerConfig): string {
    const endpoint = config.mcpEndpoint || MCP_ENDPOINTS.DEFAULT;
    return `${config.url}${endpoint}`;
  }

  /**
   * Connect with timeout and proper error handling
   */
  private async connectWithTimeout(connection: MCPConnection): Promise<void> {
    const connectPromise = connection.client.connect(connection.transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new MCPTimeoutError(
        `Connection timeout after ${MCP_DEFAULTS.CONNECTION_TIMEOUT_MS}ms`,
        connection.config.name
      )), MCP_DEFAULTS.CONNECTION_TIMEOUT_MS)
    );

    await Promise.race([connectPromise, timeoutPromise]);
  }

  /**
   * Safely close transport with error handling
   */
  private async safeCloseTransport(transport: StreamableHTTPClientTransport): Promise<void> {
    try {
      await transport.close();
    } catch (error) {
      // Log but don't throw - close operations should be resilient
      logger.debug("Transport close error (non-fatal):", error);
    }
  }
} 