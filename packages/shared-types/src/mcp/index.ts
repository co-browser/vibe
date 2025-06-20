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

// Base MCP Server Registry - Static configuration only
export const MCP_SERVERS_BASE: Record<string, Omit<MCPServerConfig, "env">> = {
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

// Helper functions for static configuration
export function getMCPServerBaseConfig(
  name: string,
): Omit<MCPServerConfig, "env"> | undefined {
  return MCP_SERVERS_BASE[name];
}

export function getAllMCPServerBaseConfigs(): Omit<MCPServerConfig, "env">[] {
  return Object.values(MCP_SERVERS_BASE);
}

export function getMCPServerUrl(
  name: string,
  endpoint?: string,
): string | undefined {
  const config = getMCPServerBaseConfig(name);
  if (!config) return undefined;

  if (endpoint) {
    return `${config.url}${endpoint}`;
  }
  return config.url;
}

// Factory function for creating runtime configuration (main process only)
export function createMCPServerConfig(
  name: string,
  envVars?: Record<string, string>,
): MCPServerConfig | undefined {
  const baseConfig = getMCPServerBaseConfig(name);
  if (!baseConfig) return undefined;

  // Add environment-specific configuration
  let env: Record<string, string> = {};

  if (name === "rag" && envVars) {
    env = {
      ...(envVars.TURBOPUFFER_API_KEY && {
        TURBOPUFFER_API_KEY: envVars.TURBOPUFFER_API_KEY,
      }),
      ENABLE_PPL_CHUNKING: envVars.ENABLE_PPL_CHUNKING || "false",
      FAST_MODE: envVars.FAST_MODE || "true",
      VERBOSE_LOGS: envVars.VERBOSE_LOGS || "false",
    };
  }

  return {
    ...baseConfig,
    env,
  };
}

// Factory function for getting all runtime configurations (main process only)
export function getAllMCPServerConfigs(
  envVars?: Record<string, string>,
): MCPServerConfig[] {
  return Object.keys(MCP_SERVERS_BASE)
    .map(name => createMCPServerConfig(name, envVars))
    .filter((config): config is MCPServerConfig => config !== undefined);
}
