import { BrowserWindow, nativeTheme, shell } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { WINDOW_CONFIG } from "@vibe/shared-types";

import { TabManager } from "./tab-manager";
import { ViewManager } from "./view-manager";
import { OnboardingWindow } from "./onboarding-window";
import { SettingsWindow } from "./settings-window";
import { AboutWindow } from "./about-window";
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

  // Popup window instances
  private onboardingWindow: OnboardingWindow | null = null;
  private settingsWindow: SettingsWindow | null = null;
  private aboutWindow: AboutWindow | null = null;

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

  // === POPUP WINDOW MANAGEMENT ===

  /**
   * Opens the onboarding window
   */
  public openOnboardingWindow(): OnboardingWindow {
    if (this.onboardingWindow && !this.onboardingWindow.window.isDestroyed()) {
      this.onboardingWindow.show();
      return this.onboardingWindow;
    }

    this.onboardingWindow = new OnboardingWindow(this.window);

    this.onboardingWindow.on("destroy", () => {
      this.onboardingWindow = null;
    });

    // Forward window events to renderer
    this.onboardingWindow.on("opened", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-opened", {
          type: "onboarding",
          windowId: windowId,
        });
      }
    });

    this.onboardingWindow.on("closed", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-closed", {
          type: "onboarding",
          windowId: windowId,
        });
      }
    });

    return this.onboardingWindow;
  }

  /**
   * Opens the settings window
   */
  public openSettingsWindow(): SettingsWindow {
    if (this.settingsWindow && !this.settingsWindow.window.isDestroyed()) {
      this.settingsWindow.show();
      return this.settingsWindow;
    }

    this.settingsWindow = new SettingsWindow(this.window);

    this.settingsWindow.on("destroy", () => {
      this.settingsWindow = null;
    });

    // Forward window events to renderer
    this.settingsWindow.on("opened", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-opened", {
          type: "settings",
          windowId: windowId,
        });
      }
    });

    this.settingsWindow.on("closed", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-closed", {
          type: "settings",
          windowId: windowId,
        });
      }
    });

    return this.settingsWindow;
  }

  /**
   * Opens the about window
   */
  public openAboutWindow(): AboutWindow {
    if (this.aboutWindow && !this.aboutWindow.window.isDestroyed()) {
      this.aboutWindow.show();
      return this.aboutWindow;
    }

    this.aboutWindow = new AboutWindow(this.window);

    this.aboutWindow.on("destroy", () => {
      this.aboutWindow = null;
    });

    // Forward window events to renderer
    this.aboutWindow.on("opened", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-opened", {
          type: "about",
          windowId: windowId,
        });
      }
    });

    this.aboutWindow.on("closed", windowId => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("popup-window-closed", {
          type: "about",
          windowId: windowId,
        });
      }
    });

    return this.aboutWindow;
  }

  /**
   * Closes all popup windows
   */
  public closeAllPopupWindows(): void {
    if (this.onboardingWindow && !this.onboardingWindow.window.isDestroyed()) {
      this.onboardingWindow.close();
    }
    if (this.settingsWindow && !this.settingsWindow.window.isDestroyed()) {
      this.settingsWindow.close();
    }
    if (this.aboutWindow && !this.aboutWindow.window.isDestroyed()) {
      this.aboutWindow.close();
    }
  }

  /**
   * Gets the current popup window instances
   */
  public getPopupWindows(): {
    onboarding: OnboardingWindow | null;
    settings: SettingsWindow | null;
    about: AboutWindow | null;
  } {
    return {
      onboarding: this.onboardingWindow,
      settings: this.settingsWindow,
      about: this.aboutWindow,
    };
  }

  // === EXISTING METHODS ===

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
      const htmlPath = join(__dirname, "../renderer/index.html");
      logger.debug("🔧 ApplicationWindow: Loading HTML file:", htmlPath);
      this.window.loadFile(htmlPath);
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    // Close all popup windows first
    this.closeAllPopupWindows();

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
