/**
 * MCP (Model Context Protocol) related types and configuration
 */

// MCP Server Configuration
export interface MCPServerConfig {
  name: string;
  port: number;
  url: string;
  path?: string;
  env?: Record<string, string>;
  healthEndpoint?: string;
  mcpEndpoint?: string;
}

export interface MCPServerStatus {
  name: string;
  status: "starting" | "ready" | "error" | "stopped";
  port?: number;
  url?: string;
  error?: string;
}

// MCP Service Interface
export interface IMCPService {
  initialize(): Promise<void>;
  getStatus(): {
    initialized: boolean;
    serviceStatus: string;
    workerStatus?: {
      servers?: Record<string, MCPServerStatus>;
    };
  };
  terminate(): Promise<void>;
}

// MCP Server Registry - Central configuration for all MCP servers
export const MCP_SERVERS: Record<string, MCPServerConfig> = {
  gmail: {
    name: "gmail",
    port: 3001,
    url: "http://localhost:3001",
    healthEndpoint: "/health",
    mcpEndpoint: "/mcp",
    // Gmail MCP server loads its own configuration from ~/.gmail-mcp/
  },
  rag: {
    name: "rag",
    port: 3000,
    url: "http://localhost:3000",
    healthEndpoint: "/health",
    mcpEndpoint: "/mcp",
    env: {
      // Environment variables specific to RAG server
      ...(process.env.TURBOPUFFER_API_KEY && {
        TURBOPUFFER_API_KEY: process.env.TURBOPUFFER_API_KEY,
      }),
      ENABLE_PPL_CHUNKING: process.env.ENABLE_PPL_CHUNKING || "false",
      FAST_MODE: process.env.FAST_MODE || "true",
      VERBOSE_LOGS: process.env.VERBOSE_LOGS || "false",
    },
  },
  // Future MCP servers can be added here
  // github: {
  //   name: "github",
  //   port: 3002,
  //   url: "http://localhost:3002",
  //   healthEndpoint: "/health",
  //   mcpEndpoint: "/mcp",
  // },
} as const;

// Helper functions
export function getMCPServerConfig(name: string): MCPServerConfig | undefined {
  return MCP_SERVERS[name];
}

export function getAllMCPServerConfigs(): MCPServerConfig[] {
  return Object.values(MCP_SERVERS);
}

export function getMCPServerUrl(
  name: string,
  endpoint?: string,
): string | undefined {
  const config = getMCPServerConfig(name);
  if (!config) return undefined;

  if (endpoint) {
    return `${config.url}${endpoint}`;
  }
  return config.url;
}
