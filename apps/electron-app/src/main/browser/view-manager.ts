import { WebContentsView, BrowserWindow } from "electron";
import {
  BROWSER_CHROME,
  GLASSMORPHISM_CONFIG,
  CHAT_PANEL,
} from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";
import { OverlayManager } from "./overlay-manager";

const logger = createLogger("ViewManager");

// Legacy ViewManagerState interface for backward compatibility
export interface ViewManagerState {
  mainWindow: BrowserWindow;
  browserViews: Map<string, WebContentsView>;
  activeViewKey: string | null;
  updateBounds: () => void;
  isChatAreaVisible: boolean;
}

/**
 * ViewManager utility
 *
 * Handles WebContentsView bounds, visibility, and lifecycle management.
 * Does NOT handle:
 * - WebContentsView creation (now in TabManager)
 * - Navigation events (now in TabManager)
 * - Tab business logic (now in TabManager)
 *
 * Architecture:
 * - Pure utility methods: addView, removeView, setViewBounds, setViewVisible, getView
 * - Legacy compatibility: maintains existing API for backward compatibility
 * - Standalone functions: for external dependencies (gmailOAuthHandlers, etc.)
 */
export class ViewManager {
  // @ts-expect-error - intentionally unused parameter
  private _browser: any;
  private window: BrowserWindow;
  private browserViews: Map<string, WebContentsView> = new Map();
  private activeViewKey: string | null = null;
  private isChatAreaVisible: boolean = true;

  // Overlay manager
  private overlayManager: OverlayManager;

  // Track which views are currently visible
  private visibleViews: Set<string> = new Set();

  constructor(browser: any, window: BrowserWindow) {
    this._browser = browser;
    this.window = window;
    this.overlayManager = new OverlayManager(window);
  }

  // === OVERLAY MANAGEMENT ===

  /**
   * Initialize the overlay system
   */
  public async initializeOverlay(): Promise<void> {
    await this.overlayManager.initialize();
    this.ensureOverlayOnTop();
  }

  /**
   * Ensure overlay stays on top of all views
   */
  private ensureOverlayOnTop(): void {
    this.overlayManager.bringToFront();
  }

  /**
   * Get the overlay manager
   */
  public getOverlayManager(): OverlayManager {
    return this.overlayManager;
  }

  // === PURE UTILITY INTERFACE ===

  /**
   * Adds a WebContentsView to the manager and window
   * Pure utility method for view registration and display
   */
  public addView(view: WebContentsView, tabKey: string): void {
    this.browserViews.set(tabKey, view);

    if (this.window) {
      this.window.contentView.addChildView(view);
      this.updateBoundsForView(tabKey);
      // Ensure overlay stays on top
      this.ensureOverlayOnTop();
    }
  }

  /**
   * Removes a WebContentsView from the manager and window
   * Pure utility method for view cleanup
   */
  public removeView(tabKey: string): void {
    const view = this.browserViews.get(tabKey);
    if (!view) return;

    if (this.window && !view.webContents.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }

    this.browserViews.delete(tabKey);
    this.visibleViews.delete(tabKey);
  }

  /**
   * Sets bounds for a specific view
   * Pure utility method for view positioning
   */
  public setViewBounds(
    tabKey: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    const view = this.browserViews.get(tabKey);
    if (!view || view.webContents.isDestroyed()) return;

    if (bounds.width > 0 && bounds.height > 0) {
      view.setBounds(bounds);
    }
  }

  /**
   * Sets visibility for a specific view
   * Pure utility method for view visibility control
   */
  public setViewVisible(tabKey: string, visible: boolean): void {
    const view = this.browserViews.get(tabKey);
    if (!view) return;

    if (visible) {
      if (!this.visibleViews.has(tabKey)) {
        view.setVisible(true);
        this.visibleViews.add(tabKey);
        this.updateBoundsForView(tabKey);
      }
    } else {
      if (this.visibleViews.has(tabKey)) {
        view.setVisible(false);
        this.visibleViews.delete(tabKey);
      }
    }
  }

  /**
   * Gets a WebContentsView by tab key
   * Pure utility method for view access
   */
  public getView(tabKey: string): WebContentsView | null {
    return this.browserViews.get(tabKey) || null;
  }

  // === EXISTING METHODS (for backward compatibility) ===

