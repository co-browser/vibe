import { ipcMain, IpcMainInvokeEvent } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { WindowBroadcast } from "@/utils/window-broadcast";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("settings-management");

/**
 * Settings CRUD handlers
 * Stores settings in user profile for persistence
 */

/**
 * Notify all windows about settings changes using optimized broadcasting
 */
function notifySettingsChange(key: string, value: any): void {
  WindowBroadcast.debouncedBroadcast("settings:changed", { key, value }, 50);
}

ipcMain.handle(
  "settings:get",
  async (_event: IpcMainInvokeEvent, key: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return null;
      }

      return activeProfile.settings?.[key] || null;
    } catch (error) {
      logger.error("Failed to get setting", { error });
      return null;
    }
  },
);

ipcMain.handle(
  "settings:set",
  async (_event: IpcMainInvokeEvent, key: string, value: unknown) => {
    try {
      // Runtime validation
      if (typeof key !== "string" || key.length === 0) {
        throw new Error("Invalid key provided");
      }

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      // Update profile settings
      const updatedSettings = {
        ...activeProfile.settings,
        [key]: value,
      };

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Notify all windows about the change
      notifySettingsChange(key, value);

      logger.info("Saved setting to profile", { key });
      return true;
    } catch (error) {
      logger.error("Failed to set setting", { error });
      return false;
    }
  },
);

ipcMain.handle(
  "settings:remove",
  async (_event: IpcMainInvokeEvent, key: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      // Remove key from profile settings
      const updatedSettings = { ...activeProfile.settings };
      delete updatedSettings[key];

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Notify all windows about the removal
      notifySettingsChange(key, null);

      logger.info("Removed setting from profile", { key });
      return true;
    } catch (error) {
      logger.error("Failed to remove setting", { error });
      return false;
    }
  },
);

ipcMain.handle("settings:get-all", async (_event: IpcMainInvokeEvent) => {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      return {};
    }

    return activeProfile.settings || {};
  } catch (error) {
    logger.error("Failed to get all settings", { error });
    return {};
  }
});

ipcMain.handle("settings:reset", async (_event: IpcMainInvokeEvent) => {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      return false;
    }

    // Reset to default settings
    const defaultSettings = {
      defaultSearchEngine: "google",
      theme: "light",
    };

    userProfileStore.updateProfile(activeProfile.id, {
      settings: defaultSettings,
    });

    // Notify all windows about the reset
    Object.keys(defaultSettings).forEach(key => {
      notifySettingsChange(key, defaultSettings[key]);
    });

    logger.info("Reset all settings to defaults");
    return true;
  } catch (error) {
    logger.error("Failed to reset settings", { error });
    return false;
  }
});

ipcMain.handle("settings:export", async (_event: IpcMainInvokeEvent) => {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      return JSON.stringify({});
    }

    const exportData = {
      version: "1.0",
      settings: activeProfile.settings || {},
      exportedAt: new Date().toISOString(),
    };

    logger.info("Exported settings");
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    logger.error("Failed to export settings", { error });
    return JSON.stringify({});
  }
});

ipcMain.handle(
  "settings:import",
  async (_event: IpcMainInvokeEvent, data: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      const importData = JSON.parse(data);

      // Validate import data
      if (!importData.settings || typeof importData.settings !== "object") {
        throw new Error("Invalid import data format");
      }

      // Merge with existing settings
      const updatedSettings = {
        ...activeProfile.settings,
        ...importData.settings,
      };

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Notify all windows about the changes
      Object.entries(importData.settings).forEach(([key, value]) => {
        notifySettingsChange(key, value);
      });

      logger.info("Imported settings successfully");
      return true;
    } catch (error) {
      logger.error("Failed to import settings", { error });
      return false;
    }
  },
);

// Settings modal close handler (moved from settings-management.ts)
ipcMain.on("settings-modal:close", event => {
  // Forward the close event to the renderer process
  event.sender.send("settings-modal:close");
});

// Component visibility settings
ipcMain.handle(
  "settings:get-components",
  async (_event: IpcMainInvokeEvent) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: true, settings: {} };
      }

      // Get component settings from profile
      const componentSettings = activeProfile.settings?.components || {};

      return {
        success: true,
        settings: componentSettings,
      };
    } catch (error) {
      logger.error("Failed to get component settings", { error });
      return { success: false, settings: {} };
    }
  },
);

ipcMain.handle(
  "settings:update-components",
  async (_event: IpcMainInvokeEvent, updates: Record<string, boolean>) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false };
      }

      // Update component settings
      const updatedSettings = {
        ...activeProfile.settings,
        components: {
          ...(activeProfile.settings?.components || {}),
          ...updates,
        },
      };

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Notify windows about component changes
      notifySettingsChange("components", updatedSettings.components);

      return { success: true };
    } catch (error) {
      logger.error("Failed to update component settings", { error });
      return { success: false };
    }
  },
);

// Notifications settings
ipcMain.handle(
  "settings:get-notifications",
  async (_event: IpcMainInvokeEvent) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: true, settings: {} };
      }

      // Get notification settings from profile
      const notificationSettings = activeProfile.settings?.notifications || {};

      return {
        success: true,
        settings: notificationSettings,
      };
    } catch (error) {
      logger.error("Failed to get notification settings", { error });
      return { success: false, settings: {} };
    }
  },
);

ipcMain.handle(
  "settings:update-notifications",
  async (_event: IpcMainInvokeEvent, updates: Record<string, boolean>) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false };
      }

      // Update notification settings
      const updatedSettings = {
        ...activeProfile.settings,
        notifications: {
          ...(activeProfile.settings?.notifications || {}),
          ...updates,
        },
      };

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Notify windows about notification changes
      notifySettingsChange("notifications", updatedSettings.notifications);

      return { success: true };
    } catch (error) {
      logger.error("Failed to update notification settings", { error });
      return { success: false };
    }
  },
);
