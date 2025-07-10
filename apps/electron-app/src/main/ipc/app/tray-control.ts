import { ipcMain, IpcMainInvokeEvent } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("tray-control");

// Reference to the main process tray variable
let mainTray: Electron.Tray | null = null;

// Function to set the main tray reference
export function setMainTray(tray: Electron.Tray | null) {
  mainTray = tray;
}

/**
 * Tray control IPC handlers
 */

ipcMain.handle("tray:create", async (_event: IpcMainInvokeEvent) => {
  try {
    if (mainTray) {
      logger.info("Tray already exists");
      return true;
    }

    // Import tray creation logic from main process
    const { createTray } = await import("../../tray-manager");
    mainTray = await createTray();

    logger.info("Tray created successfully");
    return true;
  } catch (error) {
    logger.error("Failed to create tray", { error });
    return false;
  }
});

ipcMain.handle("tray:destroy", async (_event: IpcMainInvokeEvent) => {
  try {
    if (!mainTray) {
      logger.info("Tray does not exist");
      return true;
    }

    mainTray.destroy();
    mainTray = null;

    logger.info("Tray destroyed successfully");
    return true;
  } catch (error) {
    logger.error("Failed to destroy tray", { error });
    return false;
  }
});

ipcMain.handle("tray:is-visible", async (_event: IpcMainInvokeEvent) => {
  return mainTray !== null;
});
