// Agent Core - Main export module
// Clean separation of concerns

export * from "./types.js";
// New Agent Architecture exports
export { Agent } from "./agent.js";
export { AgentFactory } from "./factory.js";

// Managers
export { ToolManager } from "./managers/tool-manager.js";
export { StreamProcessor } from "./managers/stream-processor.js";

// React framework
export * from "./react/index.js";



// MCP Services
export { MCPManager } from "./services/mcp-manager.js";
export { MCPConnectionManager } from "./services/mcp-connection-manager.js";
export { MCPToolRouter } from "./services/mcp-tool-router.js";
