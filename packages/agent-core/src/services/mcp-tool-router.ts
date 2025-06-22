/**
 * MCP Tool Router - Tool name parsing and routing
 */

import { MCPConnection, IMCPToolRouter } from "@vibe/shared-types";

export class MCPToolRouter implements IMCPToolRouter {
  private static readonly SEPARATOR = ":";

  /**
   * Parse tool name into server and original name
   */
  parseToolName(
    toolName: string,
  ): { serverName: string; originalName: string } | null {
    if (!toolName || typeof toolName !== "string") {
      return null;
    }

    if (toolName.includes(MCPToolRouter.SEPARATOR)) {
      const [serverName, originalName] = toolName.split(
        MCPToolRouter.SEPARATOR,
        2,
      );
      if (serverName && originalName) {
        return {
          serverName: serverName.trim(),
          originalName: originalName.trim(),
        };
      }
    }

    return null;
  }

  /**
   * Find connection for a tool
   */
  findTool(
    toolName: string,
    connections: Map<string, MCPConnection>,
  ): MCPConnection | null {
    // Try namespaced tool first
    const parsed = this.parseToolName(toolName);
    if (parsed) {
      const connection = connections.get(parsed.serverName);
      if (connection?.isConnected) {
        return connection;
      }
      return null;
    }

    // Search all connections for tool
    for (const connection of connections.values()) {
      if (connection.isConnected && connection.tools) {
        for (const tool of Object.values(connection.tools)) {
          if (tool?.originalName === toolName || tool?.name === toolName) {
            return connection;
          }
        }
      }
    }

    return null;
  }

  /**
   * Format tool name with namespace
   */
  formatToolName(serverName: string, originalName: string): string {
    return `${serverName}${MCPToolRouter.SEPARATOR}${originalName}`;
  }

  /**
   * Get original tool name from namespaced name
   */
  getOriginalToolName(toolName: string): string {
    const parsed = this.parseToolName(toolName);
    return parsed ? parsed.originalName : toolName;
  }

  /**
   * Simple validation
   */
  validateToolName(toolName: string): boolean {
    return !!(toolName && typeof toolName === "string");
  }

  /**
   * Clear any internal state
   */
  clearCache(): void {
    // No cache to clear in this implementation
  }
}
