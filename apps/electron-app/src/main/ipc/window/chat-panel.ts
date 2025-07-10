import { ipcMain } from "electron";
import { WindowBroadcast } from "@/utils/window-broadcast";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";
import { userAnalytics } from "@/services/user-analytics";
import { mainProcessPerformanceMonitor } from "@/utils/performanceMonitor";

const logger = createLogger("ChatPanelIPC");

/**
 * Chat panel management handlers
 * Window-specific approach using event.sender.id auto-detection
 */

ipcMain.on("toggle-custom-chat-area", (event, isVisible: boolean) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return;

  // Track chat panel toggle
  userAnalytics.trackChatEngagement(isVisible ? "chat_opened" : "chat_closed");
  userAnalytics.trackNavigation("chat-panel-toggled", {
    isVisible: isVisible,
    windowId: event.sender.id,
  });

  // Update usage stats for chat usage
  if (isVisible) {
    userAnalytics.updateUsageStats({ chatUsed: true });
  }

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
