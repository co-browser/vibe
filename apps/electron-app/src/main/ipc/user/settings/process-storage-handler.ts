/**
 * Process Storage Handler
 * Provides a generic storage interface for utility processes to access profile data and settings
 */

import { UtilityProcess } from "electron";
import { getStorageService } from "../../../store/storage-service";
import { getProfileService } from "../../../services/profile-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("process-storage-handler");

interface UtilityProcessWithSettings extends UtilityProcess {
  _settingsWatchers?: Array<() => void>;
}

// Valid API key types for security
const VALID_KEY_TYPES = [
  "llm",
  "vector",
  "openai",
  "anthropic",
  "google",
  "github",
] as const;

// Check if it's an API key - route to profile service
const apiKeyTypes = VALID_KEY_TYPES.map(type => `${type}ApiKey`);

// Type guard to validate key type
function isValidKeyType(
  keyType: string,
): keyType is (typeof VALID_KEY_TYPES)[number] {
  return VALID_KEY_TYPES.includes(keyType as any);
}

/**
 * Set up storage handlers for a utility process
 * Call this after creating a utility process to enable storage access for settings and profile data
 */
export function setupProcessStorageHandler(
  utilityProcess: UtilityProcess,
): void {
  const process = utilityProcess as UtilityProcessWithSettings;
  process._settingsWatchers = [];

  // Handle messages from utility process
  utilityProcess.on("message", async (message: any) => {
    if (!message.type?.startsWith("settings:")) {
      return; // Not a settings message
    }

    logger.debug(
      `Received settings message from utility process: ${message.type}`,
    );

    try {
      switch (message.type) {
        case "settings:get":
          handleSettingsGet(utilityProcess, message);
          break;

        case "settings:set":
          handleSettingsSet(utilityProcess, message);
          break;

        case "settings:get-profile":
          handleGetProfile(utilityProcess, message);
          break;

        case "settings:get-all":
          handleGetAll(utilityProcess, message);
          break;

        case "settings:watch":
          handleWatch(process, message);
          break;

        case "settings:unwatch":
          handleUnwatch(process, message);
          break;

        default:
          logger.warn(`Unknown settings message type: ${message.type}`);
      }
    } catch (error) {
      logger.error(`Error handling settings message: ${error}`);
      utilityProcess.postMessage({
        id: message.id,
        type: "settings:error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  });

  // Clean up watchers when process exits
  utilityProcess.once("exit", () => {
    if (process._settingsWatchers) {
      process._settingsWatchers.forEach(unwatch => unwatch());
      process._settingsWatchers = [];
    }
  });
}

async function handleSettingsGet(
  utilityProcess: UtilityProcess,
  message: any,
): Promise<void> {
  const { id, key } = message;
  const storage = getStorageService();

  if (apiKeyTypes.includes(key)) {
    const profileService = await getProfileService();
    const keyType = key.replace(/ApiKey$/i, "").toLowerCase();

    // Validate keyType is one of the expected values
    if (!isValidKeyType(keyType)) {
      logger.error(`Invalid API key type requested: ${keyType}`);
      utilityProcess.postMessage({
        id,
        type: "settings:error",
        error: `Invalid API key type: ${keyType}`,
      });
      return;
    }

    const value = profileService.getApiKey(keyType);

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: value,
    });
  } else {
    // Regular setting - use storage service
    const value = storage.get(`settings.${key}`);

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: value,
    });
  }
}

async function handleSettingsSet(
  utilityProcess: UtilityProcess,
  message: any,
): Promise<void> {
  const { id, key, value } = message;
  const storage = getStorageService();

  try {
    if (apiKeyTypes.includes(key)) {
      const profileService = await getProfileService();
      const keyType = key.replace(/ApiKey$/i, "").toLowerCase();

      // Validate keyType is one of the expected values
      if (!isValidKeyType(keyType)) {
        logger.error(`Invalid API key type for set: ${keyType}`);
        utilityProcess.postMessage({
          id,
          type: "settings:error",
          error: `Invalid API key type: ${keyType}`,
        });
        return;
      }

      const success = profileService.setApiKey(keyType, value);

      utilityProcess.postMessage({
        id,
        type: "settings:response",
        data: success,
      });
    } else {
      // Regular setting - use storage service
      storage.set(`settings.${key}`, value);

      utilityProcess.postMessage({
        id,
        type: "settings:response",
        data: true,
      });
    }
  } catch (error) {
    logger.error(`Failed to set setting ${key}:`, error);
    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: false,
    });
  }
}

