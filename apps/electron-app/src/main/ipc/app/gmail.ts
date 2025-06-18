import { ipcMain } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("GmailIPC");

/** Gmail OAuth IPC handlers with ViewManager integration */

ipcMain.handle("gmail-check-auth", async () => {
  const { gmailOAuthService } = await import("@/services/gmail-service");
  return await gmailOAuthService.checkAuth();
});

ipcMain.handle("gmail-start-auth", async event => {
  try {
    const { gmailOAuthService } = await import("@/services/gmail-service");

    // Get the application window using the browser instance
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      logger.error("No application window found for OAuth flow");
      return {
        success: false,
        error: "No application window found for OAuth flow",
      };
    }

    // Start OAuth flow with the current window and viewManager
    return await gmailOAuthService.startAuth(
      appWindow.viewManager.getViewManagerState(),
      appWindow.window,
    );
  } catch (error) {
    logger.error("Failed to start Gmail OAuth:", error);
    return {
      success: false,
      error:
        "Failed to start OAuth flow: " +
        (error instanceof Error ? error.message : "Unknown error"),
    };
  }
});

ipcMain.handle("gmail-clear-auth", async () => {
  const { gmailOAuthService } = await import("@/services/gmail-service");
  return await gmailOAuthService.clearAuth();
});
