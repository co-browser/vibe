/**
 * MCP Tool Router - Handles tool name parsing and routing
 * 
 * Focused responsibility: Parse tool names and route calls to correct servers
 */

import {
  createLogger,
  MCPConnection,
  MCPTool,
  IMCPToolRouter
} from "@vibe/shared-types";

const logger = createLogger("McpToolRouter");

export class MCPToolRouter implements IMCPToolRouter {
  private static readonly TOOL_NAME_SEPARATOR = ':';
  private static readonly TOOL_NAME_PATTERN = /^[a-z0-9_-]+$/i;
  private static readonly NAMESPACED_PATTERN = /^[a-z0-9_-]+:[a-z0-9_-]+$/i;

  // Cache for parsed tool names to improve performance
  private readonly parseCache = new Map<string, { serverName: string; originalName: string } | null>();

  /**
   * Parses a tool name to extract server and original tool name
   * Uses caching for performance optimization
   * 
   * @param toolName - Tool name in format "server:tool" or just "tool"
   * @returns Parsed components or null if invalid
   */
  parseToolName(toolName: string): { serverName: string; originalName: string } | null {
    if (!toolName || typeof toolName !== 'string') {
      return null;
    }

    // Check cache first
    if (this.parseCache.has(toolName)) {
      return this.parseCache.get(toolName)!;
    }

    let result: { serverName: string; originalName: string } | null = null;

    // Handle namespaced tools (preferred format)
    if (toolName.includes(MCPToolRouter.TOOL_NAME_SEPARATOR)) {
      const separatorIndex = toolName.indexOf(MCPToolRouter.TOOL_NAME_SEPARATOR);
      const serverName = toolName.substring(0, separatorIndex).trim();
      const originalName = toolName.substring(separatorIndex + 1).trim();

      if (serverName && originalName) {
        result = { serverName, originalName };
      }
    }

    // Cache the result
    this.parseCache.set(toolName, result);
    return result;
  }

  /**
   * Finds the connection that contains a specific tool
   * Optimized search with early returns
   * 
   * @param toolName - Tool name to search for
   * @param connections - Map of server connections
   * @returns Connection containing the tool, or null if not found
   */
  findTool(toolName: string, connections: Map<string, MCPConnection>): MCPConnection | null {
    // First try parsing as namespaced tool
    const parsed = this.parseToolName(toolName);
    if (parsed) {
      const connection = connections.get(parsed.serverName);
      if (connection?.isConnected && this.hasToolInConnection(connection, parsed.originalName)) {
        return connection;
      }
      return null;
    }

    // Legacy fallback: search all connections for tool name
    for (const connection of connections.values()) {
      if (connection.isConnected && this.hasToolInConnection(connection, toolName)) {
        logger.debug(`Found tool '${toolName}' in server '${connection.serverName}' (legacy mode)`);
        return connection;
      }
    }

    return null;
  }

  /**
   * Formats a tool name with server namespace
   * Validates inputs for safety
   */
  formatToolName(serverName: string, originalName: string): string {
    if (!serverName || !originalName) {
      throw new Error("Both serverName and originalName are required");
    }
    return `${serverName}${MCPToolRouter.TOOL_NAME_SEPARATOR}${originalName}`;
  }

  /**
   * Gets the original tool name from a potentially namespaced tool name
   */
  getOriginalToolName(toolName: string): string {
    const parsed = this.parseToolName(toolName);
    return parsed ? parsed.originalName : toolName;
  }

  /**
   * Validates if a tool name follows the expected format
   * Uses precompiled regex patterns for performance
   */
  validateToolName(toolName: string): boolean {
    if (!toolName || typeof toolName !== 'string') {
      return false;
    }

    return MCPToolRouter.NAMESPACED_PATTERN.test(toolName) ||
      MCPToolRouter.TOOL_NAME_PATTERN.test(toolName);
  }

  /**
   * Clears the internal parsing cache
   * Useful for memory management in long-running processes
   */
  clearCache(): void {
    this.parseCache.clear();
    logger.debug("Tool name parsing cache cleared");
  }

  /**
   * Gets cache statistics for monitoring
   */
  getCacheStats(): { size: number; hitRate?: number } {
    return {
      size: this.parseCache.size,
      // Note: Hit rate tracking would require additional counters
    };
  }

  /**
   * Checks if a connection has a specific tool available
   * Optimized with early returns and null checks
   */
  private hasToolInConnection(connection: MCPConnection, toolName: string): boolean {
    const tools = connection.tools;
    if (!tools || typeof tools !== 'object') {
      return false;
    }

    // Check both original tool names and formatted tool names efficiently
    for (const tool of Object.values(tools)) {
      if (this.isValidTool(tool) &&
        (tool.originalName === toolName || tool.name === toolName)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Type guard to ensure tool object is valid
   */
  private isValidTool(tool: unknown): tool is MCPTool {
    return typeof tool === 'object' &&
      tool !== null &&
      'originalName' in tool &&
      'name' in tool;
  }
} 