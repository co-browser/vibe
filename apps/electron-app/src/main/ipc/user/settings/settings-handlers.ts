import { ipcMain, webContents, app } from "electron";
import {
  getStorage,
  getProfile,
  getSetting,
  setSetting,
  getAllSettings,
  broadcastSettingChange,
  cleanupWatchers,
  isProfilePreference,
  isApiKeyType,
  normalizeApiKeyType,
} from "../shared-utils";
/**
 * Unified settings handlers
 * Provides CRUD operations, management functionality, and change watching for app settings and profile preferences
 */

const storage = getStorage();

// Default settings configuration
const DEFAULT_SETTINGS = {
  theme: "system",
  language: "en",
  devTools: false,
};

const DEFAULT_PREFERENCES = {
  defaultSearchEngine: "google",
  privacyMode: false,
};

// Track active watchers
const settingsWatchers = new Map<number, Set<string>>(); // webContentsId -> Set of watched keys
const profileWatchers = new Map<number, Set<string>>(); // webContentsId -> Set of watched preference keys
const apiKeysWatchers = new Map<number, Set<string>>(); // webContentsId -> Set of watched API keys

// ===== CRUD Operations =====

ipcMain.handle("settings:get", async (_, key: string) => {
  return getSetting(key);
});

ipcMain.handle("settings:set", async (_, key: string, value: any) => {
  return setSetting(key, value);
});

ipcMain.handle("settings:remove", async (_, key: string) => {
  try {
    if (isProfilePreference(key)) {
      const profileService = await getProfile();
      profileService.removePreference(key);
    } else if (isApiKeyType(key)) {
      const profileService = await getProfile();
      profileService.removeApiKey(normalizeApiKeyType(key));
    } else {
      storage.delete(`settings.${key}`);
    }
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("settings:get-all", async () => {
  // Always return masked settings for the general getter
  return getAllSettings(true);
});

ipcMain.handle("settings:get-all-unmasked", async () => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Unmasked settings access is not allowed in production");
  }
  return getAllSettings(false);
});

// ===== Get or Set with Default =====

ipcMain.handle(
  "settings:get-or-set",
  async (_, key: string, defaultValue: any) => {
    // Check if it's a profile preference
    if (isProfilePreference(key)) {
      const profileService = await getProfile();
      const preference = profileService.getPreference(key);
      if (preference === undefined) {
        profileService.setPreference(key, defaultValue);
        return defaultValue;
      }
      return preference;
    }

    // Check if it's an API key
    if (isApiKeyType(key)) {
      const keyType = normalizeApiKeyType(key);
      const profileService = await getProfile();
      const apiKey = profileService.getApiKey(keyType);
      if (apiKey === undefined) {
        profileService.setApiKey(keyType, defaultValue);
        return defaultValue;
      }
      return apiKey;
    }

    // Check app settings
    const value = storage.get(`settings.${key}`);
    if (value === undefined) {
      storage.set(`settings.${key}`, defaultValue);
      return defaultValue;
    }
    return value;
  },
);

// ===== Watch Operations =====

ipcMain.handle("settings:watch", async (event, keys: string[]) => {
  const webContentsId = event.sender.id;

  // Initialize watcher sets if needed
  if (!settingsWatchers.has(webContentsId)) {
    settingsWatchers.set(webContentsId, new Set());
  }
  if (!profileWatchers.has(webContentsId)) {
    profileWatchers.set(webContentsId, new Set());
  }
  if (!apiKeysWatchers.has(webContentsId)) {
    apiKeysWatchers.set(webContentsId, new Set());
  }

  const settingsSet = settingsWatchers.get(webContentsId)!;
  const profileSet = profileWatchers.get(webContentsId)!;
  const apiKeysSet = apiKeysWatchers.get(webContentsId)!;

  // Add keys to appropriate watcher sets
  keys.forEach(key => {
    if (isProfilePreference(key)) {
      profileSet.add(key);
    } else if (isApiKeyType(key)) {
      apiKeysSet.add(key);
    } else {
      settingsSet.add(key);
    }
  });

  return true;
});

ipcMain.handle("settings:unwatch", async (event, keys?: string[]) => {
  const webContentsId = event.sender.id;

  const settingsSet = settingsWatchers.get(webContentsId);
  const profileSet = profileWatchers.get(webContentsId);
  const apiKeysSet = apiKeysWatchers.get(webContentsId);

  if (keys?.length) {
    keys.forEach(key => {
      if (isProfilePreference(key)) {
        profileSet?.delete(key);
      } else if (isApiKeyType(key)) {
        apiKeysSet?.delete(key);
      } else {
        settingsSet?.delete(key);
      }
    });
  } else {
    // If no keys are provided, unwatch all for this sender
    settingsWatchers.delete(webContentsId);
    profileWatchers.delete(webContentsId);
    apiKeysWatchers.delete(webContentsId);
  }

  // Clean up empty sets
  if (settingsSet?.size === 0) {
    settingsWatchers.delete(webContentsId);
  }
  if (profileSet?.size === 0) {
    profileWatchers.delete(webContentsId);
  }
  if (apiKeysSet?.size === 0) {
    apiKeysWatchers.delete(webContentsId);
  }

  return true;
});

// Listen for storage changes and notify watchers
storage.on("change", (key: string, newValue: any, oldValue: any) => {
  // Only handle settings keys
  if (!key.startsWith("settings.")) return;

  const settingKey = key.replace("settings.", "");

  // Notify all watchers of this key
  broadcastSettingChange(settingKey, newValue, oldValue, settingsWatchers);
});

// Initialize profile service and set up event listeners
(async () => {
  const profileService = await getProfile();

  // Listen for profile preference changes
  profileService.on(
    "preferenceChanged",
    (key: string, newValue: any, oldValue: any) => {
      // Notify all watchers of this preference
      broadcastSettingChange(key, newValue, oldValue, profileWatchers);
    },
  );

  // Listen for API key changes
  profileService.on(
    "apiKeyChanged",
    (key: string, newValue: any, oldValue: any) => {
      // The key from the event is the API key type, e.g., "openai"
      // We need to find the corresponding watched key, e.g., "apiKeys.openai"
      const watchedKey = `apiKeys.${key}`;
      broadcastSettingChange(watchedKey, newValue, oldValue, apiKeysWatchers);
    },
  );
})();

// Clean up watchers when web contents are destroyed
const attachCleanupHandler = (wc: Electron.WebContents) => {
  wc.on("destroyed", () => {
    cleanupWatchers(wc.id, settingsWatchers, profileWatchers, apiKeysWatchers);
  });
};

// Attach to existing web contents
webContents.getAllWebContents().forEach(attachCleanupHandler);

// Attach to future web contents
app.on("web-contents-created", (_, contents) => {
  attachCleanupHandler(contents);
});

// ===== Management Operations =====

ipcMain.handle("settings:reset", async () => {
  try {
    // Reset app settings to defaults
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => {
      storage.set(`settings.${key}`, value);
    });

    // Reset profile preferences to defaults
    const profileService = await getProfile();
    Object.entries(DEFAULT_PREFERENCES).forEach(([key, value]) => {
      profileService.setPreference(key, value);
    });

    return true;
  } catch {
    return false;
  }
});

