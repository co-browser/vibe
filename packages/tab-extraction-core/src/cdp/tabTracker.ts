import { createLogger } from "@vibe/shared-types";
import type { TabInfo } from "../types/index.js";

const logger = createLogger("active-tab-tracker");

export class ActiveTabTracker {
  private activeTab: TabInfo | null = null;
  private tabUpdateCallback?: (tab: TabInfo) => void;

  constructor() {
    logger.debug("ActiveTabTracker initialized");
  }

  /**
   * Set the active tab information
   * This will be called from the Electron main process via IPC
   */
  setActiveTab(tab: TabInfo): void {
    this.activeTab = tab;
    logger.info(`Active tab updated: ${tab.title} (${tab.url})`);

    if (this.tabUpdateCallback) {
      this.tabUpdateCallback(tab);
    }
  }

  /**
   * Get the current active tab
   */
  getActiveTab(): TabInfo | null {
    return this.activeTab;
  }

  /**
   * Get the CDP target ID for the active tab
   */
  getActiveTabTargetId(): string | null {
    return this.activeTab?.cdpTargetId || null;
  }

  /**
   * Register a callback for tab updates
   */
  onTabUpdate(callback: (tab: TabInfo) => void): void {
    this.tabUpdateCallback = callback;
  }

  /**
   * Clear the active tab
   */
  clearActiveTab(): void {
    this.activeTab = null;
    logger.debug("Active tab cleared");
  }

  /**
   * Check if we have an active tab
   */
  hasActiveTab(): boolean {
    return this.activeTab !== null;
  }
}

// Global instance
export const activeTabTracker = new ActiveTabTracker();
