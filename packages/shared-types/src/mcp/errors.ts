/**
 * MCP Error Types - Shared across MCP implementations
 */

export class MCPError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly serverName?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "MCPError";
  }
}

export class MCPConnectionError extends MCPError {
  constructor(message: string, serverName?: string, cause?: Error) {
    super(message, "MCP_CONNECTION_ERROR", serverName, cause);
    this.name = "MCPConnectionError";
  }
}

export class MCPToolError extends MCPError {
  constructor(
    message: string,
    serverName?: string,
    toolName?: string,
    cause?: Error,
  ) {
    super(message, "MCP_TOOL_ERROR", serverName, cause);
    this.name = "MCPToolError";
    this.toolName = toolName;
  }

  public readonly toolName?: string;
}

export class MCPConfigurationError extends MCPError {
  constructor(message: string, serverName?: string, cause?: Error) {
    super(message, "MCP_CONFIGURATION_ERROR", serverName, cause);
    this.name = "MCPConfigurationError";
  }
}

export class MCPTimeoutError extends MCPError {
  constructor(message: string, serverName?: string, cause?: Error) {
    super(message, "MCP_TIMEOUT_ERROR", serverName, cause);
    this.name = "MCPTimeoutError";
  }
}
