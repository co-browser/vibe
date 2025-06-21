import { ipcMain } from "electron";
import { secureStore, settingsStore } from "../../persistent/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("SettingsCRUD");

/**
 * Settings CRUD handlers
 * Uses secure store for sensitive data and settings store for general settings
 */

ipcMain.handle("settings:get", async (_event, key: string) => {
  try {
    // Check if it's a sensitive setting that should be in secure store
    const sensitiveKeys = [
      "llmApiKey",
      "vectorApiKey",
      "openaiApiKey",
      "anthropicApiKey",
    ];

    if (sensitiveKeys.includes(key)) {
      return secureStore.get(key);
    } else {
      return settingsStore.get(key);
    }
  } catch (error) {
    logger.error(`Failed to get setting "${key}":`, error);
    return null;
  }
});

ipcMain.handle("settings:set", async (_event, key: string, value: any) => {
  try {
    // Check if it's a sensitive setting that should be in secure store
    const sensitiveKeys = [
      "llmApiKey",
      "vectorApiKey",
      "openaiApiKey",
      "anthropicApiKey",
    ];

    if (sensitiveKeys.includes(key)) {
      secureStore.set(key, value);
      logger.debug(`Set sensitive setting "${key}" in secure store`);
    } else {
      settingsStore.set(key, value);
      logger.debug(`Set setting "${key}" in settings store`);
    }

    return true;
  } catch (error) {
    logger.error(`Failed to set setting "${key}":`, error);
    return false;
  }
});

ipcMain.handle("settings:remove", async (_event, key: string) => {
  try {
    // Check if it's a sensitive setting that should be in secure store
    const sensitiveKeys = [
      "llmApiKey",
      "vectorApiKey",
      "openaiApiKey",
      "anthropicApiKey",
    ];

    if (sensitiveKeys.includes(key)) {
      secureStore.delete(key);
      logger.debug(`Removed sensitive setting "${key}" from secure store`);
    } else {
      settingsStore.delete(key);
      logger.debug(`Removed setting "${key}" from settings store`);
    }

    return true;
  } catch (error) {
    logger.error(`Failed to remove setting "${key}":`, error);
    return false;
  }
});

ipcMain.handle("settings:get-all", async () => {
  try {
    // Get all settings from both stores
    const generalSettings = settingsStore.getAll();
    const secureSettings = secureStore.getAll();

    // Filter out sensitive keys from secure settings for security
    const {
      llmApiKey,
      vectorApiKey,
      openaiApiKey,
      anthropicApiKey,
      ...nonSensitiveSecure
    } = secureSettings;

    return {
      ...generalSettings,
      ...nonSensitiveSecure,
      // Only return if API keys exist (don't expose empty values)
      ...(llmApiKey && { llmApiKey: "***" }),
      ...(vectorApiKey && { vectorApiKey: "***" }),
      ...(openaiApiKey && { openaiApiKey: "***" }),
      ...(anthropicApiKey && { anthropicApiKey: "***" }),
    };
  } catch (error) {
    logger.error("Failed to get all settings:", error);
    return {};
  }
});
