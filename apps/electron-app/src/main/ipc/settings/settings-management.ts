import { ipcMain, IpcMainInvokeEvent } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { WindowBroadcast } from "@/utils/window-broadcast";

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
      console.error("[Settings] Failed to get setting:", error);
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

      console.log(`[Settings] Saved setting ${key} to profile`);
      return true;
    } catch (error) {
      console.error("[Settings] Failed to set setting:", error);
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

      console.log(`[Settings] Removed setting ${key} from profile`);
      return true;
    } catch (error) {
      console.error("[Settings] Failed to remove setting:", error);
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
    console.error("[Settings] Failed to get all settings:", error);
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

    console.log("[Settings] Reset all settings to defaults");
    return true;
  } catch (error) {
    console.error("[Settings] Failed to reset settings:", error);
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

    console.log("[Settings] Exported settings");
    return JSON.stringify(exportData, null, 2);
  } catch (error) {
    console.error("[Settings] Failed to export settings:", error);
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

      console.log("[Settings] Imported settings successfully");
      return true;
    } catch (error) {
      console.error("[Settings] Failed to import settings:", error);
      return false;
    }
  },
);

// Settings modal close handler (moved from settings-management.ts)
ipcMain.on("settings-modal:close", event => {
  // Forward the close event to the renderer process
  event.sender.send("settings-modal:close");
});
