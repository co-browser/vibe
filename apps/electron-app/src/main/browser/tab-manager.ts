import type { TabState } from "@vibe/shared-types";
import {
  TAB_CONFIG,
  GLASSMORPHISM_CONFIG,
  createLogger,
  truncateUrl,
} from "@vibe/shared-types";
import { WebContentsView } from "electron";
import { EventEmitter } from "events";
import type { CDPManager } from "../services/cdp-service";
import { fetchFaviconAsDataUrl } from "@/utils/favicon";
import { autoSaveTabToMemory } from "@/utils/tab-agent";

const logger = createLogger("TabManager");

/**
 * Manages browser tabs with position-based ordering and sleep functionality
 */
export class TabManager extends EventEmitter {
  private _browser: any;
  private viewManager: any;
  private cdpManager?: CDPManager;
  private tabs: Map<string, TabState> = new Map();
  private activeTabKey: string | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private maintenanceCounter = 0;
  private savedUrls: Set<string> = new Set(); // Track URLs already saved to memory
  private activeSaves: Set<string> = new Set(); // Track tabs currently being saved
  private saveQueue: string[] = []; // Queue for saves when at max concurrency
  private readonly maxConcurrentSaves = 3; // Limit concurrent saves

  constructor(browser: any, viewManager: any, cdpManager?: CDPManager) {
    super();
    this._browser = browser;
    this.viewManager = viewManager;
    this.cdpManager = cdpManager;
    this.startPeriodicMaintenance();
  }

  /**
   * Creates a WebContentsView for a tab
   */
  private createWebContentsView(tabKey: string, url?: string): WebContentsView {
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    view.setBackgroundColor("#00000000");

    // Add rounded corners for glassmorphism design
    view.setBorderRadius(GLASSMORPHISM_CONFIG.BORDER_RADIUS);

    // Suppress common DevTools console errors (Autofill, etc.)
    view.webContents.on(
      "console-message",
      (_event, _level, message, _line, _sourceId) => {
        // Suppress Autofill-related DevTools errors which are harmless
        if (
          message.includes("Autofill.enable") ||
          message.includes("Autofill.setAddresses")
        ) {
          return; // Don't log these
        }
        // Let other console messages through normally
      },
    );

    // Optional CDP integration
    if (this.cdpManager) {
      this.cdpManager
        .attachDebugger(view.webContents, tabKey)
        .then(success => {
          if (success) {
            this.cdpManager!.enableDomains(view.webContents);
          }
        })
        .catch(error => logger.warn("CDP attachment failed:", error));
    }

    // Load URL if provided
    if (url && url !== "about:blank") {
      view.webContents.loadURL(url);
    }

    return view;
  }

  /**
   * Sets up navigation event handlers for a WebContentsView
   * Extracted from ViewManager for clean architecture
   */
  private setupNavigationHandlers(view: WebContentsView, tabKey: string): void {
    const webContents = view.webContents;

    // Navigation event handlers for tab state updates
    const updateTabState = (): void => {
      this.updateTabState(tabKey);
    };

    webContents.on("did-start-loading", updateTabState);
    webContents.on("did-stop-loading", updateTabState);
    webContents.on("did-finish-load", updateTabState);
    webContents.on("page-title-updated", updateTabState);
    webContents.on("did-navigate", updateTabState);
    webContents.on("page-favicon-updated", updateTabState);
    webContents.on("did-navigate-in-page", updateTabState);
    webContents.on("dom-ready", updateTabState);

    // Automatic memory saving on page load completion
    webContents.on("did-finish-load", () => {
      this.handleAutoMemorySave(tabKey).catch(error => {
        logger.error(`Auto memory save failed for ${tabKey}:`, error);
      });
    });

    // Automatic memory saving on SPA internal navigation (e.g., Gmail email switches)
    webContents.on("did-navigate-in-page", () => {
      this.handleAutoMemorySave(tabKey).catch(error => {
        logger.error(
          `Auto memory save (SPA navigation) failed for ${tabKey}:`,
          error,
        );
      });
    });

    // Favicon update handler
    webContents.on("page-favicon-updated", async (_event, favicons) => {
      if (favicons.length > 0) {
        const state = this.getActiveTab();
        if (state) {
          if (state.favicon !== favicons[0]) {
            logger.debug("page-favicon-updated", state.favicon, favicons[0]);
            try {
              state.favicon = await fetchFaviconAsDataUrl(favicons[0]);
              this.updateTabState(this.getActiveTabKey()!);
            } catch (error) {
              logger.error("Error updating favicon:", error);
            }
          }
        }
      }
    });

    // CDP event handler setup if CDP manager is available
    if (this.cdpManager) {
      this.cdpManager.setupEventHandlers(webContents, tabKey);
    }
  }

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

