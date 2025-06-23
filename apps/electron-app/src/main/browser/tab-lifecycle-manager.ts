import type { TabState } from "@vibe/shared-types";
import { TAB_CONFIG, createLogger } from "@vibe/shared-types";
import type { TabManagerState } from "./tab-state-manager";
import type { TabEventBus } from "./tab-event-bus";

const logger = createLogger("TabLifecycleManager");

/**
 * Handles tab lifecycle operations - creation, destruction, activation
 * Extracted from TabManager for better separation of concerns
 */
export class TabLifecycleManager {
  constructor(
    private state: TabManagerState,
    private eventBus: TabEventBus,
    private browser: any
  ) {}

  /**
   * Creates a new tab with smart positioning
   */
  public createTab(url?: string): string {
    const key = this.generateTabKey();
    const targetUrl = url || "https://www.google.com";
    const newTabPosition = this.calculateNewTabPosition();

    const tabState: TabState = {
      key,
      isLoading: false,
      url: targetUrl,
      title: "New Tab",
      canGoBack: false,
      canGoForward: false,
      createdAt: Date.now(),
      lastActiveAt: Date.now(),
      visible: false,
      position: newTabPosition,
    };

    this.state.tabs.set(key, tabState);
    this.eventBus.emit("tab-lifecycle:created", { key, url: targetUrl });
    
    this.setActiveTab(key);
    this.normalizeTabPositions();
    
    // Track tab creation analytics
    this.trackTabCreation(targetUrl);

    return key;
  }

  /**
   * Closes a tab and manages focus
   */
  public closeTab(tabKey: string): boolean {
    if (!this.state.tabs.has(tabKey)) {
      logger.warn(`Cannot close tab ${tabKey} - not found`);
      return false;
    }

    const wasActive = this.state.activeTab === tabKey;

    this.eventBus.emit("tab-lifecycle:destroying", { key: tabKey });
    this.state.tabs.delete(tabKey);

    if (wasActive) {
      const remainingKeys = Array.from(this.state.tabs.keys());
      if (remainingKeys.length > 0) {
        this.setActiveTab(remainingKeys[0]);
      } else {
        this.state.activeTab = null;
      }
    }

    this.eventBus.emit("tab-lifecycle:closed", { key: tabKey });
    
    // Track tab closure analytics
    this.trackTabClosure();

    return true;
  }

  /**
   * Sets active tab with proper state management
   */
  public setActiveTab(tabKey: string): boolean {
    if (!this.state.tabs.has(tabKey)) {
      logger.warn(`Cannot set active tab ${tabKey} - not found`);
      return false;
    }

    const previousActiveKey = this.state.activeTab;

    // Update visibility states
    if (previousActiveKey) {
      const prevTab = this.state.tabs.get(previousActiveKey);
      if (prevTab) {
        prevTab.visible = false;
      }
    }

    const newTab = this.state.tabs.get(tabKey);
    if (newTab) {
      newTab.visible = true;
      newTab.lastActiveAt = Date.now();

      // Auto-wake sleeping tab
      if (newTab.asleep) {
        this.eventBus.emit("tab-lifecycle:wake-requested", { key: tabKey });
      }
    }

    this.state.activeTab = tabKey;

    this.eventBus.emit("tab-lifecycle:switched", {
      from: previousActiveKey,
      to: tabKey
    });

    // Track tab switching analytics
    if (previousActiveKey && previousActiveKey !== tabKey) {
      this.trackTabSwitch();
    }

    return true;
  }

  /**
   * Creates an agent-specific tab
   */
  public createAgentTab(urlToLoad: string): string {
    const key = this.createTab(urlToLoad);

    // Update the tab state to mark it as an agent tab
    const tab = this.state.tabs.get(key);
    if (tab) {
      tab.title = "Agent Tab";
      tab.isAgentActive = true;
    }

    this.eventBus.emit("tab-lifecycle:agent-created", {
      key,
      url: urlToLoad
    });

    logger.debug(`Created agent tab with key: ${key}, URL: ${urlToLoad}`);
    return key;
  }

  // Private helper methods
  private generateTabKey(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private calculateNewTabPosition(): number {
    const allTabs = Array.from(this.state.tabs.values()) as TabState[];
    allTabs.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));

    if (this.state.activeTab && allTabs.length > 0) {
      const activeTab = this.state.tabs.get(this.state.activeTab);
      if (activeTab && activeTab.position !== undefined) {
        const activeIndex = allTabs.findIndex(tab => tab.key === this.state.activeTab);
        if (activeIndex !== -1) {
          return activeTab.position + TAB_CONFIG.POSITION_INCREMENT;
        }
      }
    }

    return allTabs.length;
  }

  private normalizeTabPositions(): void {
    const sortedTabs = Array.from(this.state.tabs.values()) as TabState[];
    sortedTabs.sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    
    let hasChanges = false;

    sortedTabs.forEach((tab, index) => {
      if (tab.position !== index) {
        tab.position = index;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.eventBus.emit("tab-lifecycle:reordered", { tabs: sortedTabs });
    }
  }

  private trackTabCreation(targetUrl: string): void {
    const mainWindows = this.browser
      .getAllWindows()
      .filter((w: any) =>
        w &&
        w.webContents &&
        !w.webContents.isDestroyed() &&
        (w.webContents.getURL().includes("localhost:5173") ||
          w.webContents.getURL().startsWith("file://"))
      );

    mainWindows.forEach((window: any) => {
      window.webContents
        .executeJavaScript(`
          if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('tab-created', {
              url: '${targetUrl}',
              timestamp: ${Date.now()},
              totalTabs: ${this.state.tabs.size}
            });
          }
        `)
        .catch((err: any) => {
          logger.error("Failed to track tab creation", { error: err.message });
        });
    });
  }

  private trackTabClosure(): void {
    const mainWindows = this.browser
      .getAllWindows()
      .filter((w: any) =>
        w &&
        w.webContents &&
        !w.webContents.isDestroyed() &&
        (w.webContents.getURL().includes("localhost:5173") ||
          w.webContents.getURL().startsWith("file://"))
      );

    mainWindows.forEach((window: any) => {
      window.webContents
        .executeJavaScript(`
          if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('tab-closed', {
              timestamp: ${Date.now()},
              remainingTabs: ${this.state.tabs.size}
            });
          }
        `)
        .catch((err: any) => {
          logger.error("Failed to track tab closure", { error: err.message });
        });
    });
  }

  private trackTabSwitch(): void {
    const mainWindows = this.browser
      .getAllWindows()
      .filter((w: any) =>
        w &&
        w.webContents &&
        !w.webContents.isDestroyed() &&
        (w.webContents.getURL().includes("localhost:5173") ||
          w.webContents.getURL().startsWith("file://"))
      );

    mainWindows.forEach((window: any) => {
      window.webContents
        .executeJavaScript(`
          if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('tab-switched', {
              timestamp: ${Date.now()},
              totalTabs: ${this.state.tabs.size}
            });
          }
        `)
        .catch((err: any) => {
          logger.error("Failed to track tab switch", { error: err.message });
        });
    });
  }
}