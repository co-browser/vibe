import { BrowserWindow, WebContents, app, session } from "electron";
import { EventEmitter } from "events";

import { WindowManager } from "@/browser/window-manager";
import { ApplicationWindow } from "@/browser/application-window";
import { CDPManager } from "../services/cdp-service";
import { setupApplicationMenu } from "@/menu";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("Browser");

/**
 * Main Browser controller
 *
 * Coordinates window, tab, and view management
 * Provides unified API for browser operations
 */
export class Browser extends EventEmitter {
  private windowManager: any = null;
  private cdpManager!: CDPManager;
  private _isDestroyed: boolean = false;

  // ApplicationWindow management
  private applicationWindows: Map<number, ApplicationWindow> = new Map();

  constructor() {
    super();
    this.initializeManagers();
    this.setupMenu();
  }

  private initializeManagers(): void {
    this.windowManager = new WindowManager(this);
    this.cdpManager = new CDPManager();

    // Set up Content Security Policy
    this.setupContentSecurityPolicy();
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
        ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:8000 ws://127.0.0.1:8000 https://analytics.cobrowser.xyz https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https:; object-src 'none'; frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com; worker-src 'self';"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https: blob:; connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000 https://analytics.cobrowser.xyz https://auth.privy.io wss://relay.walletconnect.com wss://relay.walletconnect.org wss://www.walletlink.org https://*.rpc.privy.systems https://explorer-api.walletconnect.com https:; object-src 'none'; frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com; worker-src 'self';";

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
   */
  public async createWindow(): Promise<BrowserWindow> {
    await app.whenReady();
    const window = await this.windowManager.createWindow();

    // Create initial tab for the new window (use webContents ID for lookup)
    const appWindow = this.getApplicationWindow(window.webContents.id);

    if (appWindow) {
      appWindow.tabManager.createTab("https://www.google.com");
    } else {
      logger.error(
        "❌ Failed to find ApplicationWindow for webContents ID:",
        window.webContents.id,
      );
    }

    return window;
  }

  /**
   * Gets the main window
   */
  public getMainWindow(): BrowserWindow | null {
    return this.windowManager?.getMainWindow() || null;
  }

  /**
   * Gets all windows
   */
  public getAllWindows(): BrowserWindow[] {
    return this.windowManager?.getAllWindows() || [];
  }

  /**
   * Gets window by ID
   */
  public getWindowById(windowId: number): BrowserWindow | null {
    return this.windowManager?.getWindowById(windowId) || null;
  }

  /**
   * Gets window from web contents
   */
  public getWindowFromWebContents(
    webContents: WebContents,
  ): BrowserWindow | null {
    return this.windowManager?.getWindowFromWebContents(webContents) || null;
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
  public async destroy(): Promise<void> {
    if (this._isDestroyed) return;

    logger.debug("🧹 Browser: Starting cleanup process...");
    this._isDestroyed = true;

    // Clean up all ApplicationWindows
    logger.debug(
      "🧹 Browser: Destroying",
      this.applicationWindows.size,
      "ApplicationWindows",
    );
    for (const [webContentsId, appWindow] of this.applicationWindows) {
      try {
        logger.debug("🧹 Browser: Destroying ApplicationWindow", webContentsId);
        await appWindow.destroy();
      } catch (error) {
        logger.warn("Error destroying ApplicationWindow:", error);
      }
    }
    this.applicationWindows.clear();

    // Clean up WindowManager
    if (this.windowManager) {
      logger.debug("🧹 Browser: Destroying WindowManager");
      try {
        this.windowManager.destroy();
      } catch (error) {
        logger.warn("Error destroying WindowManager:", error);
      }
      this.windowManager = null;
    }

    // Clean up CDPManager
    if (this.cdpManager) {
      logger.debug("🧹 Browser: Cleaning up CDPManager");
      // CDPManager cleanup will happen when the process exits
    }

    this.emit("destroy");
    this.removeAllListeners();

    logger.debug("🧹 Browser: Cleanup complete");
  }
}
