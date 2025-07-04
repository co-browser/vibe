// Agent Core - Main export module
// Clean separation of concerns

export * from "./types";
// New Agent Architecture exports
export { Agent } from "./agent";
export { AgentFactory } from "./factory";

// Managers
export { ToolManager } from "./managers/tool-manager";
export { StreamProcessor } from "./managers/stream-processor";

// React framework
export * from "./react/index";

// Interfaces
export * from "./interfaces/index";

// MCP Services
export { MCPManager } from "./services/mcp-manager";
export { MCPConnectionManager } from "./services/mcp-connection-manager";
export { MCPToolRouter } from "./services/mcp-tool-router";