ipcMain.handle("settings:export", async () => {
  try {
    const exportData: Record<string, any> = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      settings: {},
      preferences: {},
    };

    // Export app settings
    const keys = storage.keys();
    keys.forEach(key => {
      if (key.startsWith("settings.")) {
        const settingKey = key.replace("settings.", "");
        exportData.settings[settingKey] = storage.get(key);
      }
    });

    // Export profile preferences
    const profileService = await getProfile();
    exportData.preferences = profileService.getPreferences();

    return JSON.stringify(exportData, null, 2);
  } catch {
    return "{}";
  }
});

ipcMain.handle("settings:import", async (_, data: string) => {
  try {
    const importData = JSON.parse(data);

    // Validate import data structure
    if (typeof importData !== "object" || importData === null) {
      throw new Error("Invalid import data: must be an object");
    }

    // Import app settings
    if (importData.settings) {
      if (typeof importData.settings !== "object") {
        throw new Error("Invalid settings data: must be an object");
      }
      Object.entries(importData.settings).forEach(([key, value]) => {
        // Validate that the value is not undefined or a function
        if (value !== undefined && typeof value !== "function") {
          storage.set(`settings.${key}`, value);
        }
      });
    }

    // Import profile preferences
    if (importData.preferences) {
      if (typeof importData.preferences !== "object") {
        throw new Error("Invalid preferences data: must be an object");
      }
      const profileService = await getProfile();
      Object.entries(importData.preferences).forEach(([key, value]) => {
        // Validate that the value is not undefined or a function
        if (value !== undefined && typeof value !== "function") {
          profileService.setPreference(key, value);
        }
      });
    }

    return true;
  } catch {
    return false;
  }
});
