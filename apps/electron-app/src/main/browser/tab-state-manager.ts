import type { TabState } from "@vibe/shared-types";
import { TAB_CONFIG, createLogger } from "@vibe/shared-types";
import type { TabEventBus } from "./tab-event-bus";

const logger = createLogger("TabStateManager");

/**
 * Unified state management for tabs
 * Consolidates 15+ scattered state variables into a cohesive system
 */
export interface TabManagerState {
  tabs: Map<string, TabState>;
  activeTab: string | null;
  viewStates: Map<string, ViewState>;
  sleepingTabs: Map<string, SleepData>;
  savedUrls: Set<string>;
  activeSaves: Set<string>;
  saveQueue: string[];
  maintenanceCounter: number;
  cleanupInterval: NodeJS.Timeout | null;
  maxConcurrentSaves: number;
}

export interface ViewState {
  view: any; // WebContentsView
  isVisible: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

export interface SleepData {
  originalUrl: string;
  navHistory: any[];
  navHistoryIndex: number;
}

/**
 * Manages tab state with persistence and change tracking
 * Extracted from TabManager for better separation of concerns
 */
export class TabStateManager {
  private state: TabManagerState;

  constructor(
    private eventBus: TabEventBus,
    maxConcurrentSaves: number = 3
  ) {
    this.state = {
      tabs: new Map(),
      activeTab: null,
      viewStates: new Map(),
      sleepingTabs: new Map(),
      savedUrls: new Set(),
      activeSaves: new Set(),
      saveQueue: [],
      maintenanceCounter: 0,
      cleanupInterval: null,
      maxConcurrentSaves,
    };
  }

  /**
   * Get the unified state object
   */
  public getState(): TabManagerState {
    return this.state;
  }

  /**
   * Updates tab state from webContents with change detection
   */
  public updateTabState(tabKey: string, webContents: any): boolean {
    const tab = this.state.tabs.get(tabKey);
    if (!tab || tab.asleep) return false;

    if (!webContents || webContents.isDestroyed()) return false;

    const changes: string[] = [];

    // Check for actual changes
    const newTitle = webContents.getTitle();
    if (newTitle !== tab.title) {
      tab.title = newTitle;
      changes.push("title");
    }

    const newUrl = webContents.getURL();
    if (newUrl !== tab.url) {
      tab.url = newUrl;
      changes.push("url");
    }

    const newIsLoading = webContents.isLoading();
    if (newIsLoading !== tab.isLoading) {
      tab.isLoading = newIsLoading;
      changes.push("isLoading");
    }

    const newCanGoBack = webContents.navigationHistory.canGoBack();
    if (newCanGoBack !== tab.canGoBack) {
      tab.canGoBack = newCanGoBack;
      changes.push("canGoBack");
    }

    const newCanGoForward = webContents.navigationHistory.canGoForward();
    if (newCanGoForward !== tab.canGoForward) {
      tab.canGoForward = newCanGoForward;
      changes.push("canGoForward");
    }

    tab.lastActiveAt = Date.now();

    if (changes.length > 0) {
      this.eventBus.emit("tab-state:updated", { tab, changes });
      return true;
    }

    return false;
  }

  /**
   * Updates tab with partial state changes
   */
  public updateTab(tabKey: string, updates: Partial<TabState>): boolean {
    const tab = this.state.tabs.get(tabKey);
    if (!tab) return false;

    Object.assign(tab, updates);
    this.eventBus.emit("tab-state:updated", { tab, changes: Object.keys(updates) });
    return true;
  }

  /**
   * Gets all tabs sorted by position
   */
  public getAllTabs(): TabState[] {
    return Array.from(this.state.tabs.values()).sort((a, b) => {
      const posA = a.position ?? 999;
      const posB = b.position ?? 999;
      return posA - posB;
    });
  }

  /**
   * Gets tabs by position (alias for consistency)
   */
  public getTabsByPosition(): TabState[] {
    return this.getAllTabs();
  }

  /**
   * Reorders tabs using array-based positioning
   */
  public reorderTabs(orderedKeys: string[]): boolean {
    if (!this.validateKeys(orderedKeys)) return false;

    // Assign sequential positions
    orderedKeys.forEach((key, index) => {
      const tab = this.state.tabs.get(key);
      if (tab) {
        tab.position = index;
      }
    });

    const reorderedTabs = orderedKeys
      .map(key => this.state.tabs.get(key))
      .filter(Boolean) as TabState[];
    
    this.eventBus.emit("tab-state:reordered", { tabs: reorderedTabs });
    return true;
  }

  /**
   * Sleep management - put tab to sleep
   */
  public putTabToSleep(tabKey: string): boolean {
    const tab = this.state.tabs.get(tabKey);
    if (
      !tab ||
      tab.asleep ||
      this.state.activeTab === tabKey ||
      tab.isAgentActive
    ) {
      return false;
    }

    try {
      const sleepData: SleepData = {
        originalUrl: tab.url,
        navHistory: [],
        navHistoryIndex: 0,
      };

      this.state.sleepingTabs.set(tabKey, sleepData);
      this.updateTab(tabKey, {
        asleep: true,
        sleepData,
        url: TAB_CONFIG.SLEEP_MODE_URL,
      });

      this.eventBus.emit("tab-state:sleep", { key: tabKey, sleepData });
      logger.debug(`Tab ${tabKey} put to sleep`);
      return true;
    } catch (error) {
      logger.error(`Failed to put tab ${tabKey} to sleep:`, error);
      return false;
    }
  }

