import { WebContentsView, BrowserWindow } from "electron";
import {
  BROWSER_CHROME,
  GLASSMORPHISM_CONFIG,
  CHAT_PANEL,
} from "@vibe/shared-types";

/**
 * Simplified View Management
 *
 * Handles WebContentsView creation, bounds management, and visibility control.
 * Simplified from the original ViewManager by removing complex state management
 * and focusing on core view operations.
 */
export class ViewManager {
  private window: BrowserWindow;
  private views: Map<string, WebContentsView> = new Map();
  private visibleViews: Set<string> = new Set();
  private isChatPanelVisible: boolean = false;

  constructor(window: BrowserWindow) {
    this.window = window;
  }

  /**
   * Creates a WebContentsView for a tab
   */
  public createView(tabKey: string): WebContentsView {
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
    view.setVisible(false);

    this.views.set(tabKey, view);
    this.window.contentView.addChildView(view);

    return view;
  }

  /**
   * Removes a view
   */
  public removeView(tabKey: string): void {
    const view = this.views.get(tabKey);
    if (!view) return;

    if (!view.webContents.isDestroyed()) {
      this.window.contentView.removeChildView(view);
      view.webContents.removeAllListeners();
      view.webContents.close();
    }

    this.views.delete(tabKey);
    this.visibleViews.delete(tabKey);
  }

  /**
   * Gets a view by tab key
   */
  public getView(tabKey: string): WebContentsView | null {
    return this.views.get(tabKey) || null;
  }

  /**
   * Sets view visibility
   */
  public setViewVisible(tabKey: string, visible: boolean): void {
    const view = this.views.get(tabKey);
    if (!view) return;

    if (visible) {
      if (!this.visibleViews.has(tabKey)) {
        view.setVisible(true);
        this.visibleViews.add(tabKey);
        this.updateViewBounds(tabKey);
      }
    } else {
      if (this.visibleViews.has(tabKey)) {
        view.setVisible(false);
        this.visibleViews.delete(tabKey);
      }
    }
  }

  /**
   * Updates bounds for a specific view
   */
  public updateViewBounds(tabKey: string): void {
    const view = this.views.get(tabKey);
    if (!view || !this.visibleViews.has(tabKey)) return;

    const [windowWidth, windowHeight] = this.window.getContentSize();
    const chromeHeight = BROWSER_CHROME.TOTAL_CHROME_HEIGHT;

    let viewWidth = windowWidth - GLASSMORPHISM_CONFIG.PADDING * 2;
    if (this.isChatPanelVisible) {
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
   * Updates bounds for all visible views
   */
  public updateAllViewBounds(): void {
    for (const tabKey of this.visibleViews) {
      this.updateViewBounds(tabKey);
    }
  }

  /**
   * Toggles chat panel visibility
   */
  public toggleChatPanel(isVisible?: boolean): void {
    this.isChatPanelVisible =
      isVisible !== undefined ? isVisible : !this.isChatPanelVisible;
    this.updateAllViewBounds();
  }

  /**
   * Gets chat panel visibility state
   */
  public isChatVisible(): boolean {
    return this.isChatPanelVisible;
  }

  /**
   * Gets all visible view keys
   */
  public getVisibleViews(): string[] {
    return Array.from(this.visibleViews);
  }

  /**
   * Checks if a view is visible
   */
  public isViewVisible(tabKey: string): boolean {
    return this.visibleViews.has(tabKey);
  }

  /**
   * Destroys the view manager and cleans up all views
   */
  public destroy(): void {
    for (const [tabKey] of this.views) {
      this.removeView(tabKey);
    }
    this.views.clear();
    this.visibleViews.clear();
  }
}
