import { ipcMain, BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("WindowInterface");

/**
 * Window interface IPC handlers
 */

ipcMain.handle("window:get-id", event => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.id || null;
  } catch (error) {
    logger.error("Failed to get window ID:", error);
    return null;
  }
});

ipcMain.handle("window:get-bounds", event => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.getBounds() || null;
  } catch (error) {
    logger.error("Failed to get window bounds:", error);
    return null;
  }
});

ipcMain.handle("window:is-maximized", event => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.isMaximized() || false;
  } catch (error) {
    logger.error("Failed to check if window is maximized:", error);
    return false;
  }
});

ipcMain.handle("window:is-minimized", event => {
  try {
    const window = BrowserWindow.fromWebContents(event.sender);
    return window?.isMinimized() || false;
  } catch (error) {
    logger.error("Failed to check if window is minimized:", error);
    return false;
  }
});
