/**
 * Browser and CDP-related shared types
 */

/**
 * Layout and UI Management Types
 */
export interface LayoutContextType {
  isChatPanelVisible: boolean;
  chatPanelWidth: number;
  setChatPanelVisible: (visible: boolean) => void;
  setChatPanelWidth: (width: number) => void;
  chatPanelKey: number;
  isRecovering: boolean;
  isChatMinimizedFromResize: boolean; // New field to track if chat was closed due to resize
  setIsChatMinimizedFromResize: (minimized: boolean) => void; // Setter for the minimized state
}

export interface ChatPanelState {
  isVisible: boolean;
  width?: number;
}

export interface ChatPanelRecoveryOptions {
  debounceMs?: number;
  healthCheckIntervalMs?: number;
  recoveryOverlayMs?: number;
  powerSaveBlocker?: boolean;
}

export type DownloadItem = {
  id: string;
  createdAt: number;
  fileName: string;
  filePath: string;
  exists: boolean;
  status?: "downloading" | "completed" | "cancelled" | "error";
  progress?: number; // 0-100
  totalBytes?: number;
  receivedBytes?: number;
  startTime?: number;
};

/**
 * IPC Event Payload Types
 * Type-safe definitions for IPC message payloads
 */
export interface IPCEventPayloads {
  "sync-chat-panel-state": ChatPanelState;
  "chat-area-visibility-changed": boolean;
  "toggle-custom-chat-area": boolean;
  "interface:get-chat-panel-state": never; // No payload
  "interface:set-chat-panel-width": number;
  "interface:recover-chat-panel": never; // No payload
}

/**
 * Comprehensive metadata for CDP connections and state tracking
 */
export interface CDPMetadata {
  /** CDP target ID for connecting to this tab */
  cdpTargetId: string;
  /** Remote debugging port */
  debuggerPort: number;
  /** WebSocket URL for CDP debugging */
  webSocketDebuggerUrl?: string;
  /** DevTools frontend URL */
  devtoolsFrontendUrl?: string;
  /** Whether the debugger is currently attached */
  isAttached: boolean;
  /** Number of connection attempts made */
  connectionAttempts: number;
  /** Maximum number of connection attempts allowed */
  maxAttempts: number;
  /** Timestamp of last connection attempt */
  lastConnectTime: number;
  /** Original URL when tab was created */
  originalUrl: string;
  /** Current URL of the tab */
  currentUrl: string;
  /** Timestamp of last navigation event */
  lastNavigationTime: number;
  /** Debug tracking information */
  debugInfo: {
    /** Timestamp when CDP connection was established */
    cdpConnectTime: number;
    /** Timestamp of last CDP command */
    lastCommandTime: number;
    /** Timestamp of last error */
    lastErrorTime: number;
    /** Last error message */
    lastErrorMessage: string;
    /** Total number of CDP commands sent */
    commandCount: number;
    /** Total number of CDP events received */
    eventCount: number;
  };
}

/**
 * CDP target information from remote debugging API
 */
export interface CDPTarget {
  /** Unique target identifier */
  id: string;
  /** Target URL */
  url: string;
  /** Target type (usually 'page') */
  type: string;
  /** Target title */
  title?: string;
  /** Whether target is attached */
  attached?: boolean;
  /** Browser context ID */
  browserContextId?: string;
  /** WebSocket URL for debugging this target */
  webSocketDebuggerUrl: string;
  /** DevTools frontend URL for this target */
  devtoolsFrontendUrl?: string;
}

/**
 * CDP error categories for error handling and recovery
 */
export enum CDPErrorType {
  /** Failed to establish CDP connection */
  CONNECTION_FAILED = "connection_failed",
  /** Failed to attach debugger to WebContents */
  DEBUGGER_ATTACH_FAILED = "debugger_attach_failed",
  /** Failed to enable required CDP domains */
  DOMAIN_ENABLE_FAILED = "domain_enable_failed",
  /** Target not found during polling */
  TARGET_NOT_FOUND = "target_not_found",
  /** CDP command timed out */
  COMMAND_TIMEOUT = "command_timeout",
  /** General CDP protocol error */
  PROTOCOL_ERROR = "protocol_error",
}

export interface TabInfo {
  id: string;
  url: string;
  title: string;
  cdpTargetId: string;
  isActive: boolean;
}

export interface PageContent {
  title: string;
  url: string;
  excerpt: string;
  content: string;
  textContent: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  modifiedTime?: string;
  lang?: string;
  dir?: string;
}

export interface PageMetadata {
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
  };
  twitter?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    creator?: string;
  };
  jsonLd?: any[];
  microdata?: any[];
}

export interface ExtractedPage extends PageContent {
  metadata: PageMetadata;
  images: Array<{
    src: string;
    alt?: string;
    title?: string;
  }>;
  links: Array<{
    href: string;
    text: string;
    rel?: string;
  }>;
  actions: Array<{
    type: "button" | "link" | "form";
    selector: string;
    text: string;
    attributes: Record<string, string>;
  }>;
  extractionTime: number;
  contentLength: number;
}
