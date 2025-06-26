/**
 * Main Process Settings Handler for Utility Processes
 * Handles settings requests from utility processes and forwards responses
 */

import { UtilityProcess } from "electron";
import { settingsStore, secureStore, userDataStore } from "../../persistent";
import { getProfileService } from "../../services/profile-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("utility-process-settings");

interface UtilityProcessWithSettings extends UtilityProcess {
  _settingsWatchers?: Array<() => void>;
}

/**
 * Set up settings handlers for a utility process
 * Call this after creating a utility process to enable settings access
 */
export function setupUtilityProcessSettings(
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

function handleSettingsGet(utilityProcess: UtilityProcess, message: any): void {
  const { id, key } = message;

  // Check if it's a sensitive setting
  const sensitiveKeys = [
    "llmApiKey",
    "vectorApiKey",
    "openaiApiKey",
    "anthropicApiKey",
  ];

  let value;
  if (sensitiveKeys.includes(key)) {
    value = secureStore.get(key);
  } else {
    value = settingsStore.get(key);
  }

  utilityProcess.postMessage({
    id,
    type: "settings:response",
    data: value,
  });
}

function handleSettingsSet(utilityProcess: UtilityProcess, message: any): void {
  const { id, key, value } = message;

  // Check if it's a sensitive setting
  const sensitiveKeys = [
    "llmApiKey",
    "vectorApiKey",
    "openaiApiKey",
    "anthropicApiKey",
  ];

  try {
    if (sensitiveKeys.includes(key)) {
      secureStore.set(key, value);
    } else {
      settingsStore.set(key, value);
    }

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: true,
    });
  } catch (error) {
    logger.error(`Failed to set setting ${key}:`, error);
    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: false,
    });
  }
}

function handleGetProfile(utilityProcess: UtilityProcess, message: any): void {
  const { id } = message;

  try {
    const profileService = getProfileService();
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

function handleGetAll(utilityProcess: UtilityProcess, message: any): void {
  const { id } = message;

  try {
    const settings = settingsStore.getAll();
    const userData = userDataStore.getAll();
    const secureData = secureStore.getAll();

    // Mask sensitive data
    const maskedSecure: Record<string, any> = {};
    Object.keys(secureData).forEach(key => {
      if (
        key.includes("Key") ||
        key.includes("token") ||
        key.includes("password")
      ) {
        maskedSecure[key] = secureData[key] ? "********" : null;
      } else {
        maskedSecure[key] = secureData[key];
      }
    });

    utilityProcess.postMessage({
      id,
      type: "settings:response",
      data: {
        ...settings,
        ...userData,
        ...maskedSecure,
      },
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

function handleWatch(
  utilityProcess: UtilityProcessWithSettings,
  message: any,
): void {
  const { id } = message;

  if (!utilityProcess._settingsWatchers) {
    utilityProcess._settingsWatchers = [];
  }

  // Watch settings store changes
  const settingsWatcher = settingsStore.onDidAnyChange((newValue, oldValue) => {
    // Find which keys changed
    const allKeys = new Set([
      ...Object.keys(newValue),
      ...Object.keys(oldValue),
    ]);
    for (const key of allKeys) {
      if (newValue[key] !== oldValue[key]) {
        utilityProcess.postMessage({
          type: "settings:changed",
          data: { key, newValue: newValue[key], oldValue: oldValue[key] },
        });
      }
    }
  });
  utilityProcess._settingsWatchers.push(settingsWatcher);

  // Watch user data store changes
  const userDataWatcher = userDataStore.onDidAnyChange((newValue, oldValue) => {
    // Find which keys changed
    const allKeys = new Set([
      ...Object.keys(newValue),
      ...Object.keys(oldValue),
    ]);
    for (const key of allKeys) {
      if (newValue[key] !== oldValue[key]) {
        utilityProcess.postMessage({
          type: "settings:changed",
          data: { key, newValue: newValue[key], oldValue: oldValue[key] },
        });
      }
    }
  });
  utilityProcess._settingsWatchers.push(userDataWatcher);

  // Watch secure store changes (only notify, don't send actual values)
  const secureWatcher = secureStore.onDidAnyChange((newValue, oldValue) => {
    // Find which keys changed
    const allKeys = new Set([
      ...Object.keys(newValue),
      ...Object.keys(oldValue),
    ]);
    for (const key of allKeys) {
      if (newValue[key] !== oldValue[key]) {
        utilityProcess.postMessage({
          type: "settings:changed",
          data: {
            key,
            newValue: newValue[key] ? "********" : null,
            oldValue: oldValue[key] ? "********" : null,
          },
        });
      }
    }
  });
  utilityProcess._settingsWatchers.push(secureWatcher);

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
