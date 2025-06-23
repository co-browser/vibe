import { WebContentsView } from "electron";
import { GLASSMORPHISM_CONFIG, createLogger } from "@vibe/shared-types";
import type { CDPManager } from "../services/cdp-service";
import type { TabManagerState } from "./tab-state-manager";
import type { TabEventBus } from "./tab-event-bus";
import { fetchFaviconAsDataUrl } from "@/utils/favicon";
import { autoSaveTabToMemory } from "@/utils/tab-agent";

const logger = createLogger("TabViewCoordinator");

/**
 * Handles view attachment, detachment, and coordination
 * Extracted from TabManager for better separation of concerns
 */
export class TabViewCoordinator {
  constructor(
    private state: TabManagerState,
    private eventBus: TabEventBus,
    private viewManager: any,
    private cdpManager?: CDPManager,
    private browser?: any
  ) {}

  /**
   * Creates a WebContentsView for a tab
   */
  public createWebContentsView(tabKey: string, url?: string): WebContentsView {
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
    view.setBorderRadius(GLASSMORPHISM_CONFIG.BORDER_RADIUS);

    // Suppress common DevTools console errors
    view.webContents.on(
      "console-message",
      (_event, _level, message, _line, _sourceId) => {
        if (
          message.includes("Autofill.enable") ||
          message.includes("Autofill.setAddresses")
        ) {
          return; // Don't log these
        }
      }
    );

    // CDP integration
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

    // Store view state
    this.state.viewStates.set(tabKey, {
      view,
      isVisible: false,
    });

    this.eventBus.emit("tab-view:created", { key: tabKey, view });
    return view;
  }

