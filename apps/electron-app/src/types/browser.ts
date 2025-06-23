/**
 * Electron App Browser Types
 * Browser-related types specific to the electron app
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
 * Favicon interface for tab management
 */
export interface FavIcon {
  hostname: string;
  faviconUrl: string;
}

/**
 * CDP metadata for tab debugging and automation
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
 * Comprehensive tab state with visibility architecture and sleep system
 */
export interface TabState {
  // === CORE TAB IDENTITY ===
  key: string;
  url: string;
  title: string;
  favicon?: string;

  // === NAVIGATION STATE ===
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;

  // === AGENT INTEGRATION ===
  isAgentActive?: boolean;
  isCompleted?: boolean;
  isFallback?: boolean;

  // === CDP INTEGRATION ===
  cdpMetadata?: CDPMetadata;

  // === LIFECYCLE TIMESTAMPS ===
  createdAt?: number;
  lastActiveAt?: number;

  // === VISIBILITY ARCHITECTURE ===
  visible?: boolean;

  // === TAB POSITIONING SYSTEM ===
  position?: number;

  // === SLEEP SYSTEM (Memory Optimization) ===
  asleep?: boolean;
}
