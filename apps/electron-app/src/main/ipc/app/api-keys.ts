import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";

/**
 * WARNING: Do NOT store API keys in plain text for production use.
 * Use secure storage (e.g., OS keychain, Electron safeStorage, or encryption) to protect sensitive credentials.
 */

/**
 * API key management handlers
 * Stores API keys in user profile for persistence
 */

ipcMain.handle("get-api-key", async (_event: any, keyName: string) => {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      return null;
    }

    // Map key names to profile storage keys
    const keyMap: Record<string, string> = {
      openai: "openai_api_key",
      turbopuffer: "turbopuffer_api_key",
    };

    const profileKey = keyMap[keyName];
    if (!profileKey) {
      return null;
    }

    return activeProfile.settings?.[profileKey] || null;
  } catch (error) {
    console.error("[API Keys] Failed to get API key:", error);
    return null;
  }
});

ipcMain.handle(
  "set-api-key",
  async (_event: any, keyName: string, value: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return false;
      }

      // Map key names to profile storage keys
      const keyMap: Record<string, string> = {
        openai: "openai_api_key",
        turbopuffer: "turbopuffer_api_key",
      };

      const profileKey = keyMap[keyName];
      if (!profileKey) {
        return false;
      }

      // Update profile settings
      const updatedSettings = {
        ...activeProfile.settings,
        [profileKey]: value,
      };

      userProfileStore.updateProfile(activeProfile.id, {
        settings: updatedSettings,
      });

      // Also update environment variable for OpenAI (for backward compatibility)
      if (keyName === "openai") {
        process.env.OPENAI_API_KEY = value;
      }

      console.log(`[API Keys] Saved ${keyName} API key to profile`);
      return true;
    } catch (error) {
      console.error("[API Keys] Failed to set API key:", error);
      return false;
    }
  },
);
