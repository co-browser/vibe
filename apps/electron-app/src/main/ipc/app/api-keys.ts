import { ipcMain, IpcMainInvokeEvent } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";

/**
 * API key management handlers
 * Stores API keys securely using encrypted profile storage
 */

ipcMain.handle(
  "get-api-key",
  async (_event: IpcMainInvokeEvent, keyName: string) => {
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

      // First try to get from secure settings (encrypted)
      const secureValue = await userProfileStore.getSecureSetting(
        activeProfile.id,
        profileKey,
      );
      if (secureValue) {
        return secureValue;
      }

      // Fallback: check if it exists in plain text settings (for migration)
      const plainTextValue = activeProfile.settings?.[profileKey];
      if (plainTextValue) {
        // Migrate to secure storage
        console.log(
          `[API Keys] Migrating ${keyName} API key to secure storage`,
        );
        await userProfileStore.setSecureSetting(
          activeProfile.id,
          profileKey,
          plainTextValue,
        );

        // Remove from plain text settings
        const updatedSettings = { ...activeProfile.settings };
        delete updatedSettings[profileKey];
        userProfileStore.updateProfile(activeProfile.id, {
          settings: updatedSettings,
        });

        return plainTextValue;
      }

      return null;
    } catch (error) {
      console.error("[API Keys] Failed to get API key:", error);
      return null;
    }
  },
);

ipcMain.handle(
  "set-api-key",
  async (_event: IpcMainInvokeEvent, keyName: string, value: string) => {
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

      // Store in secure settings (encrypted)
      await userProfileStore.setSecureSetting(
        activeProfile.id,
        profileKey,
        value,
      );

      // Remove from plain text settings if it exists there
      if (activeProfile.settings?.[profileKey]) {
        const updatedSettings = { ...activeProfile.settings };
        delete updatedSettings[profileKey];
        userProfileStore.updateProfile(activeProfile.id, {
          settings: updatedSettings,
        });
      }

      // Also update environment variable for OpenAI (for backward compatibility)
      if (keyName === "openai") {
        process.env.OPENAI_API_KEY = value;
      }

      console.log(`[API Keys] Saved ${keyName} API key to secure storage`);
      return true;
    } catch (error) {
      console.error("[API Keys] Failed to set API key:", error);
      return false;
    }
  },
);
