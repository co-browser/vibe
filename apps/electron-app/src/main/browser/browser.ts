import { BrowserWindow, WebContents, app, session } from "electron";
import { EventEmitter } from "events";

import { ApplicationWindow } from "@/browser/application-window";
import { CDPManager } from "../services/cdp-service";
import { setupApplicationMenu } from "@/menu";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("Browser");

/**
 * Simplified Browser controller
 *
 * Coordinates window, tab, and view management
 * Simplified from original 5-layer architecture (Browser → ApplicationWindow → WindowManager → TabManager → ViewManager)
 * to 3-layer architecture (Browser → Window → View)
 */
export class Browser extends EventEmitter {
  private cdpManager!: CDPManager;
  private _isDestroyed: boolean = false;

  // ApplicationWindow management (maps webContents.id → ApplicationWindow for IPC routing)
  private applicationWindows: Map<number, ApplicationWindow> = new Map();
  private mainWindow: ApplicationWindow | null = null;

  constructor() {
    super();
    this.initializeServices();
    this.setupMenu();
    this.setupContentSecurityPolicy();
  }

  private initializeServices(): void {
    this.cdpManager = new CDPManager();
  }

  /**
   * Sets up the application menu for this browser instance
   * Menu items check current state when clicked rather than rebuilding on every change
   */
  private setupMenu(): void {
    setupApplicationMenu(this);
    logger.debug("[Browser] Application menu initialized (static structure)");
  }

  /**
   * Sets up Content Security Policy for the application
   */
  private setupContentSecurityPolicy(): void {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      // Allow Vite dev server in development
      const isDev = process.env.NODE_ENV === "development";
      const cspPolicy = isDev
        ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:5173 ws://localhost:5173 http://127.0.0.1:8000 ws://127.0.0.1:8000 https:; object-src 'none';"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000 https:;";

      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [cspPolicy],
        },
      });
    });
  }

  /**
   * Creates a new ApplicationWindow
   */
  public createApplicationWindow(
    options?: Electron.BrowserWindowConstructorOptions,
  ): ApplicationWindow {
    const appWindow = new ApplicationWindow(this, options, this.cdpManager);

    // Map by webContents ID for IPC routing (event.sender.id is webContents.id)
    this.applicationWindows.set(appWindow.window.webContents.id, appWindow);

    // Listen for destroy event to clean up
    appWindow.once("destroy", () => {
      this.destroyWindowById(appWindow.window.webContents.id);
      // Clear main window reference if this was the main window
      if (this.mainWindow === appWindow) {
        const remainingWindows = Array.from(this.applicationWindows.values());
        this.mainWindow = remainingWindows.length > 0 ? remainingWindows[0] : null;
      }
    });

    return appWindow;
  }

  /**
   * Gets ApplicationWindow by webContents ID (key method for IPC routing)
   * Note: Uses webContents.id because event.sender.id is webContents.id, not window.id
   */
  public getApplicationWindow(webContentsId: number): ApplicationWindow | null {
    return this.applicationWindows.get(webContentsId) || null;
  }

  /**
   * Gets the main ApplicationWindow (first created window)
   */
  public getMainApplicationWindow(): ApplicationWindow | null {
    const firstWindow = this.applicationWindows.values().next().value;
    return firstWindow || null;
  }

  /**
   * Destroys ApplicationWindow by webContents ID
   */
  public destroyWindowById(webContentsId: number): void {
    const appWindow = this.applicationWindows.get(webContentsId);
    if (appWindow) {
      this.applicationWindows.delete(webContentsId);
    }
  }

  /**
   * Creates a new browser window with initial tab
   * Simplified from WindowManager delegation to direct creation
   */
  public async createWindow(): Promise<BrowserWindow> {
    await app.whenReady();
    
    // Create ApplicationWindow directly (no WindowManager layer)
    const appWindow = this.createApplicationWindow();
    
    // Set as main window if first window
    if (!this.mainWindow) {
      this.mainWindow = appWindow;
    }

    // Create initial tab
    appWindow.tabManager.createTab("https://www.google.com");

    return appWindow.window;
  }

  /**
   * Gets the main window
   */
  public getMainWindow(): BrowserWindow | null {
    return this.mainWindow?.window || null;
  }

  /**
   * Gets all windows
   */
  public getAllWindows(): BrowserWindow[] {
    return Array.from(this.applicationWindows.values()).map(appWindow => appWindow.window);
  }

  /**
   * Gets window by ID
   */
  public getWindowById(windowId: number): BrowserWindow | null {
    const appWindows = Array.from(this.applicationWindows.values());
    for (const appWindow of appWindows) {
      if (appWindow.window.id === windowId) {
        return appWindow.window;
      }
    }
    return null;
  }

  /**
   * Gets window from web contents
   */
  public getWindowFromWebContents(webContents: WebContents): BrowserWindow | null {
    const appWindows = Array.from(this.applicationWindows.values());
    for (const appWindow of appWindows) {
      if (appWindow.window.webContents === webContents) {
        return appWindow.window;
      }
    }
    return null;
  }

  /**
   * Gets the CDP manager instance
   */
  public getCDPManager(): CDPManager {
    return this.cdpManager;
  }

  /**
   * Checks if browser is destroyed
   */
  public isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * Destroys the browser and cleans up resources
   */
  public destroy(): void {
    if (this._isDestroyed) return;

    logger.debug("Starting browser cleanup process...");
    this._isDestroyed = true;

    // Clean up all ApplicationWindows
    logger.debug("Destroying", this.applicationWindows.size, "ApplicationWindows");
    const appWindowsArray = Array.from(this.applicationWindows.entries());
    for (const [webContentsId, appWindow] of appWindowsArray) {
      try {
        logger.debug("Destroying ApplicationWindow", webContentsId);
        appWindow.destroy();
      } catch (error) {
        logger.warn("Error destroying ApplicationWindow:", error);
      }
    }
    this.applicationWindows.clear();
    this.mainWindow = null;

    // Clean up CDPManager
    if (this.cdpManager) {
      logger.debug("Cleaning up CDPManager");
      // CDPManager cleanup will happen when the process exits
    }

    this.emit("destroy");
    this.removeAllListeners();

    logger.debug("Browser cleanup complete");
  }
}
