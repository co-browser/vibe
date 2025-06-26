import { BrowserWindow } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("OnboardingWindow");

// Define interface for browser data
export interface DetectedBrowser {
  name: string;
  path: string;
  default?: boolean;
}

/**
 * OnboardingWindow - Popup window for first-time setup
 * Child window of ApplicationWindow
 */
export class OnboardingWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  private parentWindow: BrowserWindow;
  private detectedBrowsers: DetectedBrowser[];
  private static activeWindows = new Map<number, OnboardingWindow>();

  constructor(
    parentWindow: BrowserWindow,
    detectedBrowsers?: DetectedBrowser[],
  ) {
    super();

    logger.info("Creating OnboardingWindow...");
    logger.info("Parent window exists:", !!parentWindow);
    logger.info("Detected browsers:", detectedBrowsers?.length || 0);

    this.parentWindow = parentWindow;
    this.detectedBrowsers = detectedBrowsers || [];

    // Create popup window as child of parent
    const windowOptions = this.getWindowOptions();
    logger.info("Window options:", {
      width: windowOptions.width,
      height: windowOptions.height,
      transparent: windowOptions.transparent,
    });

    this.window = new BrowserWindow(windowOptions);
    this.id = this.window.id;
    logger.info("Window created with ID:", this.id);

    // Track active window
    OnboardingWindow.activeWindows.set(this.id, this);

    this.setupEvents();
    this.loadRenderer().catch(error => {
      logger.error("Failed to load onboarding renderer:", error);
    });
  }

  private getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      parent: this.parentWindow,
      modal: true,
      width: 900,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: "hidden",
      trafficLightPosition: { x: 20, y: 20 },
      backgroundColor: "#00000000",
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      hasShadow: true,
      visualEffectState: "active",
      vibrancy: "under-window",
      roundedCorners: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
        additionalArguments: [
          "--window-type=onboarding",
          `--detected-browsers=${JSON.stringify(this.detectedBrowsers)}`,
        ],
      },
    };
  }

  private setupEvents(): void {
    logger.info("Setting up onboarding window events...");

    this.window.once("ready-to-show", () => {
      logger.info("Onboarding window ready to show");
      this.window.show();
      this.window.focus();
      this.window.center();
      logger.info("Onboarding window should now be visible");

      // Send detected browsers to renderer
      this.window.webContents.send("detected-browsers", this.detectedBrowsers);

      // Emit window opened event
      this.emit("opened", this.id);
    });

    this.window.on("closed", () => {
      // Remove from active windows
      OnboardingWindow.activeWindows.delete(this.id);

      // Emit window closed event
      this.emit("closed", this.id);

      // Focus parent window
      if (!this.parentWindow.isDestroyed()) {
        this.parentWindow.focus();
      }
    });

    // Handle escape key to close
    this.window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        event.preventDefault();
        this.close();
      }
    });

    // Close when parent is closed
    this.parentWindow.on("closed", () => {
      this.close();
    });
  }

  private async loadRenderer(): Promise<void> {
    const rendererPath = is.dev
      ? "http://localhost:5173#onboarding"
      : join(__dirname, "../renderer/index.html#onboarding");

    logger.info("Loading renderer from:", rendererPath);

    try {
      await this.window.loadURL(rendererPath);
      logger.info("Renderer loaded successfully");
    } catch (error) {
      logger.error("Failed to load renderer URL:", error);
      throw error;
    }

    // Open devtools in development
    if (is.dev && !this.window.webContents.isDevToolsOpened()) {
      this.window.webContents.openDevTools({ mode: "detach" });
    }
  }

  public async show(): Promise<void> {
    if (!this.window.isDestroyed() && !this.window.isVisible()) {
      this.window.show();
      this.window.focus();
    }
  }

  public close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public focus(): void {
    if (!this.window.isDestroyed()) {
      this.window.focus();
    }
  }
}
