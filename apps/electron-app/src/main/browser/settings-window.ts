import { BrowserWindow, nativeTheme } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("SettingsWindow");

/**
 * SettingsWindow - Popup window for application settings
 * Child window of ApplicationWindow
 */
export class SettingsWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  private parentWindow: BrowserWindow;

  constructor(parentWindow: BrowserWindow) {
    super();

    this.parentWindow = parentWindow;

    // Create popup window as child of parent
    this.window = new BrowserWindow(this.getWindowOptions());
    this.id = this.window.id;

    this.setupEvents();
    this.loadRenderer().catch(error => {
      logger.error("Failed to load settings renderer:", error);
    });
  }

  private getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      // Remove parent and modal to make window independent
      width: 900,
      height: 700,
      minWidth: 700,
      minHeight: 500,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      titleBarOverlay: {
        height: 30,
        symbolColor: nativeTheme.shouldUseDarkColors ? "white" : "black",
        color: "rgba(0,0,0,0)",
      },
      backgroundColor: process.platform === "darwin" ? "#00000000" : "#000000",
      frame: false,
      transparent: true,
      resizable: true,
      movable: true, // Explicitly enable dragging
      minimizable: true, // Allow independent minimizing
      maximizable: true, // Allow independent maximizing
      closable: true, // Allow independent closing
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
        additionalArguments: ["--window-type=settings"],
      },
    };
  }
  private setupEvents(): void {
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
      // Position relative to parent but don't center exactly
      this.positionRelativeToParent();

      // Emit window opened event
      this.emit("opened", this.id);
    });

    this.window.on("closed", () => {
      // Emit window closed event before destroying
      this.emit("closed", this.id);
      this.destroy();
    });

    // Handle escape key to close
    this.window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        event.preventDefault(); // Prevent the event from bubbling up
        this.close();
      }
    });

    // Handle Cmd/Ctrl+W to close
    this.window.webContents.on("before-input-event", (event, input) => {
      if ((input.control || input.meta) && input.key === "w") {
        event.preventDefault(); // Prevent the event from bubbling up
        this.close();
      }
    });

    // Prevent the window from being hidden when parent is minimized
    this.window.on("minimize", () => {
      // Allow the settings window to minimize independently
      logger.debug("Settings window minimized independently");
    });

    // Handle parent window events
    this.parentWindow.on("closed", () => {
      // Close settings window when parent is closed
      this.close();
    });
  }

  private positionRelativeToParent(): void {
    if (this.parentWindow.isDestroyed()) return;

    try {
      const parentBounds = this.parentWindow.getBounds();

      // Position the settings window offset from the parent
      const x = parentBounds.x + 50;
      const y = parentBounds.y + 50;

      this.window.setPosition(x, y);
    } catch (error) {
      logger.warn(
        "Could not position settings window relative to parent:",
        error,
      );
      // Fallback to center on screen
      this.window.center();
    }
  }

  private async loadRenderer(): Promise<void> {
    logger.debug("Loading settings renderer...");

    if (is.dev) {
      // In development, load from Vite dev server with settings route
      const devUrl =
        process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
      const settingsUrl = `${devUrl}#/settings`;

      try {
        await this.window.loadURL(settingsUrl);
        logger.debug("Successfully loaded settings dev URL");
      } catch (error) {
        logger.error("Failed to load settings dev URL:", error);
        // Fallback to file loading
        const htmlPath = join(__dirname, "../renderer/index.html");
        await this.window.loadFile(htmlPath, { hash: "settings" });
      }
    } else {
      const htmlPath = join(__dirname, "../renderer/index.html");
      await this.window.loadFile(htmlPath, { hash: "settings" });
    }
  }

  public close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    this.emit("destroy");
    this.removeAllListeners();

    if (!this.window.isDestroyed()) {
      this.window.removeAllListeners();
      this.window.close();
    }
  }

  public show(): void {
    if (!this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
    }
  }

  public hide(): void {
    if (!this.window.isDestroyed()) {
      this.window.hide();
    }
  }

  public toggle(): void {
    if (!this.window.isDestroyed()) {
      if (this.window.isVisible()) {
        this.hide();
      } else {
        this.show();
      }
    }
  }
}
