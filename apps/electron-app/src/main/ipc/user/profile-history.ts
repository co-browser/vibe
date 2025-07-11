/**
 * IPC handlers for user profile navigation history
 */

import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("profile-history-ipc");

export function registerProfileHistoryHandlers(): void {
  /**
   * Get navigation history for the active user profile
   */
  ipcMain.handle(
    "profile:getNavigationHistory",
    async (_event, query?: string, limit?: number) => {
      try {
        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          return [];
        }

        const history = userProfileStore.getNavigationHistory(
          activeProfile.id,
          query,
          limit,
        );
        logger.debug(
          `Retrieved ${history.length} history entries for query: ${query}`,
        );
        return history;
      } catch (error) {
        logger.error("Failed to get navigation history:", error);
        return [];
      }
    },
  );

  /**
   * Clear navigation history for the active user profile
   */
  ipcMain.handle("profile:clearNavigationHistory", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      userProfileStore.clearNavigationHistory(activeProfile.id);
      logger.info("Navigation history cleared for active profile");
      return true;
    } catch (error) {
      logger.error("Failed to clear navigation history:", error);
      return false;
    }
  });

  /**
   * Get active user profile info
   */
  ipcMain.handle("profile:getActiveProfile", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return null;
      }

      // Return profile info without sensitive data
      return {
        id: activeProfile.id,
        name: activeProfile.name,
        createdAt: activeProfile.createdAt,
        lastActive: activeProfile.lastActive,
        settings: activeProfile.settings,
      };
    } catch (error) {
      logger.error("Failed to get active profile:", error);
      return null;
    }
  });
}
