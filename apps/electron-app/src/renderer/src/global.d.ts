/// <reference types="vite/client" />

/**
 * Global type definitions for the renderer process
 * This file consolidates all Window interface extensions
 */

import type {
  VibeAppAPI,
  VibeActionsAPI,
  VibeBrowserAPI,
  VibeTabsAPI,
  VibePageAPI,
  VibeContentAPI,
  VibeInterfaceAPI,
  VibeChatAPI,
  VibeSettingsAPI,
  VibeSessionAPI,
  VibeUpdateAPI,
} from "@vibe/shared-types";

// Import overlay types
import type { OverlayAPI } from "./types/overlay";

/**
 * Profile API for user profile management
 */
interface VibeProfileAPI {
  getNavigationHistory: (
    query?: string,
    limit?: number,
  ) => Promise<
    Array<{
      url: string;
      title: string;
      timestamp: number;
      visitCount: number;
      lastVisit: number;
      favicon?: string;
    }>
  >;
  clearNavigationHistory: () => Promise<boolean>;
  getActiveProfile: () => Promise<{
    id: string;
    name: string;
    createdAt: number;
    lastActive: number;
    settings?: Record<string, any>;
    downloads?: Array<{
      id: string;
      fileName: string;
      filePath: string;
      createdAt: number;
    }>;
  } | null>;
}

/**
 * Downloads API for downloads management
 */
interface VibeDownloadsAPI {
  getHistory: () => Promise<any[]>;
  openFile: (filePath: string) => Promise<{ error: string | null }>;
  showFileInFolder: (filePath: string) => Promise<{ error: string | null }>;
  removeFromHistory: (
    id: string,
  ) => Promise<{ success: boolean; error?: string }>;
  clearHistory: () => Promise<{ success: boolean; error?: string }>;
}

/**
 * Complete Vibe API interface
 */
interface VibeAPI {
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
  profile: VibeProfileAPI;
  downloads: VibeDownloadsAPI;
}

/**
 * Electron API interface
 */
interface ElectronAPI {
  ipcRenderer: {
    on: (channel: string, listener: (...args: any[]) => void) => void;
    removeListener: (
      channel: string,
      listener: (...args: any[]) => void,
    ) => void;
    send: (channel: string, ...args: any[]) => void;
    invoke: (channel: string, ...args: any[]) => Promise<any>;
  };
  platform: string;
  [key: string]: any;
}

/**
 * Window interface extensions
 */
declare global {
  interface Window {
    /**
     * Main Vibe API
     */
    vibe: VibeAPI;

    /**
     * Overlay API
     */
    vibeOverlay: OverlayAPI;

    /**
     * Electron API
     */
    electron: ElectronAPI;

    /**
     * Omnibox overlay helpers
     */
    omniboxOverlay?: {
      onUpdateSuggestions: (callback: (suggestions: any[]) => void) => void;
      suggestionClicked: (suggestion: any) => void;
      escape: () => void;
      log: (message: string, ...args: any[]) => void;
    };

    /**
     * Legacy APIs for backward compatibility
     */
    api: {
      initializeAgent: (
        apiKey: string,
      ) => Promise<{ success: boolean; error?: string }>;
      processAgentInput: (
        input: string,
      ) => Promise<{ success: boolean; response?: string; error?: string }>;
    };
    storeBridge: any;
    gmailAuth: any;
    apiKeys: any;
  }
}

export {};