  /**
   * Sleep management - wake up tab
   */
  public wakeUpTab(tabKey: string): boolean {
    const tab = this.state.tabs.get(tabKey);
    const sleepData = this.state.sleepingTabs.get(tabKey);
    
    if (!tab || !tab.asleep || !sleepData) return false;

    try {
      this.updateTab(tabKey, {
        asleep: false,
        url: sleepData.originalUrl,
        sleepData: undefined,
      });

      this.state.sleepingTabs.delete(tabKey);
      this.eventBus.emit("tab-state:wake", { key: tabKey, originalUrl: sleepData.originalUrl });
      
      logger.debug(`Tab ${tabKey} woken up`);
      return true;
    } catch (error) {
      logger.error(`Failed to wake up tab ${tabKey}:`, error);
      return false;
    }
  }

  /**
   * Agent status management
   */
  public updateAgentStatus(tabKey: string, isActive: boolean): boolean {
    const tab = this.state.tabs.get(tabKey);
    if (!tab) {
      logger.warn(`updateAgentStatus called for non-existent key: ${tabKey}`);
      return false;
    }

    this.updateTab(tabKey, { isAgentActive: isActive });
    this.eventBus.emit("tab-state:agent-status", { key: tabKey, isActive });
    
    logger.debug(`Tab ${tabKey}: Agent status updated to ${isActive}`);
    return true;
  }

  /**
   * Memory saving queue management
   */
  public addToSaveQueue(tabKey: string): void {
    if (!this.state.saveQueue.includes(tabKey)) {
      this.state.saveQueue.push(tabKey);
    }
  }

  public removeFromSaveQueue(): string | undefined {
    return this.state.saveQueue.shift();
  }

  public markSaveActive(tabKey: string): void {
    this.state.activeSaves.add(tabKey);
  }

  public markSaveComplete(tabKey: string, url: string): void {
    this.state.activeSaves.delete(tabKey);
    this.state.savedUrls.add(url);
  }

  public canStartNewSave(): boolean {
    return this.state.activeSaves.size < this.state.maxConcurrentSaves;
  }

  public clearSavedUrlsCache(): void {
    this.state.savedUrls.clear();
    logger.info("Saved URLs cache cleared");
  }

  public getSaveStatus(): {
    active: number;
    queued: number;
    maxConcurrent: number;
  } {
    return {
      active: this.state.activeSaves.size,
      queued: this.state.saveQueue.length,
      maxConcurrent: this.state.maxConcurrentSaves,
    };
  }

  /**
   * Maintenance operations
   */
  public incrementMaintenanceCounter(): number {
    return ++this.state.maintenanceCounter;
  }

  public getInactiveTabs(maxCount?: number): string[] {
    const now = Date.now();
    const inactiveTabs: Array<{ key: string; timeSinceActive: number }> = [];

    for (const [tabKey, tab] of this.state.tabs) {
      // Skip active tab and agent tabs
      if (tabKey === this.state.activeTab || tab.isAgentActive || tab.asleep) {
        continue;
      }

      const timeSinceActive = now - (tab.lastActiveAt || tab.createdAt || now);
      if (timeSinceActive > TAB_CONFIG.SLEEP_THRESHOLD_MS) {
        inactiveTabs.push({ key: tabKey, timeSinceActive });
      }
    }

    // Sort by time since active (oldest first)
    inactiveTabs.sort((a, b) => b.timeSinceActive - a.timeSinceActive);

    // Return limited count if specified
    const result = inactiveTabs.map(item => item.key);
    return maxCount ? result.slice(0, maxCount) : result;
  }

  // Getters for compatibility
  public getActiveTabKey(): string | null {
    return this.state.activeTab;
  }

  public getActiveTab(): TabState | null {
    return this.state.activeTab ? this.state.tabs.get(this.state.activeTab) || null : null;
  }

  public getTabCount(): number {
    return this.state.tabs.size;
  }

  public getTab(tabKey: string): TabState | null {
    return this.state.tabs.get(tabKey) || null;
  }

  public getTabs(): TabState[] {
    return this.getAllTabs();
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    if (this.state.cleanupInterval) {
      clearInterval(this.state.cleanupInterval);
      this.state.cleanupInterval = null;
    }
    
    this.state.tabs.clear();
    this.state.activeTab = null;
    this.state.viewStates.clear();
    this.state.sleepingTabs.clear();
    this.state.savedUrls.clear();
    this.state.activeSaves.clear();
    this.state.saveQueue.length = 0;
  }

  // Private helper methods
  private validateKeys(keys: string[]): boolean {
    return keys.every(key => this.state.tabs.has(key));
  }
}