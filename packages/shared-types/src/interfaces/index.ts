/**
 * Vibe API Interfaces
 * Defines the IPC interface between main and renderer processes
 */

import type { ChatPanelState, ChatPanelRecoveryOptions } from "../browser";

// App API - System-level operations
export interface VibeAppAPI {
  getAppInfo: () => Promise<{
    version: string;
    buildNumber: string;
    nodeVersion: string;
    chromeVersion: string;
    electronVersion: string;
    platform: string;
  }>;
  getPlatform: () => string;
  writeToClipboard: (text: string) => void;
  readFromClipboard: () => Promise<string>;
  showNotification: (title: string, body: string) => void;
  getProcessVersions: () => {
    electron: string;
    chrome: string;
    node: string;
    [key: string]: string;
  };
  gmail: {
    checkAuth: () => Promise<{
      authenticated: boolean;
      hasOAuthKeys: boolean;
      hasCredentials: boolean;
      error?: string;
    }>;
    startAuth: () => Promise<{ success: boolean }>;
    clearAuth: () => Promise<{ success: boolean }>;
  };
  apiKeys: {
    get: (keyName: string) => Promise<string | null>;
    set: (keyName: string, value: string) => Promise<boolean>;
  };
  setAuthToken: (token: string | null) => Promise<{ success: boolean }>;
  completeOnboardingFirstStep: () => Promise<{
    success: boolean;
    error?: string;
  }>;
}

// Actions API - User actions and interactions
export interface VibeActionsAPI {
  [key: string]: any;
}

// Use more flexible interface definitions that allow for implementation variations
export interface VibeBrowserAPI {
  [key: string]: any;
}

export interface VibeTabsAPI {
  [key: string]: any;
}

export interface VibePageAPI {
  [key: string]: any;
}

export interface VibeContentAPI {
  [key: string]: any;
}

export interface VibeInterfaceAPI {
  // Window management
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  setFullscreen: (fullscreen: boolean) => void;
  getWindowState: () => Promise<{
    isMaximized: boolean;
    isMinimized: boolean;
    isFullscreen: boolean;
    bounds: { x: number; y: number; width: number; height: number };
  }>;
  moveWindowTo: (x: number, y: number) => void;
  resizeWindowTo: (width: number, height: number) => void;
  setWindowBounds: (bounds: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }) => void;

  // Chat panel management
  toggleChatPanel: (isVisible: boolean) => void;
  getChatPanelState: () => Promise<ChatPanelState>;
  setChatPanelWidth: (widthPercentage: number) => void;
  onChatPanelVisibilityChanged: (
    callback: (isVisible: boolean) => void,
  ) => () => void;
  recoverChatPanel: (options?: ChatPanelRecoveryOptions) => Promise<{
    success: boolean;
    message?: string;
    error?: string;
  }>;
}

export interface VibeChatAPI {
  [key: string]: any;
}

export interface VibeSettingsAPI {
  [key: string]: any;
}

export interface VibeSessionAPI {
  [key: string]: any;
}

export interface VibeUpdateAPI {
  [key: string]: any;
}

// Global window interface
declare global {
  interface Window {
    vibe: {
      app: VibeAppAPI;
      actions: VibeActionsAPI;
      browser: VibeBrowserAPI;
      tabs: VibeTabsAPI;
      page: VibePageAPI;
      content: VibeContentAPI;
      interface: VibeInterfaceAPI;
      chat: VibeChatAPI;
      settings: VibeSettingsAPI;
      session: VibeSessionAPI;
      update: VibeUpdateAPI;
    };
  }
}
