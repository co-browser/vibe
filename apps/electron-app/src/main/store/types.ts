/**
 * Store type definitions
 * Defines the shape of the application state
 */

import { ChatMessage } from "@vibe/shared-types";
import { TabState } from "@vibe/shared-types";
// Remove: WebsiteContext import (now handled by MCP)

// Define DownloadItem locally until it's added to shared-types
export interface DownloadItem {
  id: string;
  url: string;
  filename: string;
  path: string;
  state: "progressing" | "completed" | "cancelled" | "interrupted";
  startTime: number;
  receivedBytes: number;
  totalBytes: number;
}

/**
 * AppState defines the data that is synchronized over IPC
 * Contains only serializable data that can be passed between processes
 */
export interface AppState {
  /** Chat messages in the current conversation */
  messages: ChatMessage[];
  requestedTabContext: TabState[];
  sessionTabs: TabState[];
  downloads: DownloadItem[];
  // ❌ Remove: websiteContexts: WebsiteContext[]; (now handled by MCP)
}
