/**
 * Enhanced MCP Types - Type-safe interfaces and utilities
 */

// Base MCP types (avoiding circular imports)
export interface MCPServerConfig {
  name: string;
  port: number;
  url: string;
  path?: string;
  env?: Record<string, string>;
  healthEndpoint?: string;
  mcpEndpoint?: string;
}

// Tool schema with proper typing
export interface MCPToolSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

// Enhanced connection interface (generic to avoid SDK dependency in shared-types)
export interface MCPConnection<TClient = any, TTransport = any> {
  readonly client: TClient;
  readonly transport: TTransport;
  readonly config: MCPServerConfig;
  readonly serverName: string;
  isConnected: boolean;
  tools?: Record<string, MCPTool>;
  lastHealthCheck?: number;
  connectionAttempts: number;
}

// Tool-related types with better typing
export interface MCPTool {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: MCPToolSchema;
  readonly serverName: string;
  readonly originalName: string;
}

export interface MCPCallResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  executionTime?: number;
}

// Manager interfaces with improved signatures
export interface IMCPConnectionManager {
  createConnection(config: MCPServerConfig): Promise<MCPConnection>;
  testConnection(connection: MCPConnection): Promise<boolean>;
  closeConnection(connection: MCPConnection): Promise<void>;
}

export interface IMCPToolRouter {
  parseToolName(
    toolName: string,
  ): { serverName: string; originalName: string } | null;
  findTool(
    toolName: string,
    connections: Map<string, MCPConnection>,
  ): MCPConnection | null;
  formatToolName(serverName: string, originalName: string): string;
  getOriginalToolName(toolName: string): string;
  validateToolName(toolName: string): boolean;
}

export interface IMCPManager {
  initialize(configs: MCPServerConfig[]): Promise<void>;
  getConnection(serverName: string): MCPConnection | null;
  getAllTools(): Promise<Record<string, MCPTool>>;
  callTool<T = unknown>(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPCallResult<T>>;
  getStatus(): Record<string, MCPConnectionStatus>;
  performHealthChecks(): Promise<void>;
  disconnect(): Promise<void>;
}

// Enhanced status interface
export interface MCPConnectionStatus {
  connected: boolean;
  toolCount: number;
  lastCheck?: number;
  errorCount?: number;
}

// Configuration validation
export interface MCPConfigValidator {
  validateServerConfig(config: unknown): config is MCPServerConfig;
  validateToolName(toolName: string): boolean;
  validateToolArgs(args: unknown): boolean;
}
