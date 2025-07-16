import { ipcMain, app, BrowserWindow } from "electron";
import { getAppUpdater } from "../../services";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("IPC:Update");

/**
 * Register update-related IPC handlers
 */
export function registerUpdateHandlers(): void {
  // Check for updates
  ipcMain.handle("app:check-for-update", async () => {
    try {
      logger.info("Checking for updates");
      const updater = getAppUpdater();
      if (!updater) {
        logger.warn("AppUpdater not initialized");
        return {
          currentVersion: app.getVersion(),
          updateInfo: null,
        };
      }
      return await updater.checkForUpdates();
    } catch (error) {
      logger.error("Failed to check for updates:", error);
      throw error;
    }
  });

  // Show update dialog
  ipcMain.handle("app:show-update-dialog", async _event => {
    try {
      const updater = getAppUpdater();
      if (!updater) {
        logger.warn("AppUpdater not initialized");
        return;
      }

      // Get the focused window
      const win = BrowserWindow.getFocusedWindow();
      if (!win) {
        logger.warn("No window available for update dialog");
        return;
      }

      return await updater.showUpdateDialog(win);
    } catch (error) {
      logger.error("Failed to show update dialog:", error);
      throw error;
    }
  });
}

/**
 * Forward update events to all windows
 */
/**
 * Forward update events from auto-updater to all renderer processes
 * This ensures all windows receive update notifications
 */
export function setupUpdateEventForwarding(): void {
  const updater = getAppUpdater();
  if (!updater) {
    logger.warn("AppUpdater not initialized for event forwarding");
    return;
  }

  // Forward all update events to renderer processes
  const events = [
    "checking-for-update",
    "update-available",
    "update-not-available",
    "download-progress",
    "update-downloaded",
    "error",
  ];

  events.forEach(eventName => {
    updater.autoUpdater.on(eventName as any, (...args: any[]) => {
      logger.debug(`Update event: ${eventName}`, args);

      // Send to all windows
      const windows = BrowserWindow.getAllWindows();
      windows.forEach(window => {
        if (!window.isDestroyed()) {
          try {
            window.webContents.send(`update-${eventName}`, ...args);
          } catch (error) {
            logger.error(`Failed to send update event to window: ${error}`);
          }
        }
      });
    });
  });
}
