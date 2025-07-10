import { globalShortcut } from "electron";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "@/store/user-profile-store";

const logger = createLogger("hotkey-manager");

// Default hotkey for password paste
const DEFAULT_PASSWORD_PASTE_HOTKEY = "CommandOrControl+Shift+P";

// Currently registered hotkeys
const registeredHotkeys = new Map<string, string>();

/**
 * Register a global hotkey
 */
export function registerHotkey(hotkey: string, action: () => void): boolean {
  try {
    // Unregister existing hotkey if it exists
    if (registeredHotkeys.has(hotkey)) {
      globalShortcut.unregister(hotkey);
      registeredHotkeys.delete(hotkey);
    }

    // Register new hotkey
    const success = globalShortcut.register(hotkey, action);
    if (success) {
      registeredHotkeys.set(hotkey, action.name);
      logger.info(`Registered hotkey: ${hotkey}`);
    } else {
      logger.error(`Failed to register hotkey: ${hotkey}`);
    }
    return success;
  } catch (error) {
    logger.error(`Error registering hotkey ${hotkey}:`, error);
    return false;
  }
}

/**
 * Unregister a global hotkey
 */
export function unregisterHotkey(hotkey: string): boolean {
  try {
    globalShortcut.unregister(hotkey);
    registeredHotkeys.delete(hotkey);
    logger.info(`Unregistered hotkey: ${hotkey}`);
    return true;
  } catch (error) {
    logger.error(`Error unregistering hotkey ${hotkey}:`, error);
    return false;
  }
}

/**
 * Get the current password paste hotkey from settings
 */
export function getPasswordPasteHotkey(): string {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();
    return (
      activeProfile?.settings?.hotkeys?.passwordPaste ||
      DEFAULT_PASSWORD_PASTE_HOTKEY
    );
  } catch (error) {
    logger.error("Failed to get password paste hotkey from settings:", error);
    return DEFAULT_PASSWORD_PASTE_HOTKEY;
  }
}

/**
 * Set the password paste hotkey in settings
 */
export function setPasswordPasteHotkey(hotkey: string): boolean {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      logger.error("No active profile found");
      return false;
    }

    // Update profile settings
    const updatedSettings = {
      ...activeProfile.settings,
      hotkeys: {
        ...activeProfile.settings?.hotkeys,
        passwordPaste: hotkey,
      },
    };

    userProfileStore.updateProfile(activeProfile.id, {
      settings: updatedSettings,
    });

    logger.info(`Password paste hotkey updated to: ${hotkey}`);
    return true;
  } catch (error) {
    logger.error("Failed to set password paste hotkey:", error);
    return false;
  }
}

/**
 * Initialize password paste hotkey
 */
export function initializePasswordPasteHotkey(): boolean {
  try {
    const hotkey = getPasswordPasteHotkey();

    const action = async () => {
      try {
        // Import the password paste function directly
        const { pastePasswordForActiveTab } = await import(
          "./password-paste-handler"
        );
        const result = await pastePasswordForActiveTab();
        if (result.success) {
          logger.info("Password pasted successfully via hotkey");
        } else {
          logger.warn("Failed to paste password via hotkey:", result.error);
        }
      } catch (error) {
        logger.error("Error in password paste hotkey action:", error);
      }
    };

    return registerHotkey(hotkey, action);
  } catch (error) {
    logger.error("Failed to initialize password paste hotkey:", error);
    return false;
  }
}

/**
 * Update password paste hotkey
 */
export function updatePasswordPasteHotkey(newHotkey: string): boolean {
  try {
    const oldHotkey = getPasswordPasteHotkey();

    // Unregister old hotkey
    unregisterHotkey(oldHotkey);

    // Set new hotkey in settings
    const success = setPasswordPasteHotkey(newHotkey);
    if (!success) {
      return false;
    }

    // Register new hotkey
    return initializePasswordPasteHotkey();
  } catch (error) {
    logger.error("Failed to update password paste hotkey:", error);
    return false;
  }
}

/**
 * Get all registered hotkeys
 */
export function getRegisteredHotkeys(): Map<string, string> {
  return new Map(registeredHotkeys);
}

/**
 * Cleanup all registered hotkeys
 */
export function cleanupHotkeys(): void {
  try {
    registeredHotkeys.forEach((_actionName, hotkey) => {
      globalShortcut.unregister(hotkey);
      logger.info(`Cleaned up hotkey: ${hotkey}`);
    });
    registeredHotkeys.clear();
  } catch (error) {
    logger.error("Error cleaning up hotkeys:", error);
  }
}