  /**
   * Removes a WebContentsView
   */
  public async removeBrowserView(tabKey: string): Promise<boolean> {
    const view = this.browserViews.get(tabKey);
    if (!view) {
      return false;
    }

    // Stop all audio/video before closing
    if (!view.webContents.isDestroyed()) {
      try {
        logger.info(`🔇 Stopping audio/video for tab ${tabKey}`);

        // Stop any pending navigation and media streams
        view.webContents.stop();

        await view.webContents.executeJavaScript(`
          // Pause and cleanup all audio/video elements
          document.querySelectorAll('audio, video').forEach(media => {
            media.pause();
            media.src = '';
            media.load();
          });
          
          // Stop any Web Audio API contexts
          if (typeof AudioContext !== 'undefined' && window.audioContext) {
            window.audioContext.close();
          }
        `);

        // Small delay to ensure cleanup completes
        await new Promise(resolve => setTimeout(resolve, 50));
        logger.info(`✅ Audio/video stopped for tab ${tabKey}`);
      } catch (error) {
        logger.warn(`❌ Failed to stop media for tab ${tabKey}:`, error);
      }
    }

    // Remove from window
    if (this.window && !view.webContents.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }

    // Clean up view
    if (!view.webContents.isDestroyed()) {
      view.webContents.removeAllListeners();
      // Destroy the webContents which will clean up all resources including audio/video
      (view.webContents as any).destroy();
    }

    this.browserViews.delete(tabKey);

    // Clean up visibility tracking
    this.visibleViews.delete(tabKey);

    // Update active view if this was active
    if (this.activeViewKey === tabKey) {
      const remainingKeys = Array.from(this.browserViews.keys());
      this.activeViewKey = remainingKeys.length > 0 ? remainingKeys[0] : null;
      this.updateBounds();
    }

    return true;
  }

  /**
   * Gets a WebContentsView by tab key
   */
  public getBrowserView(tabKey: string): WebContentsView | null {
    return this.browserViews.get(tabKey) || null;
  }

  /**
   * Sets the active view using visibility control
   */
  public setActiveView(tabKey: string): boolean {
    if (!this.browserViews.has(tabKey)) {
      logger.warn(
        `🔧 ViewManager: Cannot set active view ${tabKey} - not found`,
      );
      return false;
    }

    // Hide currently visible view (if different from new active)
    if (this.activeViewKey && this.activeViewKey !== tabKey) {
      this.hideView(this.activeViewKey);
    }

    // Show new active view
    this.showView(tabKey);
    this.activeViewKey = tabKey;

    logger.debug(`🔧 ViewManager: Set active view to ${tabKey}`);
    return true;
  }

  /**
   * Gets the active view key
   */
  public getActiveViewKey(): string | null {
    return this.activeViewKey;
  }

  /**
   * Show a specific view (make visible)
   */
  public showView(tabKey: string): boolean {
    const view = this.browserViews.get(tabKey);
    if (!view) {
      logger.warn(`🔧 ViewManager: Cannot show view ${tabKey} - not found`);
      return false;
    }

    if (this.visibleViews.has(tabKey)) {
      return true;
    }

    // Make view visible
    view.setVisible(true);
    this.visibleViews.add(tabKey);

    // Update bounds for the newly visible view
    this.updateBoundsForView(tabKey);

    // Ensure overlay stays on top
    this.ensureOverlayOnTop();

    return true;
  }

  /**
   * Hide a specific view (make invisible)
   */
  public hideView(tabKey: string): boolean {
    const view = this.browserViews.get(tabKey);
    if (!view) {
      logger.warn(`🔧 ViewManager: Cannot hide view ${tabKey} - not found`);
      return false;
    }

    if (!this.visibleViews.has(tabKey)) {
      return true;
    }

    // Make view invisible
    view.setVisible(false);
    this.visibleViews.delete(tabKey);

    return true;
  }

  /**
   * Hide web contents (for omnibox overlay)
   */
  public hideWebContents(): void {
    if (this.activeViewKey) {
      const view = this.browserViews.get(this.activeViewKey);
      if (view) {
        view.setVisible(false);
      }
    }
  }

  /**
   * Show web contents (after omnibox overlay)
   */
  public showWebContents(): void {
    if (this.activeViewKey) {
      const view = this.browserViews.get(this.activeViewKey);
      if (view) {
        view.setVisible(true);
      }
    }
  }

  /**
   * Hide all views for clean state
   */
  public hideAllViews(): void {
    for (const tabKey of this.visibleViews) {
      const view = this.browserViews.get(tabKey);
      if (view) {
        view.setVisible(false);
      }
    }
    this.visibleViews.clear();
  }

  /**
   * Check if a view is currently visible
   */
  public isViewVisible(tabKey: string): boolean {
    return this.visibleViews.has(tabKey);
  }

  /**
   * Get list of currently visible view keys
   */
  public getVisibleViews(): string[] {
    return Array.from(this.visibleViews);
  }

  /**
   * Update bounds for a specific view (used by showView)
   */
  private updateBoundsForView(tabKey: string): void {
    const view = this.browserViews.get(tabKey);
    if (!view || !this.visibleViews.has(tabKey)) {
      return;
    }

    if (!this.window || this.window.isDestroyed()) {
      return;
    }

    const [windowWidth, windowHeight] = this.window.getContentSize();
    const chromeHeight = BROWSER_CHROME.TOTAL_CHROME_HEIGHT;

    let viewWidth = windowWidth - GLASSMORPHISM_CONFIG.PADDING * 2;
    if (this.isChatAreaVisible) {
      // Use the shared chat panel width configuration
      const chatPanelWidth = CHAT_PANEL.DEFAULT_WIDTH;
      viewWidth = Math.max(
        1,
        windowWidth - chatPanelWidth - GLASSMORPHISM_CONFIG.PADDING * 2,
      );
    }

    const bounds = {
      x: GLASSMORPHISM_CONFIG.PADDING,
      y: chromeHeight + GLASSMORPHISM_CONFIG.PADDING,
      width: viewWidth,
      height: Math.max(
        1,
        windowHeight - chromeHeight - GLASSMORPHISM_CONFIG.PADDING * 2,
      ),
    };

    if (bounds.width > 0 && bounds.height > 0) {
      view.setBounds(bounds);
    }
  }

