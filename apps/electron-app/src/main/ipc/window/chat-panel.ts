import { ipcMain, BrowserWindow } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ChatPanelIPC");

/**
 * Chat panel management handlers
 * Window-specific approach using event.sender.id auto-detection
 */

ipcMain.on("toggle-custom-chat-area", (event, isVisible: boolean) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return;

  appWindow.viewManager.toggleChatPanel(isVisible);
  appWindow.window.webContents.send("chat-area-visibility-changed", isVisible);
});

ipcMain.handle("interface:get-chat-panel-state", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return { isVisible: false };

  return appWindow.viewManager.getChatPanelState();
});

ipcMain.on(
  "interface:set-chat-panel-width",
  (_event, widthPercentage: number) => {
    logger.info(`Setting chat panel width to ${widthPercentage}%`);
  },
);

// Manual chat panel recovery handler for testing and debugging
ipcMain.handle("interface:recover-chat-panel", async event => {
  try {
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      logger.warn("No application window found for chat panel recovery");
      return { success: false, error: "No application window found" };
    }

    logger.info("🔄 Manual chat panel recovery triggered via IPC");

    // Send recovery signal to the specific window
    appWindow.window.webContents.send("recover-chat-panel");

    return { success: true, message: "Chat panel recovery triggered" };
  } catch (error) {
    logger.error("Manual chat panel recovery failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// Forward omnibox events from overlay to main window
ipcMain.on("omnibox:suggestion-clicked", (_event, suggestion) => {
  // Find which window this came from
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("omnibox:suggestion-clicked", suggestion);
    }
  }
});

ipcMain.on("omnibox:escape-dropdown", () => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("omnibox:escape-dropdown");
    }
  }
});

ipcMain.on("omnibox:delete-history", (_event, suggestionId) => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send("omnibox:delete-history", suggestionId);
    }
  }
});
