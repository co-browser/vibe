import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import {
  getPasswordPasteHotkey,
  updatePasswordPasteHotkey,
  getRegisteredHotkeys,
} from "@/hotkey-manager";

const logger = createLogger("hotkey-control");

/**
 * Hotkey management IPC handlers
 */

ipcMain.handle("hotkeys:get-password-paste", async () => {
  try {
    const hotkey = getPasswordPasteHotkey();
    return { success: true, hotkey };
  } catch (error) {
    logger.error("Failed to get password paste hotkey:", error);
    return { success: false, error: "Failed to get hotkey" };
  }
});

ipcMain.handle("hotkeys:set-password-paste", async (_event, hotkey: string) => {
  try {
    const success = updatePasswordPasteHotkey(hotkey);
    return { success };
  } catch (error) {
    logger.error("Failed to set password paste hotkey:", error);
    return { success: false, error: "Failed to set hotkey" };
  }
});

ipcMain.handle("hotkeys:get-registered", async () => {
  try {
    const hotkeys = getRegisteredHotkeys();
    return { success: true, hotkeys: Object.fromEntries(hotkeys) };
  } catch (error) {
    logger.error("Failed to get registered hotkeys:", error);
    return { success: false, error: "Failed to get hotkeys" };
  }
});
