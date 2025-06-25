import { BrowserWindow, nativeTheme, shell } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { WINDOW_CONFIG } from "@vibe/shared-types";

import { TabManager } from "./tab-manager";
import { ViewManager } from "./view-manager";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ApplicationWindow");
import type { CDPManager } from "../services/cdp-service";

/**
 * ApplicationWindow - Simple window wrapper that contains per-window managers
 */
export class ApplicationWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  public readonly tabManager: TabManager;
  public readonly viewManager: ViewManager;

  constructor(
    browser: any,
    options?: Electron.BrowserWindowConstructorOptions,
    cdpManager?: CDPManager,
  ) {
    super();

    // Create window with options
    this.window = new BrowserWindow(options || this.getDefaultOptions());
    this.id = this.window.id;

    // Create window-specific managers (ViewManager first, then TabManager)
    this.viewManager = new ViewManager(browser, this.window);
    this.tabManager = new TabManager(browser, this.viewManager, cdpManager);

    // Set up tab event forwarding for this window
    this.setupTabEventForwarding();

    // Simple lifecycle management
    this.setupEvents();
    this.loadRenderer().catch(error => {
      logger.error("🔧 ApplicationWindow: Failed to load renderer:", error);
    });
  }

  private getDefaultOptions(): Electron.BrowserWindowConstructorOptions {
    return {
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
      frame: false,
      transparent: true,
      resizable: true,
      visualEffectState: "active",
      backgroundMaterial: "none",
      roundedCorners: true,
      vibrancy: process.platform === "darwin" ? "fullscreen-ui" : undefined,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    };
  }

  private setupEvents(): void {
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
    });

    this.window.on("closed", () => {
      this.destroy();
    });

    this.window.on("resize", () => {
      this.viewManager.updateBounds();
    });

    this.window.webContents.setWindowOpenHandler(details => {
      shell.openExternal(details.url);
      return { action: "deny" };
    });
  }

  private setupTabEventForwarding(): void {
    // Forward tab events from this window's TabManager to this window's renderer
    this.tabManager.on("tab-created", tabKey => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-created", tabKey);
      }
    });

    this.tabManager.on("tab-updated", tabState => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("update-tab-state", tabState);
      }
    });

    this.tabManager.on("tab-switched", switchData => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-switched", switchData);
      }
    });

    this.tabManager.on("tab-closed", tabKey => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-closed", tabKey);
      }
    });

    this.tabManager.on("tabs-reordered", tabs => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("browser-tabs-reordered", tabs);
      }
    });
  }

  private async loadRenderer(): Promise<void> {
    logger.debug("🔧 ApplicationWindow: Loading renderer...");
    logger.debug("🔧 ApplicationWindow: is.dev =", is.dev);
    logger.debug(
      "🔧 ApplicationWindow: ELECTRON_RENDERER_URL =",
      process.env["ELECTRON_RENDERER_URL"],
    );

    if (is.dev) {
      // In development, try to load from the Vite dev server
      const devUrl =
        process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
      logger.debug("🔧 ApplicationWindow: Loading dev URL:", devUrl);

      // Wait a bit for the dev server to be ready
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          logger.debug(
            `🔧 ApplicationWindow: Attempt ${attempts + 1}/${maxAttempts} to load ${devUrl}`,
          );
          await this.window.loadURL(devUrl);
          logger.debug("🔧 ApplicationWindow: Successfully loaded dev URL");
          break;
        } catch (error) {
          attempts++;
          logger.debug(
            `🔧 ApplicationWindow: Failed to load (attempt ${attempts}):`,
            error,
          );

          if (attempts < maxAttempts) {
            logger.debug(
              "🔧 ApplicationWindow: Waiting 1 second before retry...",
            );
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.error(
              "🔧 ApplicationWindow: Failed to load dev server after all attempts",
            );
            // Fallback to file loading
            const htmlPath = join(__dirname, "../renderer/index.html");
            logger.debug(
              "🔧 ApplicationWindow: Falling back to HTML file:",
              htmlPath,
            );
            this.window.loadFile(htmlPath);
          }
        }
      }
    } else {
      // Use custom protocol for production to enable secure context
      logger.debug("🔧 ApplicationWindow: Loading with vibe:// protocol");
      this.window.loadURL("vibe://localhost/index.html");
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    try {
      // Clean up TabManager (includes EventEmitter cleanup and intervals)
      this.tabManager.destroy();
    } catch (error) {
      logger.warn("Error destroying TabManager:", error);
    }

    try {
      // Clean up ViewManager
      this.viewManager.destroy();
    } catch (error) {
      logger.warn("Error destroying ViewManager:", error);
    }

    this.emit("destroy");
    this.removeAllListeners();

    if (!this.window.isDestroyed()) {
      this.window.removeAllListeners();
      this.window.close();
    }
  }
}
