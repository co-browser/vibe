/**
 * Password management IPC handlers for settings dialog
 * Maps settings dialog expectations to profile store functionality
 */

import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("password-handlers");

export function registerPasswordHandlers(): void {
  /**
   * Get all passwords for the active profile
   */
  ipcMain.handle("passwords:get-all", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, passwords: [] };
      }

      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );

      return {
        success: true,
        passwords: passwords.map(p => ({
          id: p.id,
          url: p.url,
          username: p.username,
          password: p.password,
          source: p.source || "manual",
          dateCreated: p.dateCreated,
          lastModified: p.lastModified,
        })),
      };
    } catch (error) {
      logger.error("Failed to get passwords:", error);
      return { success: false, passwords: [] };
    }
  });

  /**
   * Get password import sources
   */
  ipcMain.handle("passwords:get-sources", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, sources: [] };
      }

      const sources = await userProfileStore.getPasswordImportSources(
        activeProfile.id,
      );
      return { success: true, sources };
    } catch (error) {
      logger.error("Failed to get password sources:", error);
      return { success: false, sources: [] };
    }
  });

  // Note: passwords:import-chrome is already handled by DialogManager
  // which has the actual Chrome extraction logic
}
