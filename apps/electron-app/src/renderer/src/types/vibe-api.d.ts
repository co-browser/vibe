/**
 * Extended Vibe API types for the renderer process
 * Extends the shared types with app-specific APIs
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

/**
 * Profile API for user profile management
 */
export interface VibeProfileAPI {
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
  } | null>;
}

/**
 * Extended Vibe API with profile support
 */
export interface ExtendedVibeAPI {
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
}

// Extend the global Window interface
declare global {
  interface Window {
    vibe: ExtendedVibeAPI;
  }
}

export {};
