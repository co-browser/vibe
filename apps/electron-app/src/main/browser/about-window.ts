import { BrowserWindow, nativeTheme } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("AboutWindow");

/**
 * AboutWindow - Popup window for application information
 * Child window of ApplicationWindow
 */
export class AboutWindow extends EventEmitter {
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
      logger.error("Failed to load about renderer:", error);
    });
  }

  private getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      // Remove parent and modal to make window independent
      width: 600,
      height: 500,
      minWidth: 500,
      minHeight: 400,
      maxWidth: 800,
      maxHeight: 700,
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
        additionalArguments: ['--window-type=about']
      },
    };
  }

  private setupEvents(): void {
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
      // Position relative to parent
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

    // Handle Enter key to close (common for about dialogs)
    this.window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Enter" || input.key === "Return") {
        event.preventDefault(); // Prevent the event from bubbling up
        this.close();
      }
    });

    // Handle parent window events
    this.parentWindow.on("closed", () => {
      // Close about window when parent is closed
      this.close();
    });
  }

  private positionRelativeToParent(): void {
    if (this.parentWindow.isDestroyed()) return;

    try {
      const parentBounds = this.parentWindow.getBounds();
      
      // Position the about window offset from the parent
      const x = parentBounds.x + 100;
      const y = parentBounds.y + 100;
      
      this.window.setPosition(x, y);
    } catch (error) {
      logger.warn("Could not position about window relative to parent:", error);
      // Fallback to center on screen
      this.window.center();
    }
  }

  private async loadRenderer(): Promise<void> {
    logger.debug("Loading about renderer...");

    if (is.dev) {
      // In development, load from Vite dev server with about route
      const devUrl = process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
      const aboutUrl = `${devUrl}#/about`;
      
      try {
        await this.window.loadURL(aboutUrl);
        logger.debug("Successfully loaded about dev URL");
      } catch (error) {
        logger.error("Failed to load about dev URL:", error);
        // Fallback to file loading
        const htmlPath = join(__dirname, "../renderer/index.html");
        await this.window.loadFile(htmlPath, { hash: 'about' });
      }
    } else {
      const htmlPath = join(__dirname, "../renderer/index.html");
      await this.window.loadFile(htmlPath, { hash: 'about' });
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
}