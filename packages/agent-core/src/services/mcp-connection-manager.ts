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
  IMCPConnectionManager,
  GmailTokens,
} from "@vibe/shared-types";

const logger = createLogger("McpConnectionManager");

export class MCPConnectionManager implements IMCPConnectionManager {
  private authToken: string | null = null;
  private gmailTokens: GmailTokens | null = null;

  /**
   * Set the auth token for cloud connections
   */
  setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  /**
   * Set Gmail OAuth tokens for cloud Gmail MCP connections
   */
  setGmailTokens(tokens: GmailTokens | null): void {
    logger.debug(
      `[DEBUG] setGmailTokens called with:`,
      tokens
        ? {
            access_token: tokens.access_token ? "present" : "missing",
            refresh_token: tokens.refresh_token ? "present" : "missing",
            expiry_date: tokens.expiry_date,
            token_type: tokens.token_type,
          }
        : "null",
    );
    this.gmailTokens = tokens;
  }

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
      const transportOptions: any = {};

      // Add auth header for cloud servers
      if (this.authToken && config.name === "rag") {
        // RAG server always needs auth when token is present
        transportOptions.requestInit = {
          headers: {
            Authorization: `Bearer ${this.authToken}`,
          },
        };
        logger.debug(`Adding auth header for RAG server connection`);
      }

      // Gmail server needs OAuth tokens (and optionally auth token)
      if (config.name === "gmail") {
        const headers: Record<string, string> = {};

        // Add Privy auth token if available (for cloud mode)
        if (this.authToken) {
          headers.Authorization = `Bearer ${this.authToken}`;
        }

        // Add Gmail OAuth tokens if available
        if (this.gmailTokens) {
          headers["X-Gmail-Access-Token"] = this.gmailTokens.access_token;
          if (this.gmailTokens.refresh_token) {
            headers["X-Gmail-Refresh-Token"] = this.gmailTokens.refresh_token;
          }
          if (this.gmailTokens.expiry_date) {
            headers["X-Gmail-Token-Expiry"] =
              this.gmailTokens.expiry_date.toString();
          }
          if (this.gmailTokens.token_type) {
            headers["X-Gmail-Token-Type"] = this.gmailTokens.token_type;
          }
          logger.debug(`Adding Gmail OAuth tokens to headers for Gmail server`);
          logger.debug(`[DEBUG] Gmail headers being sent:`, {
            "X-Gmail-Access-Token": headers["X-Gmail-Access-Token"]
              ? "present"
              : "missing",
            "X-Gmail-Refresh-Token": headers["X-Gmail-Refresh-Token"]
              ? "present"
              : "missing",
            "X-Gmail-Token-Expiry": headers["X-Gmail-Token-Expiry"],
            "X-Gmail-Token-Type": headers["X-Gmail-Token-Type"],
            Authorization: headers.Authorization ? "present" : "missing",
          });
        } else {
          logger.warn(
            `No Gmail tokens available for Gmail server connection - tokens will need to be provided later`,
          );
        }

        transportOptions.requestInit = { headers };
        logger.debug(`Adding auth headers for Gmail server connection`);
        logger.debug(
          `[DEBUG] Final transport options:`,
          JSON.stringify(transportOptions, null, 2),
        );
      }

      transport = new StreamableHTTPClientTransport(
        new URL(serverUrl),
        transportOptions,
      );
    } catch (error) {
      throw new MCPConnectionError(
        `Invalid server URL: ${serverUrl}`,
        config.name,
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    // Create client with consistent naming
    const client = new Client({
      name: `${MCP_CLIENT_CONFIG.NAME_PREFIX}-${config.name}-client`,
      version: MCP_DEFAULTS.CLIENT_VERSION,
    });

    const connection: MCPConnection = {
      client,
      transport,
      config,
      serverName: config.name,
      isConnected: false,
      connectionAttempts: 0,
      lastHealthCheck: undefined,
      tools: undefined,
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

      let errorMessage = `Failed to connect to ${config.name} MCP server at ${serverUrl}`;

      // Check if error message contains HTML (404 response)
      if (error instanceof Error && error.message.includes("<!DOCTYPE html>")) {
        errorMessage +=
          " - Server returned 404. The server may still be initializing.";
        logger.warn(errorMessage);
      } else {
        logger.error(errorMessage, error);
      }

      throw new MCPConnectionError(
        errorMessage,
        config.name,
        error instanceof Error ? error : new Error(String(error)),
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
        setTimeout(
          () =>
            reject(
              new MCPTimeoutError(
                "Health check timeout",
                connection.serverName,
              ),
            ),
          5000,
        ),
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
      logger.error(
        `Error closing connection to ${connection.serverName}:`,
        error,
      );
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

    if (!config.name || typeof config.name !== "string") {
      throw new MCPConnectionError(
        "Server name is required and must be a string",
      );
    }

    if (!config.url || typeof config.url !== "string") {
      throw new MCPConnectionError(
        "Server URL is required and must be a string",
        config.name,
      );
    }

    if (
      typeof config.port !== "number" ||
      config.port <= 0 ||
      config.port >= 65536
    ) {
      throw new MCPConnectionError(
        "Server port must be a valid number between 1 and 65535",
        config.name,
      );
    }
  }

  /**
   * Builds the complete server URL with endpoint
   */
  private buildServerUrl(config: MCPServerConfig): string {
    const endpoint = config.mcpEndpoint || config.path || MCP_ENDPOINTS.DEFAULT;
    return `${config.url}${endpoint}`;
  }

  /**
   * Connect with timeout and proper error handling
   */
  private async connectWithTimeout(connection: MCPConnection): Promise<void> {
    const connectPromise = connection.client.connect(connection.transport);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new MCPTimeoutError(
              `Connection timeout after ${MCP_DEFAULTS.CONNECTION_TIMEOUT_MS}ms`,
              connection.config.name,
            ),
          ),
        MCP_DEFAULTS.CONNECTION_TIMEOUT_MS,
      ),
    );

    await Promise.race([connectPromise, timeoutPromise]);
  }

  /**
   * Safely close transport with error handling
   */
  private async safeCloseTransport(
    transport: StreamableHTTPClientTransport,
  ): Promise<void> {
    try {
      await transport.close();
    } catch (error) {
      // Log but don't throw - close operations should be resilient
      logger.debug("Transport close error (non-fatal):", error);
    }
  }
}
