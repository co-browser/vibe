import { BrowserWindow, WebContents, nativeTheme } from "electron";
import { ApplicationWindow } from "./application-window";
import { WINDOW_CONFIG } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("WindowManager");

/**
 * Manages browser windows for Vibe
 */
export class WindowManager {
  private browser: any;
  private windows: Map<number, ApplicationWindow> = new Map();
  private mainWindow: ApplicationWindow | null = null;

  constructor(browser: any) {
    this.browser = browser;
  }

  /**
   * Creates a new browser window
   */
  public async createWindow(): Promise<BrowserWindow> {
    const windowOptions = {
      minWidth: 800,
      minHeight: 400,
      width: 1280,
      height: 720,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      titleBarOverlay: {
        height: 30,
        symbolColor: nativeTheme.shouldUseDarkColors ? "white" : "black",
        color: "rgba(0,0,0,0)",
      },
      ...(process.platform === "darwin" && {
        trafficLightPosition: WINDOW_CONFIG.TRAFFIC_LIGHT_POSITION,
      }),
      backgroundColor: process.platform === "darwin" ? "#00000000" : "#000000",
      transparent: true,
      resizable: true,
      visualEffectState: "active",
      backgroundMaterial: "none",
      roundedCorners: true,
      vibrancy: process.platform === "darwin" ? "fullscreen-ui" : undefined,
      webPreferences: {
        preload: require.resolve("../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    };

    // Create ApplicationWindow instead of raw BrowserWindow
    const applicationWindow =
      this.browser.createApplicationWindow(windowOptions);
    this.windows.set(applicationWindow.id, applicationWindow);

    // Clean up window reference when closed
    applicationWindow.window.once("closed", () => {
      this.windows.delete(applicationWindow.id);
      if (this.mainWindow === applicationWindow) {
        this.mainWindow = null;
      }
    });

    // Set as main window if first window
    if (!this.mainWindow) {
      this.mainWindow = applicationWindow;
    }

    // Emit window-created event for multi-window awareness
    this.browser.emit("window-created", {
      windowId: applicationWindow.id,
      isMainWindow: this.mainWindow === applicationWindow,
    });

    // Auto-maximize for better UX
    applicationWindow.window.maximize();

    // ApplicationWindow handles event setup and renderer loading
    logger.debug(
      "🔧 WindowManager: Returning window with ID:",
      applicationWindow.window.id,
    );
    logger.debug(
      "🔧 WindowManager: ApplicationWindow ID:",
      applicationWindow.id,
    );

    return applicationWindow.window;
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
    return Array.from(this.windows.values())
      .filter(appWindow => {
        try {
          return (
            appWindow && appWindow.window && !appWindow.window.isDestroyed()
          );
        } catch {
          // Window is destroyed, filter it out
          return false;
        }
      })
      .map(appWindow => appWindow.window);
  }

  /**
   * Gets window by ID
   */
  public getWindowById(windowId: number): BrowserWindow | null {
    const appWindow = this.windows.get(windowId);
    return appWindow?.window || null;
  }

  public getWindowFromWebContents(
    webContents: WebContents,
  ): BrowserWindow | null {
    for (const appWindow of this.windows.values()) {
      if (appWindow.window.webContents === webContents) {
        return appWindow.window;
      }
    }
    return null;
  }

  /**
   * Destroys all windows
   */
  public destroy(): void {
    for (const appWindow of this.windows.values()) {
      if (!appWindow.window.isDestroyed()) {
        appWindow.destroy();
      }
    }
    this.windows.clear();
    this.mainWindow = null;
  }
}
