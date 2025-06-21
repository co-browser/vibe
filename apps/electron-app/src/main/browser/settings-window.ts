import { BrowserWindow, nativeTheme, ipcMain } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";
import { getProfileService } from "../services/profile-service";

const logger = createLogger("SettingsWindow");

/**
 * SettingsWindow - Popup window for application settings
 * Child window of ApplicationWindow
 */
export class SettingsWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  private parentWindow: BrowserWindow;
  private profileService = getProfileService();

  // Static flag to track if IPC handlers are already registered
  private static ipcHandlersRegistered = false;

  constructor(parentWindow: BrowserWindow) {
    super();

    this.parentWindow = parentWindow;

    // Create popup window as child of parent
    this.window = new BrowserWindow(this.getWindowOptions());
    this.id = this.window.id;

    this.setupEvents();
    this.setupIpcHandlers();
    this.loadRenderer().catch(error => {
      logger.error("Failed to load settings renderer:", error);
    });
  }

  /**
   * Static method to clean up all settings IPC handlers
   * Should be called when the application is shutting down
   */
  public static cleanupAllHandlers(): void {
    try {
      const handlers = [
        "settings:get-profile",
        "settings:update-profile",
        "settings:get-custom-data",
        "settings:set-custom-data",
        "settings:close",
      ];

      for (const handler of handlers) {
        ipcMain.removeHandler(handler);
      }

      SettingsWindow.ipcHandlersRegistered = false;
      logger.debug("All settings IPC handlers cleaned up");
    } catch (error) {
      logger.error("Failed to cleanup all settings IPC handlers:", error);
    }
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
      titleBarStyle:
        process.platform === "darwin" ? "customButtonsOnHover" : undefined,
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
      minimizable: true, // Allow ././independent minimizing
      maximizable: true, // Allow independent maximizing
      closable: true, // Allow independent closing
      visualEffectState: "active",
      backgroundMaterial: "none",
      roundedCorners: true,
      vibrancy: process.platform === "darwin" ? "sidebar" : undefined,
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

    // Handle keyboard shortcuts to close (Escape and Cmd/Ctrl+W)
    this.window.webContents.on("before-input-event", (event, input) => {
      if (
        input.key === "Escape" ||
        ((input.control || input.meta) && input.key === "w")
      ) {
        event.preventDefault(); // Prevent the event from bubbling up
        this.close();
      }
    });

    // Also handle keydown events to ensure escape is caught
    this.window.webContents.on("dom-ready", () => {
      this.window.webContents.executeJavaScript(`
        document.addEventListener('keydown', (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            window.electronAPI.invoke('settings:close');
            return false;
          }
        }, true);
      `);
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

  private setupIpcHandlers(): void {
    // Only register handlers if they haven't been registered yet
    if (SettingsWindow.ipcHandlersRegistered) {
      logger.debug("Settings IPC handlers already registered, skipping");
      return;
    }

    try {
      // Check if handlers already exist (in case of incomplete cleanup)
      const existingHandlers = [
        "settings:get-profile",
        "settings:update-profile",
        "settings:get-custom-data",
        "settings:set-custom-data",
        "settings:close",
      ];

      for (const handler of existingHandlers) {
        if (ipcMain.listenerCount(handler) > 0) {
          logger.warn(
            `Handler ${handler} already exists, removing before re-registering`,
          );
          ipcMain.removeHandler(handler);
        }
      }

      // Handle getting current profile settings
      ipcMain.handle("settings:get-profile", async () => {
        try {
          const currentProfile = this.profileService.getCurrentProfile();
          if (!currentProfile) {
            return { success: false, error: "No active profile found" };
          }
          return { success: true, profile: currentProfile };
        } catch (error) {
          logger.error("Failed to get current profile:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      // Handle updating profile settings
      ipcMain.handle("settings:update-profile", async (_event, updates) => {
        try {
          const currentProfile = this.profileService.getCurrentProfile();
          if (!currentProfile) {
            return { success: false, error: "No active profile found" };
          }

          const updatedProfile = await this.profileService.updateProfile(
            currentProfile.id,
            updates,
          );

          return { success: true, profile: updatedProfile };
        } catch (error) {
          logger.error("Failed to update profile:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      // Handle getting profile custom data
      ipcMain.handle("settings:get-custom-data", async (_event, key) => {
        try {
          const currentProfile = this.profileService.getCurrentProfile();
          if (!currentProfile) {
            return { success: false, error: "No active profile found" };
          }

          const data = this.profileService.getCustomData(
            currentProfile.id,
            key,
          );
          return { success: true, data };
        } catch (error) {
          logger.error("Failed to get custom data:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      // Handle setting profile custom data
      ipcMain.handle("settings:set-custom-data", async (_event, key, value) => {
        try {
          const currentProfile = this.profileService.getCurrentProfile();
          if (!currentProfile) {
            return { success: false, error: "No active profile found" };
          }

          await this.profileService.setCustomData(
            currentProfile.id,
            key,
            value,
          );
          return { success: true };
        } catch (error) {
          logger.error("Failed to set custom data:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      // Handle closing the settings window
      ipcMain.handle("settings:close", async () => {
        this.close();
        return { success: true };
      });

      SettingsWindow.ipcHandlersRegistered = true;
      logger.debug("Settings IPC handlers registered successfully");
    } catch (error) {
      logger.error("Failed to register settings IPC handlers:", error);
      // If registration fails, try to clean up any partial registrations
      this.cleanupIpcHandlers();
      throw error;
    }
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
      try {
        await this.window.loadFile(htmlPath, { hash: "settings" });
        logger.debug("Successfully loaded settings file");
      } catch (error) {
        logger.error("Failed to load settings file:", error);
        throw error;
      }
    }
  }

  public close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    // Clean up IPC handlers
    this.cleanupIpcHandlers();

    this.emit("destroy");
    this.removeAllListeners();
    this.window.removeAllListeners();
    this.window.close();
  }

  private cleanupIpcHandlers(): void {
    try {
      ipcMain.removeHandler("settings:get-profile");
      ipcMain.removeHandler("settings:update-profile");
      ipcMain.removeHandler("settings:get-custom-data");
      ipcMain.removeHandler("settings:set-custom-data");
      ipcMain.removeHandler("settings:close");

      SettingsWindow.ipcHandlersRegistered = false;
      logger.debug("Settings IPC handlers cleaned up successfully");
    } catch (error) {
      logger.error("Failed to cleanup settings IPC handlers:", error);
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
