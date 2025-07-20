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
 * Declare global Window interface extensions
 */
declare global {
  interface Window {
    /**
     * Main Vibe API - Modern interface
     */
    vibe: VibeAPI;

    /**
     * Legacy API - DEPRECATED, use window.vibe instead
     * Note: Event listeners remain here temporarily for compatibility
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

      /**
       * Event listeners (required for update notifications)
       */
      on: (channel: string, listener: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };

    /**
     * Additional legacy APIs for backward compatibility
     */
    electron: {
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
    };
    storeBridge: any;
    gmailAuth: any;
    apiKeys: any;
  }
}
