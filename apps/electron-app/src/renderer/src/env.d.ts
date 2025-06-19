/**
 * Environment type definitions for the renderer process
 */

/// <reference types="vite/client" />

// Import vibe API types
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
}

/**
 * Electron API interface
 */
interface ElectronAPI {
  platform: string;
  getWindowType: () => string | null;
  [key: string]: any;
}

/**
 * Window interface extensions for the API
 */
interface Window {
  /**
   * Main Vibe API - Modern interface
   */
  vibe: VibeAPI;

  /**
   * Electron API - includes window type detection
   */
  electronAPI: ElectronAPI;

  /**
   * Legacy API - DEPRECATED, use window.vibe instead
   */
  api: {
    /**
     * Initializes the agent with the provided API key
     * @param apiKey The API key to use for initialization
     * @returns A promise that resolves to a success object
     */
    initializeAgent: (
      apiKey: string,
    ) => Promise<{ success: boolean; error?: string }>;

    /**
     * Processes user input through the agent
     * @param input The user input to process
     * @returns A promise that resolves to a response object
     */
    processAgentInput: (
      input: string,
    ) => Promise<{ success: boolean; response?: string; error?: string }>;
  };

  /**
   * Additional legacy APIs for backward compatibility
   */
  electron: ElectronAPI;
  storeBridge: any;
  gmailAuth: any;
  apiKeys: any;
}
