import { ipcMain } from "electron";
import { WindowBroadcast } from "@/utils/window-broadcast";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";
import { userAnalytics } from "@/services/user-analytics";

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

ipcMain.on("interface:set-chat-panel-width", (event, widthInPixels: number) => {
  logger.info(`Setting chat panel width to ${widthInPixels}px`);

  // Update the ViewManager with the new chat panel width
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (appWindow) {
    appWindow.viewManager.setChatPanelWidth(widthInPixels);
  }
});

// Speedlane mode handler
ipcMain.on("interface:set-speedlane-mode", (event, enabled: boolean) => {
  logger.info(`Setting Speedlane mode to: ${enabled}`);

  // Track Speedlane mode toggle
  userAnalytics.trackNavigation("speedlane-mode-toggled", {
    enabled: enabled,
    windowId: event.sender.id,
  });

  // Update usage stats for Speedlane usage
  if (enabled) {
    userAnalytics.updateUsageStats({ speedlaneUsed: true });
  }

  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) {
    logger.warn("No application window found for Speedlane mode");
    return;
  }

  // Update the ViewManager to enable/disable Speedlane mode
  appWindow.viewManager.setSpeedlaneMode(enabled);

  if (enabled) {
    // Create an agent-controlled tab for the right panel without activating it
    const agentTabKey = appWindow.tabManager.createTab(
      "https://www.perplexity.ai",
      { activate: false }, // Don't activate this tab
    );
    logger.info(`Created agent-controlled tab: ${agentTabKey}`);

    // Set it as the right view in Speedlane mode
    appWindow.viewManager.setSpeedlaneRightView(agentTabKey);

    // Mark this tab as agent-controlled (for future reference)
    const tabState = appWindow.tabManager.getTab(agentTabKey);
    if (tabState) {
      tabState.isAgentControlled = true;
    }
  }

  // Notify the renderer about the mode change
  appWindow.window.webContents.send("speedlane-mode-changed", enabled);
});

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

// Forward omnibox events - optimized to target relevant windows only
ipcMain.on("omnibox:suggestion-clicked", (_event, suggestion) => {
  // Send to all windows (suggestion clicks should be broadcasted)
  WindowBroadcast.broadcastToAll("omnibox:suggestion-clicked", suggestion);
});

ipcMain.on("omnibox:escape-dropdown", event => {
  // Send only to the sender window (escape is window-specific)
  WindowBroadcast.replyToSender(event, "omnibox:escape-dropdown");
});

ipcMain.on("omnibox:delete-history", (_event, suggestionId) => {
  // Broadcast history deletion to all windows for sync
  WindowBroadcast.broadcastToAll("omnibox:delete-history", suggestionId);
});
