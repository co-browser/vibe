/**
 * Shared utilities for user-related IPC handlers
 * Provides common functionality for profile and settings management
 */

import { webContents } from "electron";
import { getStorageService } from "@/store/storage-service";
import { getProfileService } from "@/services/profile-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("SharedUtils");

// Profile preference keys that should be stored in profile service
export const PROFILE_PREFERENCE_KEYS = [
  "defaultSearchEngine",
  "theme",
  "language",
  "privacyMode",
];

// API key types supported by the system
export const API_KEY_TYPES = [
  "openai",
  "anthropic",
  "google",
  "github",
  "llm",
  "vector",
];

// Environment variable mappings for API keys
export const API_KEY_ENV_MAP: Record<string, string> = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GEMINI_API_KEY",
  github: "GITHUB_TOKEN",
};

/**
 * Get storage service instance
 */
export function getStorage() {
  return getStorageService();
}

/**
 * Get profile service instance
 */
export function getProfile() {
  return getProfileService();
}

/**
 * Check if a key is a profile preference
 */
export function isProfilePreference(key: string): boolean {
  return PROFILE_PREFERENCE_KEYS.includes(key);
}

/**
 * Check if a key is an API key type
 */
export function isApiKeyType(key: string): boolean {
  // Handle various formats: "openai", "anthropic", "llmApiKey", etc.
  // Note: The frontend still uses "openaiApiKey" for backward compatibility
  const normalizedKey = key.replace(/ApiKey$/i, "").toLowerCase();
  return API_KEY_TYPES.includes(normalizedKey);
}

/**
 * Normalize API key type from various formats
 */
export function normalizeApiKeyType(key: string): string {
  return key.replace(/ApiKey$/i, "").toLowerCase();
}

/**
 * Get a setting value from the appropriate source
 */
export async function getSetting(key: string): Promise<any> {
  logger.debug(`🔍 getSetting called with key: '${key}'`);
  const profileService = await getProfile();
  const storage = getStorage();

  // Check if it's a profile preference
  if (isProfilePreference(key)) {
    logger.debug(`getSetting: '${key}' is a profile preference`);
    return profileService.getPreference(key);
  }

  // Check if it's an API key
  const isApiKey = isApiKeyType(key);
  logger.debug(`getSetting: '${key}' isApiKeyType = ${isApiKey}`);
  if (isApiKey) {
    const keyType = normalizeApiKeyType(key);
    logger.debug(
      `getSetting: Looking up API key type '${keyType}' for original key '${key}'`,
    );
    const storedKey = profileService.getApiKey(keyType);
    logger.debug(
      `getSetting: Profile service returned:`,
      storedKey ? "present" : "undefined",
    );

    // check if the env has the key when the store doesnt have it
    if (!storedKey && API_KEY_ENV_MAP[keyType]) {
      const envValue = process.env[API_KEY_ENV_MAP[keyType]];
      logger.debug(
        `getSetting: No stored key, checking environment: ${API_KEY_ENV_MAP[keyType]} = ${envValue ? "present" : "undefined"}`,
      );
      if (envValue) {
        // Check if we've already attempted migration for this key in this session
        const migrationKey = `_migrated_${keyType}`;
        if (!(global as any)[migrationKey]) {
          // Migrate from env to profile storage (one-time operation)
          logger.info(
            `getSetting: Migrating ${keyType} from environment to profile storage`,
          );
          const success = profileService.setApiKey(keyType, envValue);
          if (success) {
            logger.info(
              `getSetting: Successfully migrated ${keyType} to profile storage`,
            );
            // Mark as migrated for this session
            (global as any)[migrationKey] = true;
          } else {
            logger.warn(
              `getSetting: Failed to migrate ${keyType} to profile storage`,
            );
          }
        }
        return envValue;
      }
    }

    logger.debug(
      `getSetting: Returning storedKey:`,
      storedKey ? "present" : "undefined",
    );
    return storedKey;
  }

  // Otherwise it's an app setting
  logger.debug(`getSetting: '${key}' is an app setting, checking storage`);
  const result = storage.get(`settings.${key}`);
  logger.debug(`getSetting: Storage returned:`, result);
  return result;
}

/**
 * Set a setting value in the appropriate location
 */
