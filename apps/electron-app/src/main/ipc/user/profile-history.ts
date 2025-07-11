/**
 * IPC handlers for user profile navigation history
 */

import { ipcMain } from "electron";
import {
  useUserProfileStore,
  type ImportedPasswordEntry,
} from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("profile-history-ipc");

/**
 * Authorization check - verify sender is authorized for sensitive operations
 */
function isAuthorizedForPasswordOps(
  event: Electron.IpcMainInvokeEvent,
): boolean {
  try {
    // Check if the request comes from the main renderer process
    const sender = event.sender;
    if (!sender || sender.isDestroyed()) {
      return false;
    }

    // Verify the sender is from our application
    const url = sender.getURL();
    if (
      !url.includes("electron") &&
      !url.includes("localhost") &&
      !url.includes("file://")
    ) {
      logger.warn("Unauthorized password operation attempt from:", url);
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Authorization check failed:", error);
    return false;
  }
}

/**
 * Input validation utilities
 */
function validateString(
  value: unknown,
  maxLength: number = 1000,
): string | null {
  if (typeof value !== "string") return null;
  if (value.length > maxLength) return null;
  return value.trim();
}

function validateNumber(
  value: unknown,
  min: number = 0,
  max: number = 10000,
): number | null {
  if (typeof value !== "number" || isNaN(value)) return null;
  if (value < min || value > max) return null;
  return Math.floor(value);
}

function validatePasswords(passwords: unknown): ImportedPasswordEntry[] | null {
  if (!Array.isArray(passwords)) return null;
  if (passwords.length > 10000) return null; // Max 10k passwords

  for (const password of passwords) {
    if (!password || typeof password !== "object") return null;
    if (typeof password.id !== "string" || password.id.length > 255)
      return null;
    if (typeof password.url !== "string" || password.url.length > 2000)
      return null;
    if (typeof password.username !== "string" || password.username.length > 255)
      return null;
    if (
      typeof password.password !== "string" ||
      password.password.length > 1000
    )
      return null;
    if (password.source && typeof password.source !== "string") return null;
  }

  return passwords as ImportedPasswordEntry[];
}

export function registerProfileHistoryHandlers(): void {
  /**
   * Get navigation history for the active user profile
   */
  ipcMain.handle(
    "profile:getNavigationHistory",
    async (_event, query?: string, limit?: number) => {
      try {
        // Input validation
        const validQuery = query ? validateString(query, 500) : undefined;
        const validLimit = limit ? validateNumber(limit, 1, 1000) : undefined;

        if (query && !validQuery) {
          logger.warn("Invalid query parameter in getNavigationHistory");
          return [];
        }

        if (limit && !validLimit) {
          logger.warn("Invalid limit parameter in getNavigationHistory");
          return [];
        }

        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          return [];
        }

        const history = userProfileStore.getNavigationHistory(
          activeProfile.id,
          validQuery || undefined,
          validLimit || undefined,
        );
        logger.debug(`Retrieved ${history.length} history entries`);
        return history;
      } catch (error) {
        logger.error(
          "Failed to get navigation history:",
          error instanceof Error ? error.message : String(error),
        );
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
      logger.error(
        "Failed to clear navigation history:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  });

  /**
   * Delete specific URL from navigation history for the active user profile
   */
  ipcMain.handle(
    "profile:deleteFromNavigationHistory",
    async (_event, url: string) => {
      try {
        // Input validation
        const validUrl = validateString(url, 2000);
        if (!validUrl) {
          logger.warn("Invalid URL parameter in deleteFromNavigationHistory");
          return false;
        }

        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          return false;
        }

        userProfileStore.deleteFromNavigationHistory(
          activeProfile.id,
          validUrl,
        );
        logger.info("Deleted URL from navigation history");
        return true;
      } catch (error) {
        logger.error(
          "Failed to delete from navigation history:",
          error instanceof Error ? error.message : String(error),
        );
        return false;
      }
    },
  );

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
        downloads: activeProfile.downloads || [],
      };
    } catch (error) {
      logger.error(
        "Failed to get active profile:",
        error instanceof Error ? error.message : String(error),
      );
      return null;
    }
  });

  /**
   * Store imported passwords securely (encrypted)
   */
  ipcMain.handle(
    "profile:store-passwords",
    async (
      event,
      {
        source,
        passwords,
      }: { source: string; passwords: ImportedPasswordEntry[] },
    ) => {
      try {
        // Authorization check
        if (!isAuthorizedForPasswordOps(event)) {
          logger.warn("Unauthorized password store attempt");
          return { success: false, error: "Unauthorized" };
        }

        // Input validation
        const validSource = validateString(source, 100);
        const validPasswords = validatePasswords(passwords);

        if (!validSource) {
          logger.warn("Invalid source parameter in store-passwords");
          return { success: false, error: "Invalid source parameter" };
        }

        if (!validPasswords) {
          logger.warn("Invalid passwords parameter in store-passwords");
          return { success: false, error: "Invalid passwords data" };
        }

        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          return { success: false, error: "No active profile found" };
        }

        await userProfileStore.storeImportedPasswords(
          activeProfile.id,
          validSource,
          validPasswords,
        );
        logger.info(`Stored ${validPasswords.length} credentials securely`);

        return { success: true, count: validPasswords.length };
      } catch (error) {
        logger.error(
          "Failed to store credentials:",
          error instanceof Error ? error.message : String(error),
        );
        return { success: false, error: "Failed to store credentials" };
      }
    },
  );

  /**
   * Get imported passwords securely (decrypted)
   */
  ipcMain.handle("profile:get-passwords", async (event, source?: string) => {
    try {
      // Authorization check
      if (!isAuthorizedForPasswordOps(event)) {
        logger.warn("Unauthorized password get attempt");
        return [];
      }

      // Input validation
      const validSource = source ? validateString(source, 100) : undefined;
      if (source && !validSource) {
        logger.warn("Invalid source parameter in get-passwords");
        return [];
      }

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return [];
      }

      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
        validSource || undefined,
      );
      logger.debug(`Retrieved ${passwords.length} credentials`);

      return passwords;
    } catch (error) {
      logger.error(
        "Failed to get imported credentials:",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  });

  /**
   * Get password import sources for the active profile
   */
  ipcMain.handle("profile:get-password-sources", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return [];
      }

      const sources = await userProfileStore.getPasswordImportSources(
        activeProfile.id,
      );
      logger.debug(
        `Retrieved password sources for profile ${activeProfile.id}:`,
        sources,
      );

      return sources;
    } catch (error) {
      logger.error(
        "Failed to get password import sources:",
        error instanceof Error ? error.message : String(error),
      );
      return [];
    }
  });

  /**
   * Remove imported passwords from a specific source
   */
  ipcMain.handle("profile:remove-passwords", async (event, source: string) => {
    try {
      // Authorization check
      if (!isAuthorizedForPasswordOps(event)) {
        logger.warn("Unauthorized password remove attempt");
        return false;
      }

      // Input validation
      const validSource = validateString(source, 100);
      if (!validSource) {
        logger.warn("Invalid source parameter in remove-passwords");
        return false;
      }

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      await userProfileStore.removeImportedPasswords(
        activeProfile.id,
        validSource,
      );
      logger.info("Removed credentials from source");

      return true;
    } catch (error) {
      logger.error(
        "Failed to remove credentials:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  });

  /**
   * Clear all imported passwords
   */
  ipcMain.handle("profile:clear-all-passwords", async event => {
    try {
      // Authorization check
      if (!isAuthorizedForPasswordOps(event)) {
        logger.warn("Unauthorized password clear attempt");
        return false;
      }

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      await userProfileStore.clearAllImportedPasswords(activeProfile.id);
      logger.info(`Cleared all passwords for profile ${activeProfile.id}`);

      return true;
    } catch (error) {
      logger.error(
        "Failed to clear all passwords:",
        error instanceof Error ? error.message : String(error),
      );
      return false;
    }
  });
}
