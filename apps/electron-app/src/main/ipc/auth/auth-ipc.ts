/**
 * Authentication IPC handlers
 * Manages authentication state between renderer and main process
 */

import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import {
  updateAuthState,
  clearAuthState,
  getAuthState,
} from "./auth-verification";

const logger = createLogger("auth-ipc");

/**
 * Authentication IPC channel definitions
 */
export const AUTH_CHANNELS = {
  UPDATE_AUTH_STATE: "auth:update-state",
  GET_AUTH_STATE: "auth:get-state",
  LOGOUT: "auth:logout",
  CHECK_AUTH: "auth:check",
} as const;

/**
 * Set up authentication IPC handlers
 */
export function setupAuthIPC(): void {
  // Handle authentication state updates from renderer
  ipcMain.on(AUTH_CHANNELS.UPDATE_AUTH_STATE, (event, authData) => {
    const webContentsId = event.sender.id;

    try {
      updateAuthState(webContentsId, {
        authenticated: authData.authenticated,
        userId: authData.userId,
      });

      logger.info(`Authentication state updated for window ${webContentsId}:`, {
        authenticated: authData.authenticated,
        userId: authData.userId
          ? `${authData.userId.slice(0, 8)}...`
          : undefined,
      });

      // Send acknowledgment back to renderer
      event.reply("auth:state-updated", { success: true });
    } catch (error) {
      logger.error("Failed to update auth state:", error);
      event.reply("auth:state-updated", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Handle authentication state queries
  ipcMain.handle(AUTH_CHANNELS.GET_AUTH_STATE, event => {
    const webContentsId = event.sender.id;

    try {
      const authState = getAuthState(webContentsId);
      return {
        success: true,
        authState: authState || { authenticated: false },
      };
    } catch (error) {
      logger.error("Failed to get auth state:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Handle logout requests
  ipcMain.on(AUTH_CHANNELS.LOGOUT, event => {
    const webContentsId = event.sender.id;

    try {
      clearAuthState(webContentsId);
      logger.info(`User logged out from window ${webContentsId}`);

      // Send acknowledgment back to renderer
      event.reply("auth:logged-out", { success: true });
    } catch (error) {
      logger.error("Failed to handle logout:", error);
      event.reply("auth:logged-out", {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Handle authentication checks
  ipcMain.handle(AUTH_CHANNELS.CHECK_AUTH, event => {
    const webContentsId = event.sender.id;

    try {
      const authState = getAuthState(webContentsId);
      const isAuthenticated = authState?.authenticated || false;

      return {
        success: true,
        authenticated: isAuthenticated,
        userId: authState?.userId,
      };
    } catch (error) {
      logger.error("Failed to check auth:", error);
      return {
        success: false,
        authenticated: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  logger.info("Authentication IPC handlers registered");
}

/**
 * Set up authentication cleanup (alias for auth-verification setup)
 */
export function setupAuthCleanup(): void {
  // Import here to avoid circular dependencies
  import("./auth-verification")
    .then(({ setupAuthCleanup: setupVerificationCleanup }) => {
      setupVerificationCleanup();
    })
    .catch(error => {
      logger.error("Failed to load auth-verification module:", error);
    });
}

/**
 * Clean up authentication IPC handlers
 */
export function cleanupAuthIPC(): void {
  ipcMain.removeAllListeners(AUTH_CHANNELS.UPDATE_AUTH_STATE);
  ipcMain.removeAllListeners(AUTH_CHANNELS.GET_AUTH_STATE);
  ipcMain.removeAllListeners(AUTH_CHANNELS.LOGOUT);
  ipcMain.removeAllListeners(AUTH_CHANNELS.CHECK_AUTH);

  logger.info("Authentication IPC handlers cleaned up");
}
