/**
 * Agent-related shared types
 */

import type { ExtractedPage } from "../browser/index";

export type ProcessorType = "react" | "coact";

export interface AgentConfig {
  openaiApiKey?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  processorType?: ProcessorType;
  keepAlive?: string;
  mcp?: {
    enabled: boolean;
    url: string;
  };
  tools?: string[];
  systemPrompt?: string;
  conversationHistory?: [string, string][];
  authToken?: string;
}

export interface AgentStatus {
  ready: boolean;
  initialized: boolean;
  serviceStatus:
    | "no_api_key"
    | "disconnected"
    | "initializing"
    | "ready"
    | "processing"
    | "error";
  workerStatus?: {
    connected: boolean;
    restartCount: number;
    isRestarting: boolean;
    lastHealthCheck: number;
  };
  config?: Partial<AgentConfig>;
  lastActivity?: number;
  isHealthy?: boolean;
  hasApiKey?: boolean;
}

// Interface for what IPC handlers and external components need
export interface IAgentProvider {
  // Core operations
  sendMessage(message: string): Promise<void>;
  getStatus(): AgentStatus;
  reset(): Promise<void>;
  saveTabMemory(extractedPage: ExtractedPage): Promise<void>;
  updateAuthToken(token: string | null): Promise<void>;

  // Event handling
  on(event: "message-stream", listener: (data: any) => void): void;
  on(event: "error", listener: (error: Error) => void): void;
  on(event: "ready", listener: (data: any) => void): void;
  removeListener(event: string, listener: (...args: any[]) => void): void;
}

// Full service interface for testing and implementation contracts
export interface IAgentService extends IAgentProvider {
  // Lifecycle management
  initialize(config: AgentConfig): Promise<void>;
  terminate(): Promise<void>;
  forceTerminate(): Promise<void>;
  canTerminate(): { canTerminate: boolean; reason?: string };

  // Additional status methods
  getLifecycleState(): {
    hasWorker: boolean;
    hasConfig: boolean;
    status: string;
    lastActivity: number;
    uptime?: number;
  };

  // Health monitoring
  performHealthCheck?(): Promise<boolean>;
}

export interface MemoryNote {
  id: string;
  url: string;
  title: string;
  synopsis: string;
  tags: string[];
  sourceId: string;
  domain?: string; // Domain extracted from URL
  createdAt: string;
  score?: number;
}

// MCP Tool Result Types
export interface MCPToolResult {
  result?:
    | {
        content?: Array<{
          text: string;
        }>;
      }
    | string;
}

export interface MCPGenerateTextResult {
  toolResults?: MCPToolResult[];
}

import type { ContentChunk } from "../content";

export interface MCPSearchMemoryData {
  type: "memory_discovery" | "content_search" | "recent_memories";
  query?: string;
  memories?: MemoryNote[];
  content_chunks?: ContentChunk[];
  discovered_domains?: string[];
}

export interface MCPContentData {
  type: "content_search";
  query: string;
  source_filter?: string;
  content_chunks: ContentChunk[];
}
