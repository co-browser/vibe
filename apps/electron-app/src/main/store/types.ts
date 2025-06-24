/**
 * Store type definitions
 * Defines the shape of the application state
 */

import { ChatMessage } from "@vibe/shared-types";
import type { TabState } from "../../types/browser";
// Remove: WebsiteContext import (now handled by MCP)

/**
 * AppState defines the data that is synchronized over IPC
 * Contains only serializable data that can be passed between processes
 */
export interface AppState {
  /** Chat messages in the current conversation */
  messages: ChatMessage[];
  requestedTabContext: TabState[];
  sessionTabs: TabState[];
  // ❌ Remove: websiteContexts: WebsiteContext[]; (now handled by MCP)
}
