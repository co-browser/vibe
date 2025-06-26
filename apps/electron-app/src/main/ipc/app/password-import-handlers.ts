import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import { PasswordImportService } from "../../services/password-import/password-import.service";
import { getProfileService } from "../../services/profile-service";

const logger = createLogger("password-import-handlers");

/**
 * Register password import IPC handlers
 */
export function registerPasswordImportHandlers(): void {
  // Get available browser profiles
  ipcMain.handle("password-import-get-profiles", async () => {
    logger.info("Getting available browser profiles");

    try {
      const profiles = PasswordImportService.getAllBrowserProfiles();

      // Group profiles by browser
      const groupedProfiles: Record<string, typeof profiles> = {};
      profiles.forEach(profile => {
        if (!groupedProfiles[profile.browser]) {
          groupedProfiles[profile.browser] = [];
        }
        groupedProfiles[profile.browser].push(profile);
      });

      return {
        success: true,
        profiles: groupedProfiles,
        totalCount: profiles.length,
      };
    } catch (error) {
      logger.error("Failed to get browser profiles:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        profiles: {},
        totalCount: 0,
      };
    }
  });

  // Get password count for a specific profile
  ipcMain.handle(
    "password-import-get-count",
    async (_event, profilePath: string) => {
      logger.info("Getting password count for profile:", profilePath);

      try {
        const profiles = PasswordImportService.getAllBrowserProfiles();
        const profile = profiles.find(p => p.path === profilePath);

        if (!profile) {
          return { success: false, count: 0, error: "Profile not found" };
        }

        const count = await PasswordImportService.getPasswordCount(profile);

        return {
          success: true,
          count,
        };
      } catch (error) {
        logger.error("Failed to get password count:", error);
        return {
          success: false,
          count: 0,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  // Import passwords from a browser
  ipcMain.handle(
    "password-import-start",
    async (event, browser: string, profileId?: string) => {
      logger.info(`Starting password import for ${browser}`);

      const webContents = event.sender;

      try {
        // Get profile ID if not provided
        if (!profileId) {
          const profileService = getProfileService();
          const currentProfile = profileService.getCurrentProfile();
          if (!currentProfile) {
            throw new Error("No current profile available");
          }
          profileId = currentProfile.id;
        }

        // Get browser profiles
        const profiles = PasswordImportService.getAllBrowserProfiles();
        const browserProfiles = profiles.filter(
          p => p.browser === browser.toLowerCase(),
        );

        if (browserProfiles.length === 0) {
          throw new Error(`No ${browser} profiles found`);
        }

        // Use the first profile (or could let user choose)
        const selectedProfile = browserProfiles[0];

        // Import with progress updates
        const result = await PasswordImportService.importFromChrome(
          profileId,
          selectedProfile,
          progress => {
            webContents.send("password-import-progress", progress);
          },
        );

        logger.info(`Password import completed for ${browser}:`, result);
        return result;
      } catch (error) {
        logger.error(`Password import failed for ${browser}:`, error);
        return {
          browser,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );
}
