import { ipcMain } from "electron";
import {
  getProfile,
  getSetting,
  setSetting,
  removeSetting,
  normalizeApiKeyType,
  getAllSettings,
} from "../shared-utils";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ProfileHandlers");

// Define proper interface for profile updates
interface ProfileUpdates {
  name?: string;
  email?: string;
  avatar?: string;
  color?: string;
  settings?: {
    theme?: "light" | "dark" | "system";
    language?: string;
    defaultSearchEngine?: string;
    autoSavePasswords?: boolean;
    syncBrowsingHistory?: boolean;
    privacyMode?: boolean;
  };
}

// Helper function to handle API key type errors
const handleApiKeyError = (keyType: string): never => {
  logger.error(`Invalid API key type: ${keyType}`);
  throw new Error(`Invalid API key type: ${keyType}`);
};

/**
 * Profile management IPC handlers
 * Includes API key management as part of profile data
 */

// Profile Management
ipcMain.handle("profile:get-current", async () => {
  const profileService = await getProfile();
  return profileService.getCurrentProfile();
});

ipcMain.handle("profile:get-all", async () => {
  const profileService = await getProfile();
  return profileService.getAllProfiles();
});

ipcMain.handle("profile:create", async (_, name: string) => {
  const profileService = await getProfile();
  const profile = await profileService.createProfile(name);
  if (profile) {
    logger.info(`Created profile: ${name}`);
  }
  return profile;
});

ipcMain.handle("profile:switch", async (_, profileId: string) => {
  const profileService = await getProfile();
  const success = profileService.setActiveProfile(profileId);
  if (success) {
    logger.info(`Switched to profile: ${profileId}`);
  }
  return success;
});

ipcMain.handle(
  "profile:update",
  async (_, profileId: string, updates: ProfileUpdates) => {
    const profileService = await getProfile();
    const updated = profileService.updateProfile(profileId, updates);
    if (updated) {
      logger.info(
        `Updated profile: ${profileId}, fields updated: ${Object.keys(updates).join(", ")}`,
      );
    }
    return updated;
  },
);

ipcMain.handle("profile:delete", async (_, profileId: string) => {
  const profileService = await getProfile();
  const deleted = await profileService.deleteProfile(profileId);
  if (deleted) {
    logger.info(`Deleted profile: ${profileId}`);
  }
  return deleted;
});

// API Key Management (part of profile)
ipcMain.handle("profile:get-api-key", async (_, keyType: string) => {
  try {
    const normalizedKey = normalizeApiKeyType(keyType);
    const apikey = await getSetting(normalizedKey + "ApiKey");
    if (apikey) {
      logger.info(`Retrieved ${keyType} API key`);
    } else {
      logger.warn(`No ${keyType} API key found`);
    }
    return apikey;
  } catch (error) {
    logger.error(`Error processing API key type ${keyType}:`, error);
    handleApiKeyError(keyType);
  }
});

ipcMain.handle(
  "profile:set-api-key",
  async (_, keyType: string, value: string) => {
    try {
      const normalizedKey = normalizeApiKeyType(keyType);
      const success = await setSetting(normalizedKey + "ApiKey", value);
      if (success) {
        logger.info(`Set ${keyType} API key`);
      }
      return success;
    } catch (error) {
      logger.error(`Invalid API key type: ${keyType}`, error);
      throw new Error(`Invalid API key type: ${keyType}`);
    }
  },
);

ipcMain.handle("profile:remove-api-key", async (_, keyType: string) => {
  try {
    const normalizedKey = normalizeApiKeyType(keyType);
    const success = await removeSetting(normalizedKey + "ApiKey");
    if (success) {
      logger.info(`Removed ${keyType} API key`);
    }
    return success;
  } catch (error) {
    logger.error(`Error processing API key type ${keyType}:`, error);
    return handleApiKeyError(keyType);
  }
});

ipcMain.handle("profile:get-all-api-keys", async () => {
  // Get all settings and filter for API keys
  const allSettings = await getAllSettings(false); // false = unmasked
  const apiKeys: Record<string, string | null> = {};

  // Extract API keys from settings
  Object.entries(allSettings).forEach(([key, value]) => {
    if (key.endsWith("ApiKey")) {
      try {
        const keyType = normalizeApiKeyType(key);
        apiKeys[keyType] = value as string | null;
      } catch (error) {
        logger.warn(`Skipping invalid API key type: ${key}`, error);
      }
    }
  });

  return apiKeys;
});

// Preferences (part of profile)
ipcMain.handle("profile:get-preference", async (_, key: string) => {
  const profileService = await getProfile();
  return profileService.getPreference(key);
});

ipcMain.handle(
  "profile:set-preference",
  async (_, key: string, value: unknown) => {
    const profileService = await getProfile();
    return profileService.setPreference(key, value);
  },
);

ipcMain.handle("profile:get-all-preferences", async () => {
  const profileService = await getProfile();
  return profileService.getPreferences();
});

// Browsing History
ipcMain.handle("profile:get-history", async (_, limit?: number) => {
  const profileService = await getProfile();
  return profileService.getBrowsingHistory(limit);
});

ipcMain.handle(
  "profile:add-history",
  async (_, url: string, title: string, favicon?: string) => {
    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      logger.error("Invalid URL format:", error);
      throw new Error("Invalid URL format");
    }

    if (!title || title.trim().length === 0) {
      throw new Error("Title is required");
    }
    const profileService = await getProfile();
    return profileService.addBrowsingHistory(url, title, favicon);
  },
);

ipcMain.handle("profile:clear-history", async () => {
  const profileService = await getProfile();
  return profileService.clearBrowsingHistory();
});

// Saved Passwords
ipcMain.handle("profile:get-passwords", async () => {
  const profileService = await getProfile();
  return profileService.getSavedPasswords();
});

ipcMain.handle(
  "profile:save-password",
  async (
    _,
    url: string,
    username: string,
    password: string,
    title?: string,
  ) => {
    const profileService = await getProfile();
    return profileService.savePassword(url, username, password, title);
  },
);

ipcMain.handle("profile:delete-password", async (_, passwordId: string) => {
  const profileService = await getProfile();
  return profileService.deleteSavedPassword(passwordId);
});