export async function setSetting(key: string, value: any): Promise<boolean> {
  const storage = getStorage();

  try {
    if (isProfilePreference(key)) {
      const profileService = await getProfile();
      profileService.setPreference(key, value);
      return true;
    }

    if (isApiKeyType(key)) {
      let keyType: string;
      try {
        keyType = normalizeApiKeyType(key);
      } catch (error) {
        logger.error(`Invalid API key type in setSetting: ${key}`, error);
        return false;
      }

      const profileService = await getProfile();

      logger.debug(`🔍 setSetting called for API key ${keyType}:`, {
        hasValue: !!value,
        type: typeof value,
        isNull: value === null,
        isUndefined: value === undefined,
        isEmptyString: value === "",
      });

      // If value is null or empty, remove the key instead
      if (value === null || value === undefined || value === "") {
        logger.info(`Removing API key ${keyType} from storage`);
        const success = profileService.removeApiKey(keyType);

        // Also remove from environment
        if (success && API_KEY_ENV_MAP[keyType]) {
          logger.debug(
            `Also removing ${API_KEY_ENV_MAP[keyType]} from process.env`,
          );
          delete process.env[API_KEY_ENV_MAP[keyType]];
        }

        return success;
      }

      logger.info(`Setting API key ${keyType} in storage`);
      const success = profileService.setApiKey(keyType, value);

      // Also update environment for current session
      if (success && API_KEY_ENV_MAP[keyType]) {
        process.env[API_KEY_ENV_MAP[keyType]] = value;
      }

      return success;
    }

    // Store as app setting
    storage.set(`settings.${key}`, value);
    return true;
  } catch (error) {
    logger.error(`Failed to set setting "${key}":`, error);
    return false;
  }
}

/**
 * Remove a setting from the appropriate location
 */
export async function removeSetting(key: string): Promise<boolean> {
  const storage = getStorage();

  try {
    if (isProfilePreference(key)) {
      const profileService = await getProfile();
      // Profile preferences don't have a remove method, set to null
      profileService.setPreference(key, null);
      return true;
    }

    if (isApiKeyType(key)) {
      let keyType: string;
      try {
        keyType = normalizeApiKeyType(key);
      } catch (error) {
        logger.error(`Invalid API key type in removeSetting: ${key}`, error);
        return false;
      }

      const profileService = await getProfile();

      logger.info(`Removing API key ${keyType} from storage`);
      const success = profileService.removeApiKey(keyType);

      // Also remove from environment
      if (success && API_KEY_ENV_MAP[keyType]) {
        logger.debug(
          `Also removing ${API_KEY_ENV_MAP[keyType]} from process.env`,
        );
        delete process.env[API_KEY_ENV_MAP[keyType]];
      }

      return success;
    }

    // Remove app setting
    storage.delete(`settings.${key}`);
    return true;
  } catch (error) {
    logger.error(`Failed to remove setting "${key}":`, error);
    return false;
  }
}

/**
 * Broadcast a setting change to all watching web contents
 */
export function broadcastSettingChange(
  key: string,
  newValue: any,
  oldValue: any,
  watchers: Map<number, Set<string>>,
): void {
  watchers.forEach((watchedKeys, webContentsId) => {
    if (watchedKeys.has(key)) {
      const wc = webContents.fromId(webContentsId);
      if (wc && !wc.isDestroyed()) {
        wc.send("settings:changed", key, newValue, oldValue);
      }
    }
  });
}

/**
 * Clean up watchers for a destroyed web contents
 */
export function cleanupWatchers(
  webContentsId: number,
  ...watcherMaps: Map<number, Set<string>>[]
): void {
  watcherMaps.forEach(watchers => {
    watchers.delete(webContentsId);
  });
}

/**
 * Get all settings from both storage and profile
 */
export async function getAllSettings(
  masked = true,
): Promise<Record<string, any>> {
  const storage = getStorage();
  const profileService = await getProfile();
  const allSettings: Record<string, any> = {};

  // Get all app settings
  const keys = storage.keys();
  keys.forEach(key => {
    if (key.startsWith("settings.")) {
      const settingKey = key.replace("settings.", "");
      allSettings[settingKey] = storage.get(key);
    }
  });

  // Get profile preferences
  const preferences = profileService.getPreferences();
  Object.assign(allSettings, preferences);

  // Get API keys through getSetting to ensure env var migration
  for (const keyType of API_KEY_TYPES) {
    const apiKey = await getSetting(`${keyType}ApiKey`);
    if (apiKey) {
      const keyName = `${keyType}ApiKey`;
      allSettings[keyName] = masked ? "***" : apiKey;
    }
  }

  return allSettings;
}
