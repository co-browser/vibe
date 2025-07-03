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
  google: "GOOGLE_API_KEY",
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
  // Handle various formats: "openaiApiKey", "openai", "llmApiKey", etc.
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
  const profileService = getProfile();
  const storage = getStorage();

  // Check if it's a profile preference
  if (isProfilePreference(key)) {
    return profileService.getPreference(key);
  }

  // Check if it's an API key
  if (isApiKeyType(key)) {
    const keyType = normalizeApiKeyType(key);
    const storedKey = profileService.getApiKey(keyType);

    // Fallback to environment variable for backward compatibility
    if (!storedKey && API_KEY_ENV_MAP[keyType]) {
      const envValue = process.env[API_KEY_ENV_MAP[keyType]];
      if (envValue) {
        // Migrate from env to profile storage
        profileService.setApiKey(keyType, envValue);
        return envValue;
      }
    }

    return storedKey;
  }

  // Otherwise it's an app setting
  return storage.get(`settings.${key}`);
}

/**
 * Set a setting value in the appropriate location
 */
export async function setSetting(key: string, value: any): Promise<boolean> {
  const profileService = getProfile();
  const storage = getStorage();

  try {
    if (isProfilePreference(key)) {
      await profileService.setPreference(key, value);
      return true;
    }

    if (isApiKeyType(key)) {
      const keyType = normalizeApiKeyType(key);
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
  } catch {
    logger.error(`Failed to set setting "${key}":`);
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
export function getAllSettings(): Record<string, any> {
  const storage = getStorage();
  const profileService = getProfile();
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

  // Get API keys (masked for security)
  const apiKeys = profileService.getAllApiKeys();
  Object.entries(apiKeys).forEach(([key, value]) => {
    allSettings[`${key}ApiKey`] = value ? "***" : null;
  });

  return allSettings;
}
