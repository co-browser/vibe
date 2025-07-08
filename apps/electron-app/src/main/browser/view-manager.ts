import { WebContentsView, BrowserWindow } from "electron";
import {
  BROWSER_CHROME,
  GLASSMORPHISM_CONFIG,
  CHAT_PANEL,
} from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";
import { OverlayManager } from "./overlay-manager";
import { DEFAULT_USER_AGENT } from "../constants/user-agent";
import { mainProcessPerformanceMonitor } from "../utils/performanceMonitor";

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
  private isChatAreaVisible: boolean = false;
  private currentChatPanelWidth: number = CHAT_PANEL.DEFAULT_WIDTH;
  private isSpeedlaneMode: boolean = false;
  private speedlaneLeftViewKey: string | null = null;
  private speedlaneRightViewKey: string | null = null;

  // Overlay manager
  private overlayManager: OverlayManager;

  // Track which views are currently visible
  private visibleViews: Set<string> = new Set();
  
  // Cache for bounds calculations to avoid redundant updates
  private lastBoundsCache: {
    windowWidth: number;
    windowHeight: number;
    chatPanelWidth: number;
    isChatVisible: boolean;
  } | null = null;

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
  public removeBrowserView(tabKey: string): boolean {
    const view = this.browserViews.get(tabKey);
    if (!view) {
      return false;
    }

    // Remove from window
    if (this.window && !view.webContents.isDestroyed()) {
      this.window.contentView.removeChildView(view);
    }

    // Clean up view
    if (!view.webContents.isDestroyed()) {
      view.webContents.removeAllListeners();
      view.webContents.close();
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

    // In Speedlane mode, don't hide the previous view if it's the right view
    if (this.activeViewKey && this.activeViewKey !== tabKey) {
      if (
        !this.isSpeedlaneMode ||
        this.activeViewKey !== this.speedlaneRightViewKey
      ) {
        this.hideView(this.activeViewKey);
      }
    }

    // Show new active view
    this.showView(tabKey);
    this.activeViewKey = tabKey;

    logger.debug(`🔧 ViewManager: Set active view to ${tabKey}`);

    // In Speedlane mode, update bounds to ensure both views are positioned correctly
    if (this.isSpeedlaneMode) {
      this.updateBounds();
    }

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

    // In Speedlane mode, use the full updateBounds method to position both views correctly
    if (this.isSpeedlaneMode) {
      this.updateBounds();
      return;
    }

    const [windowWidth, windowHeight] = this.window.getContentSize();
    const chromeHeight = BROWSER_CHROME.TOTAL_CHROME_HEIGHT;

    let viewWidth = windowWidth - GLASSMORPHISM_CONFIG.PADDING * 2;
    if (this.isChatAreaVisible) {
      // Use the current dynamic chat panel width
      viewWidth = Math.max(
        1,
        windowWidth -
          this.currentChatPanelWidth -
          GLASSMORPHISM_CONFIG.PADDING * 2,
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
    // Invalidate cache since chat visibility changed
    this.lastBoundsCache = null;
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
   * Sets the chat panel width and updates layout
   */
  public setChatPanelWidth(width: number): void {
    // Only update if width actually changed significantly
    if (Math.abs(this.currentChatPanelWidth - width) > 1) {
      const oldWidth = this.currentChatPanelWidth;
      this.currentChatPanelWidth = width;
      
      // Optimize: Only update bounds for visible views when chat width changes
      if (this.isChatAreaVisible) {
        this.updateBoundsForChatResize(oldWidth, width);
      }
    }
  }
  
  /**
   * Optimized bounds update specifically for chat panel resize
   * Avoids full bounds recalculation when only chat width changes
   */
  private updateBoundsForChatResize(_oldChatWidth: number, newChatWidth: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    
    // Start performance tracking
    mainProcessPerformanceMonitor.startBoundsUpdate();
    
    // Use cached window dimensions if available
    const windowWidth = this.lastBoundsCache?.windowWidth || this.window.getContentSize()[0];
    
    // Calculate new available width for webviews
    const newAvailableWidth = Math.max(
      1,
      windowWidth - newChatWidth - GLASSMORPHISM_CONFIG.PADDING * 2
    );
    
    // Only update width for visible views (no need to recalculate everything)
    for (const tabKey of this.visibleViews) {
      const view = this.browserViews.get(tabKey);
      if (view && !view.webContents.isDestroyed()) {
        try {
          // Get current bounds and only update width
          const currentBounds = view.getBounds();
          if (currentBounds.width !== newAvailableWidth) {
            view.setBounds({
              ...currentBounds,
              width: newAvailableWidth
            });
          }
        } catch {
          // Fallback to full update if getBounds fails
          this.lastBoundsCache = null;
          mainProcessPerformanceMonitor.endBoundsUpdate(true);
          this.updateBounds();
          return;
        }
      }
    }
    
    // Update cache with new chat width
    if (this.lastBoundsCache) {
      this.lastBoundsCache.chatPanelWidth = newChatWidth;
    }
    
    // End performance tracking
    mainProcessPerformanceMonitor.endBoundsUpdate(true);
  }

  /**
   * Sets Speedlane mode (dual webview layout)
   */
  public setSpeedlaneMode(enabled: boolean): void {
    logger.info(`Setting Speedlane mode to: ${enabled}`);
    this.isSpeedlaneMode = enabled;

    if (!enabled) {
      // Clear Speedlane view references when disabling
      this.speedlaneLeftViewKey = null;
      this.speedlaneRightViewKey = null;
    }

    // Update layout to reflect the new mode
    this.updateBounds();
  }

  /**
   * Sets the right view for Speedlane mode (agent-controlled)
   */
  public setSpeedlaneRightView(tabKey: string): void {
    if (!this.isSpeedlaneMode) {
      logger.warn("Cannot set Speedlane right view when not in Speedlane mode");
      return;
    }

    logger.info(`Setting Speedlane right view to: ${tabKey}`);
    this.speedlaneRightViewKey = tabKey;

    // Make sure the view is visible
    const view = this.browserViews.get(tabKey);
    if (view) {
      this.visibleViews.add(tabKey);
      view.setVisible(true);
      logger.info(`Made right view ${tabKey} visible`);
    } else {
      logger.warn(`Could not find view for tabKey: ${tabKey}`);
    }

    // Update bounds to position it correctly
    this.updateBounds();
  }

  /**
   * Gets the current Speedlane mode state
   */
  public getSpeedlaneState(): {
    enabled: boolean;
    leftViewKey: string | null;
    rightViewKey: string | null;
  } {
    return {
      enabled: this.isSpeedlaneMode,
      leftViewKey: this.speedlaneLeftViewKey,
      rightViewKey: this.speedlaneRightViewKey,
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
    
    // Start performance tracking
    mainProcessPerformanceMonitor.startBoundsUpdate();

    const [windowWidth, windowHeight] = this.window.getContentSize();
    
    // Check if bounds actually changed significantly
    if (this.lastBoundsCache &&
        Math.abs(this.lastBoundsCache.windowWidth - windowWidth) < 2 &&
        Math.abs(this.lastBoundsCache.windowHeight - windowHeight) < 2 &&
        Math.abs(this.lastBoundsCache.chatPanelWidth - this.currentChatPanelWidth) < 2 &&
        this.lastBoundsCache.isChatVisible === this.isChatAreaVisible) {
      // Nothing changed significantly, skip update
      return;
    }
    
    // Update cache
    this.lastBoundsCache = {
      windowWidth,
      windowHeight,
      chatPanelWidth: this.currentChatPanelWidth,
      isChatVisible: this.isChatAreaVisible
    };
    const chromeHeight = BROWSER_CHROME.TOTAL_CHROME_HEIGHT;
    const viewHeight = Math.max(
      1,
      windowHeight - chromeHeight - GLASSMORPHISM_CONFIG.PADDING * 2,
    );

    // Calculate available width for webviews
    let availableWidth = windowWidth - GLASSMORPHISM_CONFIG.PADDING * 2;
    if (this.isChatAreaVisible) {
      // Subtract chat panel width when visible
      availableWidth = Math.max(
        1,
        windowWidth -
          this.currentChatPanelWidth -
          GLASSMORPHISM_CONFIG.PADDING * 2,
      );
    }

    if (this.isSpeedlaneMode) {
      // In Speedlane mode, split the available width between two webviews
      const leftViewWidth = Math.floor(availableWidth / 2);
      const rightViewWidth = availableWidth - leftViewWidth;

      logger.debug(
        `🔧 Speedlane mode bounds: total=${availableWidth}, left=${leftViewWidth}, right=${rightViewWidth}`,
      );

      // First, hide all views that shouldn't be visible
      for (const [tabKey, view] of this.browserViews) {
        if (view && !view.webContents.isDestroyed()) {
          const shouldBeVisible =
            tabKey === this.activeViewKey ||
            tabKey === this.speedlaneRightViewKey;

          if (!shouldBeVisible && this.visibleViews.has(tabKey)) {
            view.setVisible(false);
            this.visibleViews.delete(tabKey);
          }
        }
      }

      // Then, set up the left view (active view)
      if (this.activeViewKey) {
        const leftView = this.browserViews.get(this.activeViewKey);
        if (leftView && !leftView.webContents.isDestroyed()) {
          this.speedlaneLeftViewKey = this.activeViewKey;
          const leftBounds = {
            x: GLASSMORPHISM_CONFIG.PADDING,
            y: chromeHeight + GLASSMORPHISM_CONFIG.PADDING,
            width: leftViewWidth,
            height: viewHeight,
          };
          if (leftBounds.width > 0 && leftBounds.height > 0) {
            leftView.setBounds(leftBounds);
            leftView.setVisible(true);
            this.visibleViews.add(this.activeViewKey);

            // Ensure the view is added to the window
            if (
              this.window &&
              !this.window.contentView.children.includes(leftView)
            ) {
              this.window.contentView.addChildView(leftView);
              logger.debug(
                `🔧 Added left view to window for ${this.activeViewKey}`,
              );
            }
          }
        }
      }

      // Set up the right view (agent-controlled)
      if (this.speedlaneRightViewKey) {
        const rightView = this.browserViews.get(this.speedlaneRightViewKey);
        if (rightView && !rightView.webContents.isDestroyed()) {
          const rightBounds = {
            x: GLASSMORPHISM_CONFIG.PADDING + leftViewWidth,
            y: chromeHeight + GLASSMORPHISM_CONFIG.PADDING,
            width: rightViewWidth,
            height: viewHeight,
          };
          if (rightBounds.width > 0 && rightBounds.height > 0) {
            rightView.setBounds(rightBounds);
            rightView.setVisible(true);
            this.visibleViews.add(this.speedlaneRightViewKey);

            // Ensure the view is added to the window
            if (
              this.window &&
              !this.window.contentView.children.includes(rightView)
            ) {
              this.window.contentView.addChildView(rightView);
              logger.debug(
                `🔧 Added right view to window for ${this.speedlaneRightViewKey}`,
              );
            }

            logger.debug(
              `🔧 Set right view bounds and visibility for ${this.speedlaneRightViewKey}`,
            );
          }
        } else {
          logger.warn(
            `🔧 Could not find right view for key: ${this.speedlaneRightViewKey}`,
          );
        }
      } else {
        logger.debug(`🔧 No speedlaneRightViewKey set yet`);
      }

      // Ensure overlay stays on top after setting up both views
      this.ensureOverlayOnTop();
    } else {
      // Normal mode - single webview takes full available width
      logger.debug(
        `🔧 Normal mode bounds: windowWidth=${windowWidth}, chatPanelWidth=${this.currentChatPanelWidth}, viewWidth=${availableWidth}`,
      );

      // Only update bounds for visible views
      for (const tabKey of this.visibleViews) {
        const view = this.browserViews.get(tabKey);
        if (view && !view.webContents.isDestroyed()) {
          const newBounds = {
            x: GLASSMORPHISM_CONFIG.PADDING,
            y: chromeHeight + GLASSMORPHISM_CONFIG.PADDING,
            width: availableWidth,
            height: viewHeight,
          };
          if (newBounds.width > 0 && newBounds.height > 0) {
            view.setBounds(newBounds);
          }
        }
      }
    }

    // No z-index management needed - using visibility control
    
    // End performance tracking
    mainProcessPerformanceMonitor.endBoundsUpdate(false);
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
  public destroy(): void {
    // Clean up overlay manager
    this.overlayManager.destroy();

    for (const [tabKey] of this.browserViews) {
      this.removeBrowserView(tabKey);
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

  // Set browser user agent
  view.webContents.setUserAgent(DEFAULT_USER_AGENT);

  // Use opaque white background to fix speedlane rendering issues
  // Transparent backgrounds can cause visibility problems when multiple views overlap
  view.setBackgroundColor("#FFFFFF");
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
