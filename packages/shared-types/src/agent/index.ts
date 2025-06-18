/**
 * Agent-related shared types
 */

export interface AgentConfig {
  openaiApiKey: string;
  model?: string;
  temperature?: number;
  processorType?: "react" | "coact";
}

export interface AgentStatus {
  ready: boolean;
  initialized: boolean;
  serviceStatus:
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
}

// Interface for what IPC handlers and external components need
export interface IAgentProvider {
  // Core operations
  sendMessage(message: string): Promise<void>;
  getStatus(): AgentStatus;
  reset(): Promise<void>;
  saveTabMemory(url: string, title: string, content: string): Promise<void>;

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
