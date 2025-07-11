/**
 * Modal IPC handlers
 * Handles modal-related IPC events that are not handled by DialogManager
 */

import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ipc-modals");

// Note: dialog:show-settings is handled by DialogManager directly
// We only handle the modal closed events here

// Handle settings modal closed event
ipcMain.on("app:settings-modal-closed", () => {
  logger.debug("Settings modal closed");

  // Optional: You could add any cleanup logic here
  // For now, just acknowledge the event
});

// Handle downloads modal closed event
ipcMain.on("app:downloads-modal-closed", () => {
  logger.debug("Downloads modal closed");

  // Optional: You could add any cleanup logic here
  // For now, just acknowledge the event
});

logger.info("Modal IPC handlers registered");