  /**
   * Toggles chat panel visibility
   */
  public toggleChatPanel(isVisible?: boolean): void {
    this.isChatAreaVisible =
      isVisible !== undefined ? isVisible : !this.isChatAreaVisible;
    this.updateBounds();
  }

  /**
   * Gets chat panel state
   */
  public getChatPanelState(): { isVisible: boolean } {
    return {
      isVisible: this.isChatAreaVisible,
    };
  }

  /**
   * Updates bounds for visible WebContentsViews only
   */
  public updateBounds(): void {
    if (!this.window || this.window.isDestroyed()) {
      logger.debug("🔧 updateBounds: No window available");
      return;
    }

    const [windowWidth, windowHeight] = this.window.getContentSize();
    const chromeHeight = BROWSER_CHROME.TOTAL_CHROME_HEIGHT;
    const viewHeight = Math.max(
      1,
      windowHeight - chromeHeight - GLASSMORPHISM_CONFIG.PADDING * 2,
    );

    let viewWidth = windowWidth - GLASSMORPHISM_CONFIG.PADDING * 2;
    if (this.isChatAreaVisible) {
      // Use the shared chat panel width configuration
      const chatPanelWidth = CHAT_PANEL.DEFAULT_WIDTH;
      viewWidth = Math.max(
        1,
        windowWidth - chatPanelWidth - GLASSMORPHISM_CONFIG.PADDING * 2,
      );
      logger.debug(
        `🔧 WebContentsView bounds: windowWidth=${windowWidth}, chatPanelWidth=${chatPanelWidth}, viewWidth=${viewWidth}`,
      );
    }

    // Only update bounds for visible views
    for (const tabKey of this.visibleViews) {
      const view = this.browserViews.get(tabKey);
      if (view && !view.webContents.isDestroyed()) {
        const newBounds = {
          x: GLASSMORPHISM_CONFIG.PADDING,
          y: chromeHeight + GLASSMORPHISM_CONFIG.PADDING,
          width: viewWidth,
          height: viewHeight,
        };
        if (newBounds.width > 0 && newBounds.height > 0) {
          view.setBounds(newBounds);
        }
      }
    }

    // No z-index management needed - using visibility control
  }

  /**
   * Gets the legacy ViewManagerState for backward compatibility
   */
  public getViewManagerState(): ViewManagerState {
    if (!this.window) {
      throw new Error("Main window is not available");
    }

    return {
      mainWindow: this.window,
      browserViews: this.browserViews,
      activeViewKey: this.activeViewKey,
      updateBounds: () => this.updateBounds(),
      isChatAreaVisible: this.isChatAreaVisible,
    };
  }

  /**
   * Destroys the view manager
   */
  public async destroy(): Promise<void> {
    // Clean up overlay manager
    this.overlayManager.destroy();

    for (const [tabKey] of this.browserViews) {
      await this.removeBrowserView(tabKey);
    }
    this.browserViews.clear();
    this.activeViewKey = null;
  }
}

/**
 * Standalone createBrowserView function for backward compatibility
 */
export function createBrowserView(
  viewManager: ViewManagerState,
  tabKey: string,
): WebContentsView {
  if (!viewManager.mainWindow) {
    throw new Error("Main window is not available");
  }

  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  });

  // Set transparent background and initialize as invisible
  view.setBackgroundColor("#00000000");
  view.setVisible(false);

  // Add rounded corners for glassmorphism design
  view.setBorderRadius(GLASSMORPHISM_CONFIG.BORDER_RADIUS);

  viewManager.browserViews.set(tabKey, view);
  viewManager.mainWindow.contentView.addChildView(view);

  // Set bounds
  const [width, height] = viewManager.mainWindow.getContentSize();
  const bounds = {
    x: GLASSMORPHISM_CONFIG.PADDING,
    y: BROWSER_CHROME.TOTAL_CHROME_HEIGHT + GLASSMORPHISM_CONFIG.PADDING,
    width: width - GLASSMORPHISM_CONFIG.PADDING * 2,
    height:
      height -
      BROWSER_CHROME.TOTAL_CHROME_HEIGHT -
      GLASSMORPHISM_CONFIG.PADDING * 2,
  };
  if (bounds.width > 0 && bounds.height > 0) {
    view.setBounds(bounds);
  }

  return view;
}