async function handleGetProfile(
  utilityProcess: UtilityProcess,
  message: any,
): Promise<void> {
  const { id } = message;

  try {
    const profileService = await getProfileService();
    const currentProfile = profileService.getCurrentProfile();

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: currentProfile?.id || null,
    });
  } catch (error) {
    logger.error("Failed to get current profile:", error);
    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: null,
    });
  }
}

async function handleGetAll(
  utilityProcess: UtilityProcess,
  message: any,
): Promise<void> {
  const { id } = message;
  const storage = getStorageService();

  try {
    // Get all settings from storage
    const allData: Record<string, any> = {};

    // Get all keys and filter for settings
    const keys = storage.keys();
    keys.forEach(key => {
      if (key.startsWith("settings.")) {
        const settingKey = key.replace("settings.", "");
        allData[settingKey] = storage.get(key);
      }
    });

    // Add profile preferences
    const profileService = await getProfileService();
    const preferences = profileService.getPreferences();
    Object.assign(allData, preferences);

    // Add masked API keys - only for valid key types
    const apiKeys = profileService.getAllApiKeys();
    Object.keys(apiKeys).forEach(keyType => {
      // Validate key type before including it
      if (isValidKeyType(keyType)) {
        allData[`${keyType}ApiKey`] = apiKeys[keyType] ? "********" : null;
      } else {
        logger.warn(`Skipping invalid API key type in getAllKeys: ${keyType}`);
      }
    });

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: allData,
    });
  } catch (error) {
    logger.error("Failed to get all settings:", error);
    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: {},
    });
  }
}

async function handleWatch(
  utilityProcess: UtilityProcessWithSettings,
  message: any,
): Promise<void> {
  const { id } = message;
  const storage = getStorageService();

  if (!utilityProcess._settingsWatchers) {
    utilityProcess._settingsWatchers = [];
  }

  // Watch storage changes
  const handleChange = (key: string, newValue: any, oldValue: any) => {
    // Only notify about settings changes
    if (key.startsWith("settings.")) {
      const settingKey = key.replace("settings.", "");
      utilityProcess.postMessage({
        type: "settings:changed",
        data: { key: settingKey, newValue, oldValue },
      });
    }
  };

  storage.on("change", handleChange);

  // Store the cleanup function
  utilityProcess._settingsWatchers.push(() => {
    storage.off("change", handleChange);
  });

  // Also watch profile changes for API keys
  const handleApiKeyChange = (data: any) => {
    if (data.keyType && isValidKeyType(data.keyType)) {
      utilityProcess.postMessage({
        type: "settings:changed",
        data: {
          key: `${data.keyType}ApiKey`,
          newValue: "********",
          oldValue: "********",
        },
      });
    } else if (data.keyType) {
      logger.warn(`Invalid API key type in change event: ${data.keyType}`);
    }
  };

  const profileService = await getProfileService();
  profileService.on("api-key-set", handleApiKeyChange);
  profileService.on("api-key-removed", handleApiKeyChange);

  utilityProcess._settingsWatchers.push(() => {
    profileService.off("api-key-set", handleApiKeyChange);
    profileService.off("api-key-removed", handleApiKeyChange);
  });

  utilityProcess.postMessage({
    id,
    type: "settings:response",
    data: true,
  });
}

function handleUnwatch(
  utilityProcess: UtilityProcessWithSettings,
  message: any,
): void {
  const { id } = message;

  if (utilityProcess._settingsWatchers) {
    utilityProcess._settingsWatchers.forEach(unwatch => unwatch());
    utilityProcess._settingsWatchers = [];
  }

  utilityProcess.postMessage({
    id,
    type: "settings:response",
    data: true,
  });
}
