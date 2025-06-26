import { ipcMain, dialog, app } from "electron";
import { settingsStore, secureStore, userDataStore } from "../../persistent";
import { createLogger } from "@vibe/shared-types";
import { writeFile, readFile } from "fs/promises";
import { join } from "path";

const logger = createLogger("settings-management");

/**
 * Settings management handlers
 * Direct approach - no registration functions needed
 */

// Reset all settings to defaults
ipcMain.handle("settings:reset", async () => {
  try {
    logger.info("Resetting all settings to defaults");

    // Clear all stores
    settingsStore.clear();
    userDataStore.clear();
    // Don't clear secure store as it contains API keys that might be hard to recover

    // Reset to default values
    settingsStore.set("theme", "system");
    settingsStore.set("language", "en");
    settingsStore.set("windowBounds", {});
    settingsStore.set("preferences", {});

    userDataStore.set("bookmarks", []);
    userDataStore.set("history", []);
    userDataStore.set("tabs", []);
    userDataStore.set("sessions", []);

    logger.info("Settings reset successfully");
    return true;
  } catch (error) {
    logger.error("Failed to reset settings:", error);
    return false;
  }
});

// Export settings to JSON file
ipcMain.handle("settings:export", async () => {
  try {
    // Gather all settings
    const exportData = {
      version: app.getVersion(),
      exportDate: new Date().toISOString(),
      settings: settingsStore.getAll(),
      userData: userDataStore.getAll(),
      // Don't export secure data - mask it instead
      hasApiKeys: {
        openai: secureStore.has("openaiApiKey"),
        anthropic: secureStore.has("anthropicApiKey"),
        llm: secureStore.has("llmApiKey"),
        vector: secureStore.has("vectorApiKey"),
      },
    };

    // Show save dialog
    const result = await dialog.showSaveDialog({
      title: "Export Settings",
      defaultPath: join(
        app.getPath("downloads"),
        `vibe-settings-${Date.now()}.json`,
      ),
      filters: [
        { name: "JSON Files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (!result.canceled && result.filePath) {
      await writeFile(result.filePath, JSON.stringify(exportData, null, 2));
      logger.info(`Settings exported to: ${result.filePath}`);
      return result.filePath;
    }

    return null;
  } catch (error) {
    logger.error("Failed to export settings:", error);
    throw error;
  }
});

// Import settings from JSON file
ipcMain.handle("settings:import", async () => {
  try {
    // Show open dialog
    const result = await dialog.showOpenDialog({
      title: "Import Settings",
      filters: [
        { name: "JSON Files", extensions: ["json"] },
        { name: "All Files", extensions: ["*"] },
      ],
      properties: ["openFile"],
    });

    if (!result.canceled && result.filePaths.length > 0) {
      const filePath = result.filePaths[0];
      const fileContent = await readFile(filePath, "utf-8");
      const importData = JSON.parse(fileContent);

      // Validate import data
      if (!importData.settings || !importData.userData) {
        throw new Error("Invalid settings file format");
      }

      // Confirm import
      const confirmResult = await dialog.showMessageBox({
        type: "question",
        buttons: ["Import", "Cancel"],
        defaultId: 0,
        title: "Import Settings",
        message: "Import settings from file?",
        detail: `This will replace your current settings with the imported ones.\n\nFile: ${filePath}\nExported: ${importData.exportDate || "Unknown"}\nVersion: ${importData.version || "Unknown"}`,
      });

      if (confirmResult.response === 0) {
        // Import settings
        Object.entries(importData.settings).forEach(([key, value]) => {
          settingsStore.set(key, value);
        });

        Object.entries(importData.userData).forEach(([key, value]) => {
          userDataStore.set(key, value);
        });

        logger.info(`Settings imported from: ${filePath}`);
        return true;
      }
    }

    return false;
  } catch (error) {
    logger.error("Failed to import settings:", error);

    await dialog.showErrorBox(
      "Import Failed",
      `Failed to import settings: ${error instanceof Error ? error.message : "Unknown error"}`,
    );

    return false;
  }
});

// Watch for settings changes
ipcMain.handle("settings:watch", async event => {
  const watchers: (() => void)[] = [];

  try {
    // Watch general settings changes
    const settingsWatcher = settingsStore.onDidAnyChange(
      (newValue, oldValue) => {
        event.sender.send("settings:changed", {
          store: "settings",
          newValue,
          oldValue,
        });
      },
    );
    watchers.push(settingsWatcher);

    // Watch user data changes
    const userDataWatcher = userDataStore.onDidAnyChange(
      (newValue, oldValue) => {
        event.sender.send("settings:changed", {
          store: "userData",
          newValue,
          oldValue,
        });
      },
    );
    watchers.push(userDataWatcher);

    // Clean up watchers when window closes
    event.sender.on("destroyed", () => {
      watchers.forEach(unwatch => unwatch());
    });

    return true;
  } catch (error) {
    logger.error("Failed to setup settings watchers:", error);
    return false;
  }
});

// Get all settings for display in settings window
ipcMain.handle("settings:get-all-for-display", async () => {
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

    return {
      settings,
      userData,
      secure: maskedSecure,
    };
  } catch (error) {
    logger.error("Failed to get all settings for display:", error);
    return {
      settings: {},
      userData: {},
      secure: {},
    };
  }
});
