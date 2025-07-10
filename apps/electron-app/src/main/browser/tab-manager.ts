import type { TabState } from "@vibe/shared-types";
import {
  TAB_CONFIG,
  GLASSMORPHISM_CONFIG,
  createLogger,
  truncateUrl,
} from "@vibe/shared-types";
import { WebContentsView, BrowserWindow, session } from "electron";
import { EventEmitter } from "events";
import fs from "fs-extra";
import type { CDPManager } from "../services/cdp-service";
import { fetchFaviconAsDataUrl } from "@/utils/favicon";
import { autoSaveTabToMemory } from "@/utils/tab-agent";
import { useUserProfileStore } from "@/store/user-profile-store";
import { setupContextMenuHandlers } from "./context-menu";
import { WindowBroadcast } from "@/utils/window-broadcast";
import { NavigationErrorHandler } from "./navigation-error-handler";
import { userAnalytics } from "@/services/user-analytics";
import { DEFAULT_USER_AGENT } from "../constants/user-agent";
// File system imports removed - now handled in protocol-handler

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
  private downloadIdMap = new Map<any, string>(); // Map download items to their IDs

  private updateTaskbarProgress(progress: number): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(progress);
        logger.debug(
          `Download progress updated to: ${(progress * 100).toFixed(1)}%`,
        );
      }
    } catch (error) {
      logger.warn("Failed to update download progress bar:", error);
    }
  }

  private clearTaskbarProgress(): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(-1); // Clear progress bar
        logger.debug("Download progress bar cleared");
      }
    } catch (error) {
      logger.warn("Failed to clear download progress bar:", error);
    }
  }

  private updateTaskbarProgressFromOldestDownload(): void {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) return;

      const downloads = userProfileStore.getDownloadHistory(activeProfile.id);
      const downloadingItems = downloads.filter(
        d => d.status === "downloading",
      );

      if (downloadingItems.length === 0) {
        this.clearTaskbarProgress();
        return;
      }

      // Find the oldest downloading item
      const oldestDownloading = downloadingItems.sort(
        (a, b) => a.createdAt - b.createdAt,
      )[0];

      if (oldestDownloading && oldestDownloading.progress !== undefined) {
        const progress = oldestDownloading.progress / 100; // Convert percentage to 0-1 range
        this.updateTaskbarProgress(progress);
      }
    } catch (error) {
      logger.warn(
        "Failed to update taskbar progress from oldest download:",
        error,
      );
    }
  }

  /**
   * Broadcasts an event to all renderer windows to signal that the download history has been updated.
   * This is used to trigger a refresh in the downloads window without polling.
   */
  private sendDownloadsUpdate(): void {
    try {
      // Using a debounced broadcast to prevent spamming renderers during rapid progress updates.
      WindowBroadcast.debouncedBroadcast(
        "downloads:history-updated",
        null,
        250,
      );
    } catch (error) {
      logger.warn("Failed to broadcast download update:", error);
    }
  }

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
    // Get active session from user profile store
    const userProfileStore = useUserProfileStore.getState();
    const activeSession = userProfileStore.getActiveSession();

    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        session: activeSession, // Use profile-specific session
      },
    });

    // Set browser user agent
    view.webContents.setUserAgent(DEFAULT_USER_AGENT);

    // Use opaque white background to fix speedlane rendering issues
    // Transparent backgrounds can cause visibility problems when multiple views overlap
    //view.setBackgroundColor("#FFFFFF");

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
    // Protocol handler is now registered globally in main process
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
    logger.debug(
      "[Download Debug] *** setupNavigationHandlers called for tab:",
      tabKey,
    );
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

    // Setup navigation error handlers
    NavigationErrorHandler.getInstance().setupErrorHandlers(view as any);

    // PDF detection for URLs that don't end in .pdf
    // Use will-download event to detect PDF downloads and convert them
    logger.debug(
      "[Download Debug] Setting up will-download listener for tab:",
      tabKey,
    );
    logger.debug("[Download Debug] Session info:", {
      tabKey,
      isDefaultSession: webContents.session === session.defaultSession,
      sessionType: webContents.session.isPersistent()
        ? "persistent"
        : "in-memory",
    });
    webContents.session.on("will-download", (event, item, webContents) => {
      const url = item.getURL();
      const mimeType = item.getMimeType();
      const fileName = item.getFilename();

      logger.debug("[Download Debug] *** DOWNLOAD EVENT TRIGGERED ***");
      logger.debug("[Download Debug] Tab manager will-download event:", {
        tabKey,
        url,
        mimeType,
        fileName,
        isPDF:
          mimeType === "application/pdf" || url.toLowerCase().endsWith(".pdf"),
        sessionType:
          webContents.session === session.defaultSession ? "default" : "custom",
      });

      // Check if this is a PDF download
      if (
        mimeType === "application/pdf" ||
        url.toLowerCase().endsWith(".pdf")
      ) {
        logger.debug(`PDF detected via download: ${url}`);
        logger.debug("[Download Debug] PDF download intercepted and cancelled");

        // Cancel the download
        event.preventDefault();

        // Convert the PDF URL to use our custom protocol
        const pdfUrl = `img://${Buffer.from(url).toString("base64")}`;

        // Navigate to the PDF via our custom protocol
        setTimeout(() => {
          webContents.loadURL(pdfUrl).catch(error => {
            logger.error("Failed to load PDF via custom protocol:", error);
          });
        }, 100);
      } else {
        logger.debug("[Download Debug] Non-PDF download allowed to proceed");

        // Track the download for non-PDF files
        const savePath = item.getSavePath();
        const downloadId = `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        logger.debug("[Download Debug] Tracking download:", {
          downloadId,
          fileName,
          savePath,
          totalBytes: item.getTotalBytes(),
        });

        // Add download to history immediately as "downloading"
        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (activeProfile) {
          logger.debug("[Download Debug] Adding download to profile:", {
            profileId: activeProfile.id,
            fileName,
            savePath,
            totalBytes: item.getTotalBytes(),
          });

          const downloadEntry = userProfileStore.addDownloadEntry(
            activeProfile.id,
            {
              fileName,
              filePath: savePath,
              createdAt: Date.now(),
              status: "downloading",
              progress: 0,
              totalBytes: item.getTotalBytes(),
              receivedBytes: 0,
              startTime: Date.now(),
            },
          );

          logger.debug("[Download Debug] Download entry created:", {
            downloadId: downloadEntry.id,
            fileName: downloadEntry.fileName,
            status: downloadEntry.status,
          });

          // Store the actual download ID for later use
          this.downloadIdMap.set(item, downloadEntry.id);

          // Verify the download was added to the profile
          const downloads = userProfileStore.getDownloadHistory(
            activeProfile.id,
          );
          logger.debug("[Download Debug] Profile downloads after adding:", {
            profileId: activeProfile.id,
            downloadsCount: downloads.length,
            latestDownload: downloads[downloads.length - 1],
          });
        } else {
          logger.debug(
            "[Download Debug] No active profile for download tracking",
          );
        }

        // Track download progress
        item.on("updated", (_event, state) => {
          if (state === "progressing" && activeProfile) {
            const receivedBytes = item.getReceivedBytes();
            const totalBytes = item.getTotalBytes();
            const progress = Math.round((receivedBytes / totalBytes) * 100);
            const actualDownloadId = this.downloadIdMap.get(item);

            if (actualDownloadId) {
              userProfileStore.updateDownloadProgress(
                activeProfile.id,
                actualDownloadId,
                progress,
                receivedBytes,
                totalBytes,
              );

              // Update taskbar progress based on oldest downloading item
              this.updateTaskbarProgressFromOldestDownload();

              // Notify renderer of the update
              this.sendDownloadsUpdate();
            }
          }
        });

        // Track when download completes
        item.on("done", (_event, state) => {
          const actualDownloadId = this.downloadIdMap.get(item);
          logger.debug("[Download Debug] Download done event (tab manager):", {
            downloadId: actualDownloadId,
            fileName,
            state,
            savePath,
          });

          if (state === "completed" && activeProfile && actualDownloadId) {
            logger.info(`Download completed: ${fileName}`);

            // Update download status to completed
            userProfileStore.completeDownload(
              activeProfile.id,
              actualDownloadId,
            );

            // Update file existence
            const exists = fs.existsSync(savePath);
            logger.debug(
              "[Download Debug] Download completed and updated in profile:",
              {
                profileId: activeProfile.id,
                downloadId: actualDownloadId,
                fileName,
                fileExists: exists,
              },
            );

            // Clean up the download ID mapping
            this.downloadIdMap.delete(item);

            // Update taskbar progress (will clear if no more downloads)
            this.updateTaskbarProgressFromOldestDownload();

            // Notify renderer of the update
            this.sendDownloadsUpdate();
          } else if (activeProfile && actualDownloadId) {
            logger.warn(`Download ${state}: ${fileName}`);

            if (state === "cancelled") {
              userProfileStore.cancelDownload(
                activeProfile.id,
                actualDownloadId,
              );
            } else {
              userProfileStore.errorDownload(
                activeProfile.id,
                actualDownloadId,
              );
            }

            // Clean up the download ID mapping
            this.downloadIdMap.delete(item);

            // Update taskbar progress even for failed/cancelled downloads
            this.updateTaskbarProgressFromOldestDownload();

            // Notify renderer of the update
            this.sendDownloadsUpdate();
          }
        });
      }
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
            } catch {
              logger.error("Error updating favicon:", Error);
            }
          }
        }
      }
    });

    // CDP event handler setup if CDP manager is available
    if (this.cdpManager) {
      this.cdpManager.setupEventHandlers(webContents, tabKey);
    }

    // Set up context menu handlers
    setupContextMenuHandlers(view);
  }

  /**
   * Safely check if a view or its webContents is destroyed
   */
  private isViewDestroyed(view: WebContentsView | null): boolean {
    if (!view) return true;

    try {
      return view.webContents.isDestroyed();
    } catch {
      // View itself was destroyed
      return true;
    }
  }

  /**
   * Creates a new tab with smart positioning
   */
  public createTab(url?: string, options?: { activate?: boolean }): string {
    const key = this.generateTabKey();
    const targetUrl = url || "https://www.google.com";
    const newTabPosition = this.calculateNewTabPosition();
    const shouldActivate = options?.activate !== false; // Default to true

    logger.debug("[Download Debug] *** createTab called:", {
      key,
      targetUrl,
      newTabPosition,
      shouldActivate,
    });

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

    if (shouldActivate) {
      this.setActiveTab(key);
    }

    this.normalizeTabPositions();
    this.emit("tab-created", key);

    // Start feature timer for this tab
    userAnalytics.startFeatureTimer(`tab-${key}`);

    // Track tab creation
    userAnalytics.trackNavigation("tab-created", {
      tabKey: key,
      url: targetUrl,
      totalTabs: this.tabs.size,
      activate: shouldActivate,
    });

    // Update usage stats for tab creation
    userAnalytics.updateUsageStats({ tabCreated: true });

    // Track tab creation - only in main window (renderer)
    const mainWindows = this._browser.getAllWindows().filter((w: any) => {
      try {
        return (
          w &&
          !w.isDestroyed() &&
          w.webContents &&
          !w.webContents.isDestroyed() &&
          (w.webContents.getURL().includes("localhost:5173") ||
            w.webContents.getURL().startsWith("file://"))
        );
      } catch {
        // Window or webContents was destroyed between checks
        return false;
      }
    });

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
    const closedTab = this.tabs.get(tabKey);

    // End feature timer for this tab
    userAnalytics.endFeatureTimer(`tab-${tabKey}`);

    // Track tab closure
    userAnalytics.trackNavigation("tab-closed", {
      tabKey: tabKey,
      url: closedTab?.url || "unknown",
      totalTabs: this.tabs.size - 1,
      wasActive: wasActive,
    });

    // Clean up CDP resources before removing the view
    if (this.cdpManager) {
      const view = this.getBrowserView(tabKey);
      if (view && !this.isViewDestroyed(view)) {
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
    const mainWindows = this._browser.getAllWindows().filter((w: any) => {
      try {
        return (
          w &&
          !w.isDestroyed() &&
          w.webContents &&
          !w.webContents.isDestroyed() &&
          (w.webContents.getURL().includes("localhost:5173") ||
            w.webContents.getURL().startsWith("file://"))
        );
      } catch {
        // Window or webContents was destroyed between checks
        return false;
      }
    });

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
      // End timer for previous tab
      userAnalytics.endFeatureTimer(`tab-${previousActiveKey}`);

      // Start timer for new tab
      userAnalytics.startFeatureTimer(`tab-${tabKey}`);

      // Track navigation
      const tab = this.tabs.get(tabKey);
      userAnalytics.trackNavigation("tab-switched", {
        from: previousActiveKey,
        to: tabKey,
        tabUrl: tab?.url,
        tabTitle: tab?.title,
        totalTabs: this.tabs.size,
      });

      const mainWindows = this._browser.getAllWindows().filter((w: any) => {
        try {
          return (
            w &&
            !w.isDestroyed() &&
            w.webContents &&
            !w.webContents.isDestroyed() &&
            (w.webContents.getURL().includes("localhost:5173") ||
              w.webContents.getURL().startsWith("file://"))
          );
        } catch {
          // Window or webContents was destroyed between checks
          return false;
        }
      });

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
    if (!view) return false;

    try {
      if (view.webContents.isDestroyed()) return false;
    } catch {
      // View itself was destroyed
      return false;
    }

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
      const oldUrl = tab.url;
      tab.url = newUrl;
      changes.push("url");

      // Track navigation breadcrumb
      userAnalytics.trackNavigation("url-changed", {
        tabKey: tabKey,
        oldUrl: oldUrl,
        newUrl: newUrl,
        isActiveTab: this.activeTabKey === tabKey,
      });

      // Track navigation history for user profile
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();
      if (activeProfile && newUrl && !this.shouldSkipUrl(newUrl)) {
        userProfileStore.addNavigationEntry(activeProfile.id, {
          url: newUrl,
          title: tab.title || newUrl,
          timestamp: Date.now(),
          favicon: tab.favicon,
        });
      }
    }

    const newIsLoading = webContents.isLoading();
    if (newIsLoading !== tab.isLoading) {
      tab.isLoading = newIsLoading;
      changes.push("isLoading");
    }

    // Safely check navigation history with fallback
    let newCanGoBack = false;
    try {
      newCanGoBack =
        (!this.isViewDestroyed(view) &&
          webContents.navigationHistory?.canGoBack()) ||
        false;
    } catch (error) {
      logger.warn(
        `Failed to check canGoBack for tab ${tab.key}, falling back to false:`,
        error,
      );
    }

    if (newCanGoBack !== tab.canGoBack) {
      tab.canGoBack = newCanGoBack;
      changes.push("canGoBack");
    }

    let newCanGoForward = false;
    try {
      newCanGoForward =
        (!this.isViewDestroyed(view) &&
          webContents.navigationHistory?.canGoForward()) ||
        false;
    } catch (error) {
      logger.warn(
        `Failed to check canGoForward for tab ${tab.key}, falling back to false:`,
        error,
      );
    }

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
   * Put tab to sleep with defensive checks for valid navigation state
   * Ensures tab has navigable content before sleeping to prevent wake-up issues
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
      const view = this.getBrowserView(tabKey);
      if (this.isViewDestroyed(view)) {
        return false;
      }

      const webContents = view.webContents;
      const currentUrl = webContents.getURL();

      // Don't sleep tabs that are already at problematic URLs
      if (
        !currentUrl ||
        currentUrl === TAB_CONFIG.SLEEP_MODE_URL ||
        currentUrl.startsWith("about:") ||
        currentUrl.startsWith("chrome:") ||
        currentUrl.startsWith("file:") ||
        currentUrl === "about:blank"
      ) {
        logger.debug(
          `Skipping sleep for tab ${tabKey} with problematic URL: ${currentUrl}`,
        );
        return false;
      }

      // Ensure tab has been loading/loaded to establish navigation history
      if (webContents.isLoading()) {
        logger.debug(`Skipping sleep for tab ${tabKey} - still loading`);
        return false;
      }

      // Update tab state first (flow-browser approach)
      this.updateTabState(tabKey);

      this.updateTab(tabKey, {
        asleep: true,
        url: TAB_CONFIG.SLEEP_MODE_URL,
      });

      // Load sleep mode URL (this creates a navigation entry that can be removed on wake)
      webContents.loadURL(TAB_CONFIG.SLEEP_MODE_URL);

      this.logDebug(`Tab ${tabKey} put to sleep from URL: ${currentUrl}`);
      return true;
    } catch (error) {
      logger.error(`Failed to put tab ${tabKey} to sleep:`, error);
      return false;
    }
  }

  /**
   * Wake up sleeping tab with robust fallback handling
   * Handles edge cases: no history, corrupted state, user navigation during sleep
   */
  public wakeUpTab(tabKey: string): boolean {
    const tab = this.tabs.get(tabKey);
    if (!tab || !tab.asleep) return false;

    try {
      const view = this.getBrowserView(tabKey);
      if (this.isViewDestroyed(view)) return false;

      const webContents = view.webContents;

      // Safely access navigationHistory with error handling
      let navigationHistory: Electron.NavigationHistory | null = null;
      let currentUrl: string;
      let activeIndex: number = -1;
      let currentEntry: Electron.NavigationEntry | null = null;
      let canGoBack = false;

      try {
        navigationHistory = webContents.navigationHistory;
        currentUrl = webContents.getURL();
        activeIndex = navigationHistory?.getActiveIndex() || -1;
        currentEntry =
          activeIndex >= 0
            ? navigationHistory?.getEntryAtIndex(activeIndex) || null
            : null;
        canGoBack = navigationHistory?.canGoBack() || false;
      } catch (error) {
        logger.warn(
          `Failed to access navigation history for tab ${tabKey}, using fallback values:`,
          error,
        );
        currentUrl = webContents.getURL();
        // Fall back to basic URL check without navigation history
      }

      // Case 1: Ideal scenario - tab is at sleep URL and has history to go back to
      if (
        currentEntry &&
        currentEntry.url === TAB_CONFIG.SLEEP_MODE_URL &&
        canGoBack &&
        navigationHistory
      ) {
        this.wakeUpFromHistory(
          webContents,
          navigationHistory,
          activeIndex,
          tabKey,
        );
      }
      // Case 2: Tab is at sleep URL but no history - find fallback URL
      else if (currentUrl === TAB_CONFIG.SLEEP_MODE_URL) {
        this.wakeUpWithFallback(webContents, navigationHistory, tabKey);
      }
      // Case 3: Tab navigated away from sleep URL (user interaction) - just update state
      else {
        logger.info(
          `Tab ${tabKey} already navigated away from sleep URL, updating state only`,
        );
      }

      // Update tab state
      this.updateTab(tabKey, {
        asleep: false,
      });

      this.logDebug(`Tab ${tabKey} woken up`);
      return true;
    } catch (error) {
      logger.error(`Failed to wake up tab ${tabKey}:`, error);
      // Fallback: try to load a default URL
      this.emergencyWakeUp(tabKey);
      return false;
    }
  }

  /**
   * Wake up tab using navigation history (ideal case)
   */
  private wakeUpFromHistory(
    webContents: any,
    navigationHistory: any,
    sleepIndex: number,
    tabKey: string,
  ): void {
    // Set up one-time navigation completion listener
    const onNavigationComplete = () => {
      webContents.removeListener("did-finish-load", onNavigationComplete);
      webContents.removeListener("did-fail-load", onNavigationComplete);

      // Clean up sleep mode entry from history
      try {
        navigationHistory.removeEntryAtIndex(sleepIndex);
        this.updateTabState(tabKey);
      } catch (error) {
        logger.warn(
          `Failed to clean up navigation history for tab ${tabKey}:`,
          error,
        );
      }
    };

    // Listen for navigation completion
    webContents.once("did-finish-load", onNavigationComplete);
    webContents.once("did-fail-load", onNavigationComplete);

    // Initiate navigation with error handling
    try {
      navigationHistory.goBack();
    } catch (error) {
      logger.error(
        `Failed to navigate back from history for tab ${tabKey}:`,
        error,
      );
      // Remove the listeners since navigation failed
      webContents.removeListener("did-finish-load", onNavigationComplete);
      webContents.removeListener("did-fail-load", onNavigationComplete);

      // Fallback to wakeUpWithFallback
      this.wakeUpWithFallback(webContents, navigationHistory, tabKey);
    }
  }

  /**
   * Wake up tab when no valid history exists (fallback case)
   */
  private wakeUpWithFallback(
    webContents: any,
    navigationHistory: any,
    tabKey: string,
  ): void {
    // Try to find a valid URL from history entries
    let fallbackUrl = "https://www.google.com"; // Default fallback

    try {
      const entries = navigationHistory.getAllEntries();
      // Look for the most recent non-sleep URL
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i];
        if (
          entry.url &&
          entry.url !== TAB_CONFIG.SLEEP_MODE_URL &&
          !entry.url.startsWith("about:")
        ) {
          fallbackUrl = entry.url;
          break;
        }
      }
    } catch (error) {
      logger.warn(
        `Failed to find fallback URL from history for tab ${tabKey}:`,
        error,
      );
    }

    logger.info(`Waking up tab ${tabKey} with fallback URL: ${fallbackUrl}`);

    // Load the fallback URL
    webContents.loadURL(fallbackUrl).catch((error: any) => {
      logger.error(`Failed to load fallback URL for tab ${tabKey}:`, error);
      // Last resort: load about:blank
      webContents.loadURL("about:blank");
    });
  }

  /**
   * Emergency wake up when all else fails
   */
  private emergencyWakeUp(tabKey: string): void {
    const view = this.getBrowserView(tabKey);
    if (view && !this.isViewDestroyed(view)) {
      logger.warn(`Emergency wake up for tab ${tabKey}, loading default page`);
      view.webContents.loadURL("https://www.google.com").catch(() => {
        view.webContents.loadURL("about:blank");
      });

      this.updateTab(tabKey, { asleep: false });
    }
  }

  /**
   * Navigation methods for tab-specific operations
   */
  public async loadUrl(tabKey: string, url: string): Promise<boolean> {
    const view = this.getBrowserView(tabKey);
    if (this.isViewDestroyed(view)) return false;

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
    if (this.isViewDestroyed(view)) return false;

    try {
      if (!view.webContents.navigationHistory?.canGoBack()) return false;
      view.webContents.goBack();
      return true;
    } catch (error) {
      logger.error(`Failed to navigate back for tab ${tabKey}:`, error);
      return false;
    }
  }

  public goForward(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (this.isViewDestroyed(view)) return false;

    try {
      if (!view.webContents.navigationHistory?.canGoForward()) return false;
      view.webContents.goForward();
      return true;
    } catch (error) {
      logger.error(`Failed to navigate forward for tab ${tabKey}:`, error);
      return false;
    }
  }

  public refresh(tabKey: string): boolean {
    const view = this.getBrowserView(tabKey);
    if (this.isViewDestroyed(view)) return false;

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
    logger.debug(
      "[Download Debug] *** createBrowserView called for tab:",
      tabKey,
      "with URL:",
      url,
    );
    // Create the WebContentsView internally (moved from ViewManager)
    const view = this.createWebContentsView(tabKey, url);

    // Set up navigation events here (moved from ViewManager)
    logger.debug(
      "[Download Debug] *** About to call setupNavigationHandlers for tab:",
      tabKey,
    );
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
    if (view && !this.isViewDestroyed(view)) {
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
              box-shadow: inset 0 0 0 10px theme('colors.green.200');
              border: 5px solid theme('colors.green.300');
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
    if (this.isViewDestroyed(view)) {
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
          if (view && !this.isViewDestroyed(view)) {
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

    // Security: Check URL length to prevent memory exhaustion
    const MAX_URL_LENGTH = 2048; // RFC 2616 recommendation
    if (url.length > MAX_URL_LENGTH) {
      logger.warn("URL exceeds maximum length, skipping");
      return true;
    }

    // Skip internal/system URLs and potentially dangerous schemes
    const skipPrefixes = [
      "about:",
      "chrome:",
      "chrome-extension:",
      "devtools:",
      "file:",
      "data:",
      "blob:",
      "javascript:",
      "vbscript:",
      "moz-extension:",
      "safari-extension:",
      "edge-extension:",
      "ms-appx:",
      "ms-appx-web:",
    ];

    const lowerUrl = url.toLowerCase();
    if (skipPrefixes.some(prefix => lowerUrl.startsWith(prefix))) {
      return true;
    }

    // Security: Validate URL scheme is HTTP/HTTPS
    try {
      const urlObj = new URL(url);
      if (!["http:", "https:"].includes(urlObj.protocol)) {
        logger.debug("Non-HTTP/HTTPS URL skipped:", urlObj.protocol);
        return true;
      }

      // Additional security checks
      if (
        urlObj.hostname === "localhost" ||
        urlObj.hostname === "127.0.0.1" ||
        urlObj.hostname.endsWith(".local")
      ) {
        return true;
      }
    } catch {
      // Invalid URL format
      logger.debug("Invalid URL format, skipping");
      return true;
    }

    // Skip very short URLs
    if (url.length < 10) {
      return true;
    }

    return false;
  }
}

// PDF to image conversion is now handled in the global protocol handler