  /**
   * Sets up navigation event handlers for a WebContentsView
   */
  public setupNavigationHandlers(view: WebContentsView, tabKey: string): void {
    const webContents = view.webContents;

    // Navigation event handlers for tab state updates
    const updateTabState = (): void => {
      this.eventBus.emit("tab-navigation:complete", { 
        key: tabKey, 
        url: webContents.getURL() 
      });
    };

    webContents.on("did-start-loading", () => {
      this.eventBus.emit("tab-navigation:start", { 
        key: tabKey, 
        url: webContents.getURL() 
      });
      updateTabState();
    });
    
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

    // Automatic memory saving on SPA internal navigation
    webContents.on("did-navigate-in-page", () => {
      this.handleAutoMemorySave(tabKey).catch(error => {
        logger.error(
          `Auto memory save (SPA navigation) failed for ${tabKey}:`,
          error
        );
      });
    });

    // Favicon update handler
    webContents.on("page-favicon-updated", async (_event, favicons) => {
      if (favicons.length > 0) {
        const activeTab = this.state.tabs.get(this.state.activeTab || "");
        if (activeTab && this.state.activeTab === tabKey) {
          if (activeTab.favicon !== favicons[0]) {
            logger.debug("page-favicon-updated", activeTab.favicon, favicons[0]);
            try {
              activeTab.favicon = await fetchFaviconAsDataUrl(favicons[0]);
              this.eventBus.emit("tab-state:updated", { 
                tab: activeTab, 
                changes: ["favicon"] 
              });
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
   * Creates a browser view and registers it with the view manager
   */
  public createBrowserView(tabKey: string, url: string): void {
    // Create the WebContentsView
    const view = this.createWebContentsView(tabKey, url);

    // Set up navigation events
    this.setupNavigationHandlers(view, tabKey);

    // Register with view manager
    if (!this.viewManager) {
      throw new Error("View manager not available");
    }

    this.viewManager.addView(view, tabKey);

    // Initially hidden (will be shown when tab becomes active)
    this.setViewVisible(tabKey, false);
  }

  /**
   * Removes a browser view
   */
  public removeBrowserView(tabKey: string): void {
    // Clean up CDP resources
    if (this.cdpManager) {
      const viewState = this.state.viewStates.get(tabKey);
      if (viewState?.view && !viewState.view.webContents.isDestroyed()) {
        this.cdpManager.cleanup(viewState.view.webContents);
      }
    }

    // Remove from view manager
    if (this.viewManager) {
      this.viewManager.removeView(tabKey);
    }

    // Clean up state
    this.state.viewStates.delete(tabKey);
    this.eventBus.emit("tab-view:destroyed", { key: tabKey });
  }

  /**
   * Gets a browser view
   */
  public getBrowserView(tabKey: string): WebContentsView | null {
    const viewState = this.state.viewStates.get(tabKey);
    return viewState?.view || null;
  }

  /**
   * Sets view visibility
   */
  public setViewVisible(tabKey: string, isVisible: boolean): void {
    const viewState = this.state.viewStates.get(tabKey);
    if (viewState) {
      viewState.isVisible = isVisible;
      
      // Update view manager visibility
      if (this.viewManager) {
        this.viewManager.setViewVisible(tabKey, isVisible);
      }
      
      this.eventBus.emit("tab-view:visibility-changed", { key: tabKey, isVisible });
    }
  }

  /**
   * Updates view bounds
   */
  public updateViewBounds(tabKey: string, bounds: { x: number; y: number; width: number; height: number }): void {
    const viewState = this.state.viewStates.get(tabKey);
    if (viewState) {
      viewState.bounds = bounds;
      
      // Update actual view bounds if view manager supports it
      if (this.viewManager && this.viewManager.setViewBounds) {
        this.viewManager.setViewBounds(tabKey, bounds);
      }
      
      this.eventBus.emit("tab-view:bounds-updated", { key: tabKey, bounds });
    }
  }

  /**
   * Applies visual styling for agent tabs
   */
  public applyAgentTabBorder(tabKey: string): void {
    const view = this.getBrowserView(tabKey);
    if (view && !view.webContents.isDestroyed()) {
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
  }

  /**
   * Removes agent tab border styling
   */
  public removeAgentTabBorder(tabKey: string): void {
    const view = this.getBrowserView(tabKey);
    if (view && !view.webContents.isDestroyed()) {
      view.webContents.executeJavaScript(`
        (function() {
          const existingStyle = document.querySelector('style[data-agent-border="true"]');
          if (existingStyle) {
            existingStyle.remove();
          }
        })();
      `);
    }
  }

  /**
   * Navigation operations
   */
  public async loadUrl(tabKey: string, url: string): Promise<boolean> {
    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) return false;

    try {
      await view.webContents.loadURL(url);
      this.eventBus.emit("tab-navigation:complete", { key: tabKey, url });
      return true;
    } catch (error) {
      this.eventBus.emit("tab-navigation:failed", { key: tabKey, url, error });
      logger.error(`Failed to load URL ${url} in tab ${tabKey}:`, error);
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
    if (!view || !view.webContents.navigationHistory.canGoForward()) return false;

    view.webContents.goForward();
    return true;
  }

  public refresh(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (!view || view.webContents.isDestroyed()) return false;

    view.webContents.reload();
    return true;
  }

  /**
   * Cleanup
   */
  public destroy(): void {
    // Clean up all views
    for (const [tabKey] of this.state.viewStates) {
      this.removeBrowserView(tabKey);
    }
  }

  // Private helper methods

  private async handleAutoMemorySave(tabKey: string): Promise<void> {
    const tab = this.state.tabs.get(tabKey);
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
    if (this.state.savedUrls.has(url)) {
      logger.debug(`Skipping duplicate URL: ${url}`);
      return;
    }

    // Check if this tab is already being saved
    if (this.state.activeSaves.has(tabKey)) {
      logger.debug(`Save already in progress for: ${title}`);
      return;
    }

    // Check concurrency limit
    if (this.state.activeSaves.size >= this.state.maxConcurrentSaves) {
      logger.debug(`Max concurrent saves reached, queueing: ${title}`);
      if (!this.state.saveQueue.includes(tabKey)) {
        this.state.saveQueue.push(tabKey);
      }
      return;
    }

    this.performAsyncSave(tabKey, url, title);
  }

  private performAsyncSave(tabKey: string, url: string, title: string): void {
    if (!this.browser) {
      logger.warn("Browser instance not available for memory save");
      return;
    }

    // Mark as active
    this.state.activeSaves.add(tabKey);
    logger.debug(
      `Starting async save (${this.state.activeSaves.size}/${this.state.maxConcurrentSaves}): ${title}`
    );

    this.eventBus.emit("tab-memory:save-requested", { key: tabKey, url });

    // Start save - completely non-blocking
    autoSaveTabToMemory(tabKey, this.browser)
      .then(() => {
        // Mark URL as saved to prevent duplicates
        this.state.savedUrls.add(url);
        this.eventBus.emit("tab-memory:save-complete", { key: tabKey, url });
        logger.debug(`✅ Async save completed: ${title} (${url})`);
      })
      .catch(error => {
        this.eventBus.emit("tab-memory:save-failed", { key: tabKey, url, error });
        logger.error(`❌ Async save failed for ${title}:`, error);
      })
      .finally(() => {
        // Clean up and process queue
        this.state.activeSaves.delete(tabKey);
        this.processNextInQueue();
      });
  }

  private processNextInQueue(): void {
    if (
      this.state.saveQueue.length > 0 &&
      this.state.activeSaves.size < this.state.maxConcurrentSaves
    ) {
      const nextTabKey = this.state.saveQueue.shift();
      if (nextTabKey) {
        // Re-validate the tab before processing
        const tab = this.state.tabs.get(nextTabKey);
        if (tab && !tab.asleep && !tab.isAgentActive) {
          const view = this.getBrowserView(nextTabKey);
          if (view && !view.webContents.isDestroyed()) {
            const url = view.webContents.getURL();
            const title = view.webContents.getTitle();

            // Double-check it's not already saved and not currently being saved
            if (!this.state.savedUrls.has(url) && !this.state.activeSaves.has(nextTabKey)) {
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