    this.tabs.set(key, tabState);
    this.createBrowserView(key, targetUrl);
    this.setActiveTab(key);
    this.normalizeTabPositions();
    this.emit("tab-created", key);

    // Track tab creation - only in main window (renderer)
    const mainWindows = this._browser
      .getAllWindows()
      .filter(
        (w: any) =>
          w &&
          w.webContents &&
          !w.webContents.isDestroyed() &&
          (w.webContents.getURL().includes("localhost:5173") ||
            w.webContents.getURL().startsWith("file://")),
      );

    mainWindows.forEach((window: any) => {
      window.webContents
        .executeJavaScript(
          `
        if (window.umami && typeof window.umami.track === 'function') {
          window.umami.track('tab-created', {
            url: '${targetUrl}',
            timestamp: ${Date.now()},
            totalTabs: ${this.tabs.size}
          });
        }
      `,
        )
        .catch(err => {
          logger.error("Failed to track tab creation", { error: err.message });
        });
    });

    return key;
  }

  /**
   * Closes a tab and manages focus
   */
  public closeTab(tabKey: string): boolean {
    if (!this.tabs.has(tabKey)) {
      logger.warn(`Cannot close tab ${tabKey} - not found`);
      return false;
    }

    const wasActive = this.activeTabKey === tabKey;

    // Clean up CDP resources before removing the view
    if (this.cdpManager) {
      const view = this.getBrowserView(tabKey);
      if (view && view.webContents && !view.webContents.isDestroyed()) {
        this.cdpManager.cleanup(view.webContents);
      }
    }

    this.removeBrowserView(tabKey);
    this.tabs.delete(tabKey);

    if (wasActive) {
      const remainingKeys = Array.from(this.tabs.keys());
      if (remainingKeys.length > 0) {
        this.setActiveTab(remainingKeys[0]);
      } else {
        this.activeTabKey = null;
      }
    }

    this.emit("tab-closed", tabKey);

    // Track tab closure - only in main window (renderer)
    const mainWindows = this._browser
      .getAllWindows()
      .filter(
        (w: any) =>
          w &&
          w.webContents &&
          !w.webContents.isDestroyed() &&
          (w.webContents.getURL().includes("localhost:5173") ||
            w.webContents.getURL().startsWith("file://")),
      );

    mainWindows.forEach((window: any) => {
      window.webContents
        .executeJavaScript(
          `
        if (window.umami && typeof window.umami.track === 'function') {
          window.umami.track('tab-closed', {
            timestamp: ${Date.now()},
            remainingTabs: ${this.tabs.size}
          });
        }
      `,
        )
        .catch(err => {
          logger.error("Failed to track tab closure", { error: err.message });
        });
    });

    return true;
  }

  /**
   * Sets active tab with view coordination
   */
  public setActiveTab(tabKey: string): boolean {
    if (!this.tabs.has(tabKey)) {
      logger.warn(`Cannot set active tab ${tabKey} - not found`);
      return false;
    }

    const previousActiveKey = this.activeTabKey;

    // Update visibility states
    if (previousActiveKey) {
      this.updateTab(previousActiveKey, { visible: false });
      // Hide previous view
      const viewManager = this.viewManager;
      if (viewManager) {
        viewManager.setViewVisible(previousActiveKey, false);
      }
    }

    const newTab = this.tabs.get(tabKey);
    if (newTab) {
      this.updateTab(tabKey, { visible: true, lastActiveAt: Date.now() });

      // Auto-wake sleeping tab
      if (newTab.asleep) {
        this.wakeUpTab(tabKey);
      }
    }

    this.activeTabKey = tabKey;

    // Show new view
    const viewManager = this.viewManager;
    if (viewManager) {
      viewManager.setViewVisible(tabKey, true);
    }

    this.emit("tab-switched", { from: previousActiveKey, to: tabKey });

    // Track tab switching (only if it's actually a switch, not initial creation)
    if (previousActiveKey && previousActiveKey !== tabKey) {
      const mainWindows = this._browser
        .getAllWindows()
        .filter(
          (w: any) =>
            w &&
            w.webContents &&
            !w.webContents.isDestroyed() &&
            (w.webContents.getURL().includes("localhost:5173") ||
              w.webContents.getURL().startsWith("file://")),
        );

      mainWindows.forEach((window: any) => {
        window.webContents
          .executeJavaScript(
            `
          if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('tab-switched', {
              timestamp: ${Date.now()},
              totalTabs: ${this.tabs.size}
            });
          }
        `,
          )
          .catch(err => {
            logger.error("Failed to track tab switch", { error: err.message });
          });
      });
    }

    return true;
  }

  /**
   * Updates tab state from webContents with change detection
   */
  public updateTabState(tabKey: string): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab || tab.asleep) return false;

    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) return false;

    const { webContents } = view;
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
      this.emit("tab-updated", tab);
      return true;
    }

    return false;
  }

  /**
   * Reorders tabs using array-based positioning
   */
  public reorderTabs(orderedKeys: string[]): boolean {
    if (!this.validateKeys(orderedKeys)) return false;

    // Assign sequential positions
    orderedKeys.forEach((key, index) => {
      const tab = this.tabs.get(key);
      if (tab) {
        tab.position = index;
      }
    });

    const reorderedTabs = orderedKeys
      .map(key => this.tabs.get(key))
      .filter(Boolean) as TabState[];
    this.emit("tabs-reordered", reorderedTabs);
    return true;
  }

  /**
   * Gets all tabs sorted by position
   */
  public getAllTabs(): TabState[] {
    return this.getTabsByPosition();
  }

  /**
   * Gets tabs sorted by position
   */
  public getTabsByPosition(): TabState[] {
    return Array.from(this.tabs.values()).sort((a, b) => {
      const posA = a.position ?? 999;
      const posB = b.position ?? 999;
      return posA - posB;
    });
  }

  /**
   * Put tab to sleep using flow-browser approach
   */
  public putTabToSleep(tabKey: string): boolean {
    const tab = this.tabs.get(tabKey);
    if (
      !tab ||
      tab.asleep ||
      this.activeTabKey === tabKey ||
      tab.isAgentActive
    ) {
      return false;
    }

    try {
      // Update tab state first (flow-browser approach)
      this.updateTabState(tabKey);

      this.updateTab(tabKey, {
        asleep: true,
        url: TAB_CONFIG.SLEEP_MODE_URL,
      });

      const view = this.getBrowserView(tabKey);
      if (view && view.webContents) {
        view.webContents.loadURL(TAB_CONFIG.SLEEP_MODE_URL);
      }

      this.logDebug(`Tab ${tabKey} put to sleep`);
      return true;
    } catch (error) {
      logger.error(`Failed to put tab ${tabKey} to sleep:`, error);
      return false;
    }
  }

  /**
   * Wake up sleeping tab using flow-browser approach
   */
  public wakeUpTab(tabKey: string): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab || !tab.asleep) return false;

    try {
      const view = this.getBrowserView(tabKey);
      if (!view || view.webContents.isDestroyed()) return false;

      const webContents = view.webContents;
      const navigationHistory = webContents.navigationHistory;

      // Use navigation history to restore previous URL (flow-browser approach)
      const activeIndex = navigationHistory.getActiveIndex();
      const currentEntry = navigationHistory.getEntryAtIndex(activeIndex);

      if (
        currentEntry &&
        currentEntry.url === TAB_CONFIG.SLEEP_MODE_URL &&
        navigationHistory.canGoBack()
      ) {
        navigationHistory.goBack();
        setTimeout(() => {
          navigationHistory.removeEntryAtIndex(activeIndex);
          this.updateTabState(tabKey);
        }, 100);
      }

      // Update tab state
      this.updateTab(tabKey, {
        asleep: false,
      });

      this.logDebug(`Tab ${tabKey} woken up`);
      return true;
    } catch (error) {
      logger.error(`Failed to wake up tab ${tabKey}:`, error);
      return false;
    }
  }

  /**
   * Navigation methods for tab-specific operations
   */
  public async loadUrl(tabKey: string, url: string): Promise<boolean> {
    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) return false;

    try {
      await view.webContents.loadURL(url);
      this.updateTabState(tabKey);
      return true;
    } catch (error) {
      logger.error(
        `Failed to load URL ${truncateUrl(url)} in tab ${tabKey}:`,
        error,
      );
      return false;
    }
  }

  public goBack(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (!view || !view.webContents.navigationHistory.canGoBack()) return false;

    view.webContents.goBack();
    return true;
  }

  public goForward(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (!view || !view.webContents.navigationHistory.canGoForward())
      return false;

    view.webContents.goForward();
    return true;
  }

  public refresh(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) return false;

    view.webContents.reload();
    return true;
  }

  // Private helper methods

  private generateTabKey(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private calculateNewTabPosition(): number {
    const allTabs = this.getTabsByPosition();

    if (this.activeTabKey && allTabs.length > 0) {
      const activeTab = this.tabs.get(this.activeTabKey);
      if (activeTab && activeTab.position !== undefined) {
        const activeIndex = allTabs.findIndex(
          tab => tab.key === this.activeTabKey,
        );
        if (activeIndex !== -1) {
          return activeTab.position + TAB_CONFIG.POSITION_INCREMENT;
        }
      }
    }

    return allTabs.length;
  }

  private normalizeTabPositions(): void {
    const sortedTabs = this.getTabsByPosition();
    let hasChanges = false;

    sortedTabs.forEach((tab, index) => {
      if (tab.position !== index) {
        tab.position = index;
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.emit("tabs-reordered", this.getTabsByPosition());
    }
  }

  private startPeriodicMaintenance(): void {
    this.cleanupInterval = setInterval(() => {
      this.performTabMaintenance();
    }, TAB_CONFIG.CLEANUP_INTERVAL_MS);
  }

  private performTabMaintenance(): void {
    this.maintenanceCounter++;
    const now = Date.now();
    const totalTabs = this.tabs.size;
    const sleepingTabs = Array.from(this.tabs.values()).filter(
      tab => tab.asleep,
    ).length;

    // Log periodically to avoid spam
    if (this.maintenanceCounter % TAB_CONFIG.MAINTENANCE_LOG_INTERVAL === 0) {
      // Only log tab maintenance in debug mode
      if (process.env.LOG_LEVEL === "debug") {
        logger.info(
          `Tab maintenance: ${totalTabs} total, ${sleepingTabs} sleeping`,
        );
      }
    }

    for (const [tabKey, tab] of this.tabs) {
      const timeSinceActive = now - (tab.lastActiveAt || tab.createdAt || now);

      // Update state for active/visible tabs
      if (this.activeTabKey === tabKey || tab.visible) {
        this.updateTabState(tabKey);
      }

      // Skip sleep management for active/agent tabs
      if (this.activeTabKey === tabKey || tab.isAgentActive) continue;

      // Sleep inactive tabs
      if (!tab.asleep && timeSinceActive > TAB_CONFIG.SLEEP_THRESHOLD_MS) {
        this.putTabToSleep(tabKey);
      }
      // Archive old tabs
      else if (
        tab.asleep &&
        timeSinceActive > TAB_CONFIG.ARCHIVE_THRESHOLD_MS
      ) {
        this.closeTab(tabKey);
      }
    }
  }

  private validateKeys(keys: string[]): boolean {
    return keys.every(key => this.tabs.has(key));
  }

  private createBrowserView(tabKey: string, url: string): void {
    // Create the WebContentsView internally (moved from ViewManager)
    const view = this.createWebContentsView(tabKey, url);

    // Set up navigation events here (moved from ViewManager)
    this.setupNavigationHandlers(view, tabKey);

    // Register with pure ViewManager utility
    const viewManager = this.viewManager;
    if (!viewManager) throw new Error("View manager not available");

    viewManager.addView(view, tabKey);

    // Initially hidden (will be shown when tab becomes active)
    viewManager.setViewVisible(tabKey, false);
  }

  private removeBrowserView(tabKey: string): void {
    const viewManager = this.viewManager;
    if (viewManager) {
      viewManager.removeView(tabKey);
    }
  }

  private getBrowserView(tabKey: string): any {
    const viewManager = this.viewManager;
    return viewManager ? viewManager.getView(tabKey) : null;
  }

  private updateTab(tabKey: string, updates: Partial<TabState>): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab) return false;

    Object.assign(tab, updates);
    this.emit("tab-updated", tab);
    return true;
  }

  private logDebug(message: string): void {
    logger.debug(message);
  }

  // Public getters
  public getActiveTabKey(): string | null {
    return this.activeTabKey;
  }
  public getActiveTab(): TabState | null {
    return this.activeTabKey ? this.tabs.get(this.activeTabKey) || null : null;
  }
  public getTabCount(): number {
    return this.tabs.size;
  }
  public getTab(tabKey: string): TabState | null {
    return this.tabs.get(tabKey) || null;
  }

  // Aliases for compatibility
  public switchToTab(tabKey: string): boolean {
    return this.setActiveTab(tabKey);
  }
  public moveTab(tabKey: string, newPosition: number): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab) return false;
    tab.position = newPosition;
    this.emit("tabs-reordered", this.getTabsByPosition());
    return true;
  }

  /**
   * Gets tabs that should be put to sleep (for VibeTabsAPI compatibility)
   */
  public getInactiveTabs(maxCount?: number): string[] {
    const now = Date.now();
    const inactiveTabs: Array<{ key: string; timeSinceActive: number }> = [];

    for (const [tabKey, tab] of this.tabs) {
      // Skip active tab and agent tabs
      if (tabKey === this.activeTabKey || tab.isAgentActive || tab.asleep) {
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

  /**
   * Gets all tabs (alias for VibeTabsAPI compatibility)
   */
  public getTabs(): TabState[] {
    return this.getAllTabs();
  }

  /**
   * Clear the saved URLs cache to allow re-saving previously saved URLs
   */
  public clearSavedUrlsCache(): void {
    this.savedUrls.clear();
    logger.info("Saved URLs cache cleared");
  }

  /**
   * Get current save operation status
   */
  public getSaveStatus(): {
    active: number;
    queued: number;
    maxConcurrent: number;
  } {
    return {
      active: this.activeSaves.size,
      queued: this.saveQueue.length,
      maxConcurrent: this.maxConcurrentSaves,
    };
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.tabs.clear();
    this.activeTabKey = null;
    this.savedUrls.clear(); // Clear saved URLs cache
    this.activeSaves.clear(); // Clear active saves tracking
    this.saveQueue.length = 0; // Clear save queue

    // Clean up EventEmitter listeners
    this.removeAllListeners();
  }

  /**
   * Updates agent status for a tab and applies visual indicators
   */
  public updateAgentStatus(tabKey: string, isActive: boolean): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab) {
      logger.warn(`updateAgentStatus called for non-existent key: ${tabKey}`);
      return false;
    }

    // Update state
    this.updateTab(tabKey, { isAgentActive: isActive });

    // Apply/remove visual indicator
    const view = this.getBrowserView(tabKey);
    if (view && !view.webContents.isDestroyed()) {
      if (isActive) {
        this.applyAgentTabBorder(view);
      } else {
        this.removeAgentTabBorder(view);
      }
    }

    this.logDebug(`Tab ${tabKey}: Agent status updated to ${isActive}`);
    return true;
  }

  /**
   * Creates a new tab specifically for agent use
   */
  public createAgentTab(
    urlToLoad: string,
    _baseKey: string = "agent-tab", // underscore prefix to indicate intentionally unused
  ): string {
    const key = this.createTab(urlToLoad);

    // Update the tab state to mark it as an agent tab
    this.updateTab(key, {
      title: "Agent Tab",
      isAgentActive: true,
    });

    // Apply visual indicator once loaded
    const view = this.getBrowserView(key);
    if (view) {
      view.webContents.once("did-finish-load", () => {
        this.applyAgentTabBorder(view);
      });
    }

    this.logDebug(`Created agent tab with key: ${key}, URL: ${urlToLoad}`);
    return key;
  }

  /**
   * Applies green border to agent tabs for visual distinction
   */
  private applyAgentTabBorder(view: WebContentsView): void {
    view.webContents.executeJavaScript(`
      (function() {
        const existingStyle = document.querySelector('style[data-agent-border="true"]');
        if (!existingStyle) {
          const style = document.createElement('style');
          style.setAttribute('data-agent-border', 'true');
          style.textContent = \`
            body::before {
              content: '';
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              pointer-events: none;
              z-index: 2147483647;
              box-shadow: inset 0 0 0 10px rgba(0, 255, 0, 0.2);
              border: 5px solid rgba(0, 200, 0, 0.3);
              box-sizing: border-box;
            }
          \`;
          document.head.appendChild(style);
        }
      })();
    `);
  }

  /**
   * Removes agent tab border styling
   */
  private removeAgentTabBorder(view: WebContentsView): void {
    view.webContents.executeJavaScript(`
      (function() {
        const existingStyle = document.querySelector('style[data-agent-border="true"]');
        if (existingStyle) {
          existingStyle.remove();
        }
      })();
    `);
  }

  /**
   * Handles automatic memory saving for completed page loads
   * Includes deduplication, URL filtering, and concurrency control
   */
  private async handleAutoMemorySave(tabKey: string): Promise<void> {
    const tab = this.tabs.get(tabKey);
    if (!tab || tab.asleep || tab.isAgentActive) {
      return; // Skip sleeping tabs and agent tabs
    }

    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) {
      return;
    }

    const url = view.webContents.getURL();
    const title = view.webContents.getTitle();

    // Filter out URLs we shouldn't save
    if (this.shouldSkipUrl(url)) {
      return;
    }

    // Check for duplicates
    if (this.savedUrls.has(url)) {
      logger.debug(`Skipping duplicate URL: ${url}`);
      return;
    }

    // Check if this tab is already being saved
    if (this.activeSaves.has(tabKey)) {
      logger.debug(`Save already in progress for: ${title}`);
      return;
    }

    // Check concurrency limit
    if (this.activeSaves.size >= this.maxConcurrentSaves) {
      logger.debug(`Max concurrent saves reached, queueing: ${title}`);
      if (!this.saveQueue.includes(tabKey)) {
        this.saveQueue.push(tabKey);
      }
      return;
    }

    this.performAsyncSave(tabKey, url, title);
  }

  /**
   * Performs the actual async save operation with proper cleanup
   */
  private performAsyncSave(tabKey: string, url: string, title: string): void {
    // Mark as active
    this.activeSaves.add(tabKey);
    logger.debug(
      `Starting async save (${this.activeSaves.size}/${this.maxConcurrentSaves}): ${title}`,
    );

    // Start save - completely non-blocking
    autoSaveTabToMemory(tabKey, this._browser)
      .then(() => {
        // Mark URL as saved to prevent duplicates
        this.savedUrls.add(url);
        logger.debug(`✅ Async save completed: ${title} (${url})`);
      })
      .catch(error => {
        logger.error(`❌ Async save failed for ${title}:`, error);
      })
      .finally(() => {
        // Clean up and process queue
        this.activeSaves.delete(tabKey);
        this.processNextInQueue();
      });
  }

  /**
   * Processes the next item in the save queue if there's capacity
   */
  private processNextInQueue(): void {
    if (
      this.saveQueue.length > 0 &&
      this.activeSaves.size < this.maxConcurrentSaves
    ) {
      const nextTabKey = this.saveQueue.shift();
      if (nextTabKey) {
        // Re-validate the tab before processing
        const tab = this.tabs.get(nextTabKey);
        if (tab && !tab.asleep && !tab.isAgentActive) {
          const view = this.getBrowserView(nextTabKey);
          if (view && !view.webContents.isDestroyed()) {
            const url = view.webContents.getURL();
            const title = view.webContents.getTitle();

            // Double-check it's not already saved and not currently being saved
            if (!this.savedUrls.has(url) && !this.activeSaves.has(nextTabKey)) {
              logger.debug(`Processing queued save: ${title}`);
              this.performAsyncSave(nextTabKey, url, title);
            }
          }
        }

        // Continue processing queue
        this.processNextInQueue();
      }
    }
  }

  /**
   * Determines if a URL should be skipped for memory saving
   */
  private shouldSkipUrl(url: string): boolean {
    if (!url || typeof url !== "string") return true;

    // Skip internal/system URLs
    const skipPrefixes = [
      "about:",
      "chrome:",
      "chrome-extension:",
      "devtools:",
      "file:",
      "data:",
      "blob:",
      "moz-extension:",
      "safari-extension:",
      "edge-extension:",
    ];

    const lowerUrl = url.toLowerCase();
    if (skipPrefixes.some(prefix => lowerUrl.startsWith(prefix))) {
      return true;
    }

    // Skip very short URLs or localhost
    if (url.length < 10 || lowerUrl.includes("localhost")) {
      return true;
    }

    return false;
  }
}
