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
    console.log(`[Settings CRUD] Getting setting "${key}"`);

    // Check if it's a sensitive setting that should be in secure store
    const sensitiveKeys = [
      "llmApiKey",
      "vectorApiKey",
      "openaiApiKey",
      "anthropicApiKey",
    ];

    let value;
    if (sensitiveKeys.includes(key)) {
      value = secureStore.get(key);
      console.log(
        `[Settings CRUD] Retrieved sensitive setting "${key}" from secure store: ${value ? "***" : "null"}`,
      );
    } else {
      value = settingsStore.get(key);
      console.log(
        `[Settings CRUD] Retrieved setting "${key}" from settings store:`,
        value,
      );
    }

    return value;
  } catch (error) {
    logger.error(`Failed to get setting "${key}":`, error);
    console.error(`[Settings CRUD] Error getting setting "${key}":`, error);
    return null;
  }
});

ipcMain.handle("settings:set", async (_event, key: string, value: any) => {
  try {
    console.log(
      `[Settings CRUD] Setting "${key}" to:`,
      key.includes("ApiKey") ? "***" : value,
    );

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
      console.log(
        `[Settings CRUD] Saved sensitive setting "${key}" to secure store`,
      );

      // Verify it was saved
      const verifyValue = secureStore.get(key);
      console.log(
        `[Settings CRUD] Verification - "${key}" saved: ${verifyValue === value}`,
      );
    } else {
      settingsStore.set(key, value);
      logger.debug(`Set setting "${key}" in settings store`);
      console.log(`[Settings CRUD] Saved setting "${key}" to settings store`);

      // Verify it was saved
      const verifyValue = settingsStore.get(key);
      console.log(
        `[Settings CRUD] Verification - "${key}" saved:`,
        verifyValue === value,
      );
    }

    return true;
  } catch (error) {
    logger.error(`Failed to set setting "${key}":`, error);
    console.error(`[Settings CRUD] Error setting "${key}":`, error);
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
