/**
 * Tab-related shared types
 */

import type { CDPMetadata } from "../browser";

export interface FavIcon {
  hostname: string;
  faviconUrl: string;
}

/**
 * Comprehensive tab state with visibility architecture and sleep system
 * Core data structure for tab management across all processes
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
  isAgentControlled?: boolean; // For Speedlane mode - tab controlled by agent

  // === CDP INTEGRATION ===
  /**
   * Chrome DevTools Protocol metadata for debugging and automation
   * Contains connection state, target IDs, and debug information
   * Used by CDP Manager service for browser automation capabilities
   */
  cdpMetadata?: CDPMetadata;

  // === LIFECYCLE TIMESTAMPS ===
  createdAt?: number;
  lastActiveAt?: number; // Critical for sleep system timing

  // === VISIBILITY ARCHITECTURE ===
  /**
   * Application-level visibility state
   * Coordinates with ViewManager's WebContentsView.setVisible()
   * - true: Tab is active and view should be visible
   * - false: Tab is inactive and view should be hidden
   * Core fix: Replaced z-index layering with explicit visibility control
   */
  visible?: boolean;

  // === TAB POSITIONING SYSTEM ===
  /**
   * Position-based ordering
   */
  position?: number;

  // === SLEEP SYSTEM (Memory Optimization) ===
  /**
   * Tab sleep state for memory management
   * - true: Tab is sleeping, loads about:blank, uses navigation history for restoration
   * - false/undefined: Tab is active, normal operation
   * Automatically sleeps after 30min inactivity, archives after 24hrs
   */
  asleep?: boolean;
}
