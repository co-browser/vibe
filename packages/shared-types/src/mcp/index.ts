/**
 * MCP (Model Context Protocol) - Centralized exports and configuration
 *
 * This module provides a clean interface for MCP functionality across the application.
 * It includes type definitions, error classes, constants, and factory functions.
 */

// Export enhanced types and utilities
export * from "./types.js";
export * from "./errors.js";
export * from "./constants.js";

// Import for use in this file
import type { MCPServerConfig } from "./types.js";

/**
 * Process-level status interface for MCP server monitoring.
 * Used by Electron main process for tracking spawned MCP server processes.
 */
export interface MCPServerStatus {
  name: string;
  status: "starting" | "ready" | "error" | "stopped";
  port?: number;
  url?: string;
  error?: string;
}

/**
 * Service lifecycle interface for Electron main process MCP management.
 * Handles spawning, monitoring, and terminating MCP servers as child processes.
 * For direct MCP operations (tool execution), use IMCPManager.
 */
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

/**
 * Static MCP Server Registry
 * Contains base configuration for all supported MCP servers
 */
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
  // Future MCP servers can be added here:
  // github: {
  //   name: "github",
  //   port: 3002,
  //   url: "http://localhost:3002",
  //   healthEndpoint: "/health",
  //   mcpEndpoint: "/mcp",
  // },
} as const;

/**
 * Get base configuration for a specific MCP server
 *
 * @param name - Server name (e.g., "rag", "gmail")
 * @returns Base configuration without environment variables
 */
export function getMCPServerBaseConfig(
  name: string,
): Omit<MCPServerConfig, "env"> | undefined {
  return MCP_SERVERS_BASE[name];
}

/**
 * Get all available MCP server base configurations
 *
 * @returns Array of base configurations without environment variables
 */
export function getAllMCPServerBaseConfigs(): Omit<MCPServerConfig, "env">[] {
  return Object.values(MCP_SERVERS_BASE);
}

/**
 * Construct a URL for an MCP server endpoint
 *
 * @param name - Server name
 * @param endpoint - Optional endpoint path (e.g., "/mcp", "/health")
 * @returns Complete URL or undefined if server not found
 */
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

/**
 * Create a runtime MCP server configuration (main process only)
 * Combines base configuration with environment-specific settings
 *
 * @param name - Server name
 * @param envVars - Environment variables for server configuration
 * @returns Complete server configuration or undefined if not found
 */
export function createMCPServerConfig(
  name: string,
  envVars?: Record<string, string>,
): MCPServerConfig | undefined {
  const baseConfig = getMCPServerBaseConfig(name);
  if (!baseConfig) return undefined;

  // Build environment-specific configuration
  const env: Record<string, string> = {};
  let url = baseConfig.url;
  let port = baseConfig.port;

  switch (name) {
    case "rag":
      if (envVars) {
        // Check for cloud RAG server URL
        if (envVars.RAG_SERVER_URL) {
          const cloudUrl = new URL(envVars.RAG_SERVER_URL);
          url = cloudUrl.origin;
          port =
            parseInt(cloudUrl.port) ||
            (cloudUrl.protocol === "https:" ? 443 : 80);
        }

        Object.assign(env, {
          ...(envVars.TURBOPUFFER_API_KEY && {
            TURBOPUFFER_API_KEY: envVars.TURBOPUFFER_API_KEY,
          }),
          ENABLE_PPL_CHUNKING: envVars.ENABLE_PPL_CHUNKING || "false",
          FAST_MODE: envVars.FAST_MODE || "true",
          VERBOSE_LOGS: envVars.VERBOSE_LOGS || "false",
        });
      }
      break;

    case "gmail":
      // Gmail MCP server manages its own configuration
      // No environment variables needed from agent
      break;

    default:
      // Future servers can add their environment configuration here
      break;
  }

  return {
    ...baseConfig,
    url,
    port,
    env,
  };
}

/**
 * Create all available MCP server configurations (main process only)
 *
 * @param envVars - Environment variables for server configuration
 * @returns Array of complete server configurations
 */
export function getAllMCPServerConfigs(
  envVars?: Record<string, string>,
): MCPServerConfig[] {
  return Object.keys(MCP_SERVERS_BASE)
    .map(name => createMCPServerConfig(name, envVars))
    .filter((config): config is MCPServerConfig => config !== undefined);
}
