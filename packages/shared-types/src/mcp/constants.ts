/**
 * MCP Constants - Centralized configuration values
 */

export const MCP_DEFAULTS = {
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 1000,
  CONNECTION_TIMEOUT_MS: 10000,
  TOOL_EXECUTION_TIMEOUT_MS: 120000,
  CLIENT_VERSION: "1.0.0",
} as const;

export const MCP_TOOL_PREFIXES = {
  RAG: "rag",
  GMAIL: "gmail",
} as const;

export const MCP_ENDPOINTS = {
  DEFAULT: "/mcp",
  HEALTH: "/health",
} as const;

export const MCP_CLIENT_CONFIG = {
  NAME_PREFIX: "agent",
  USER_AGENT: "vibe-mcp-client",
} as const;
