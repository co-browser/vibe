import { safeStorage, systemPreferences } from "electron";
import Store from "electron-store";
import { Entry } from "@napi-rs/keyring";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("DesktopStore");

export enum VibeDict {
  UpdateSettings = "updateSettings",
  Theme = "theme",
  EncryptedData = "EncryptedData",
  Language = "language",
  DisableKeyboardShortcuts = "disableKeyboardShortcuts",
  ASCFile = "ascFile",
  UpdateBuildNumber = "updateBuildNumber",
  WindowBounds = "windowBounds",
  DevTools = "devTools",
}

export type IDesktopVibeUpdateSettings = {
  useTestFeedUrl: boolean;
};

export type IDesktopVibeMap = {
  [VibeDict.WindowBounds]: Electron.Rectangle;
  [VibeDict.UpdateSettings]: IDesktopVibeUpdateSettings;
  [VibeDict.DevTools]: boolean;
  [VibeDict.Theme]: string;
  [VibeDict.EncryptedData]: Record<string, string>;
  [VibeDict.DisableKeyboardShortcuts]: {
    disableAllShortcuts: boolean;
  };
  [VibeDict.ASCFile]: string;
  [VibeDict.UpdateBuildNumber]: string;
};

const store = new Store<IDesktopVibeMap>({ name: "cobrowser" });

export const instance = store;

export const clear = () => {
  store.clear();
};

export const getUpdateSettings = () =>
  store.get(VibeDict.UpdateSettings, {
    useTestFeedUrl: false,
  });

export const setUpdateSettings = (
  updateSettings: IDesktopVibeUpdateSettings,
): void => {
  store.set(VibeDict.UpdateSettings, updateSettings);
};

export const getSecureItem = (key: string) => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error("safeStorage is not available");
    return undefined;
  }
  const item = store.get(VibeDict.EncryptedData, {});
  const value = item[key];
  if (value) {
    try {
      const result = safeStorage.decryptString(Buffer.from(value, "hex"));
      return result;
    } catch {
      logger.error(`failed to decrypt ${key}`);
      return undefined;
    }
  }
  return undefined;
};

export const setSecureItem = (key: string, value: string): void => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error("safeStorage is not available");
    return;
  }
  try {
    const items = store.get(VibeDict.EncryptedData, {});
    items[key] = safeStorage.encryptString(value).toString("hex");
    store.set(VibeDict.EncryptedData, items);
  } catch {
    logger.error(`failed to encrypt ${key}`);
  }
};

export const deleteSecureItem = (key: string) => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error("safeStorage is not available");
    return;
  }
  const items = store.get(VibeDict.EncryptedData, {});
  delete items[key];
  store.set(VibeDict.EncryptedData, items);
};

export const setUpdateBuildNumber = (buildNumber: string) => {
  store.set(VibeDict.UpdateBuildNumber, buildNumber);
};

export const getUpdateBuildNumber = () =>
  store.get(VibeDict.UpdateBuildNumber, "");

export const clearUpdateBuildNumber = () => {
  store.delete(VibeDict.UpdateBuildNumber);
};

// Additional utility functions for other store keys
export const getTheme = () => store.get(VibeDict.Theme, "system");
export const setTheme = (theme: string) => store.set(VibeDict.Theme, theme);

export const getLanguage = () => store.get(VibeDict.Language, "en");
export const setLanguage = (language: string) =>
  store.set(VibeDict.Language, language);

export const getDevTools = () => store.get(VibeDict.DevTools, false);
export const setDevTools = (enabled: boolean) =>
  store.set(VibeDict.DevTools, enabled);

export const getWindowBounds = () => store.get(VibeDict.WindowBounds);
export const setWindowBounds = (bounds: Electron.Rectangle) =>
  store.set(VibeDict.WindowBounds, bounds);

export const getKeyboardShortcutsDisabled = () =>
  store.get(VibeDict.DisableKeyboardShortcuts, { disableAllShortcuts: false });
export const setKeyboardShortcutsDisabled = (disabled: {
  disableAllShortcuts: boolean;
}) => store.set(VibeDict.DisableKeyboardShortcuts, disabled);

export const getASCFile = () => store.get(VibeDict.ASCFile, "");
export const setASCFile = (ascFile: string) =>
  store.set(VibeDict.ASCFile, ascFile);

export const NewUserStore = async (
  reason: string = "Authenticate to access secure storage",
): Promise<boolean> => {
  let randomPassword: string | null = null;

  try {
    // Check if Touch ID is available
    if (!systemPreferences.canPromptTouchID()) {
      logger.warn("Touch ID is not available on this system");
      return false;
    }

    // Prompt for Touch ID authentication
    try {
      await systemPreferences.promptTouchID(reason);
      // If we reach here, authentication was successful
    } catch (authError) {
      logger.warn(
        "Touch ID authentication failed or was cancelled:",
        authError,
      );
      return false;
    }

    // Create a random password using system time and other randomness
    const timestamp = Date.now().toString();
    const randomBytes = crypto.randomBytes(32);
    const randomHex = randomBytes.toString('hex');
    const randomHex = Array.from(randomBytes, byte =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    randomPassword = `${timestamp}-${randomHex}-${Math.random().toString(36).substring(2)}`;

    // Store the password in the system keychain
    const entry = new Entry("xyz.cobrowser.vibe", "encrypted_store");
    entry.setPassword(randomPassword);
    const storedPassword = entry.getPassword();

    if (!storedPassword) {
      logger.error("Failed to store password in keychain");
      return false;
    }

    // Store the password reference in our VibeDict
    setSecureItem("keychain_password", storedPassword);

    // Also store a flag indicating Touch ID was used for initialization
    setSecureItem("touch_id_initialized", "true");

    logger.info(
      "New user store initialized successfully with Touch ID authentication",
    );
    return true;
  } catch (error) {
    logger.error("Error in NewUserStore:", error);
    return false;
  } finally {
    // Clear sensitive data from memory
    if (randomPassword) {
      // Overwrite the string with zeros to clear it from memory
      randomPassword = "0".repeat(randomPassword.length);
      randomPassword = null;
    }
  }
};

export const UserDataRecover = async (): Promise<boolean> => {
  try {
    // Get the password from the system keychain
    const entry = new Entry("xyz.cobrowser.vibe", "encrypted_store");
    const password = entry.getPassword();

    if (!password) {
      logger.error("No password found in system keychain");
      return false;
    }

    // Get all encrypted data from the store
    const encryptedData = store.get(VibeDict.EncryptedData, {});

    if (Object.keys(encryptedData).length === 0) {
      logger.info("No encrypted data found to recover");
      return true;
    }

    // Decrypt all encrypted data using the keychain password
    const decryptedData: Record<string, string> = {};

    for (const [key, encryptedValue] of Object.entries(encryptedData)) {
      try {
        // Skip the keychain_password key as it's the reference, not encrypted data
        if (key === "keychain_password") {
          continue;
        }

        // Decrypt the value using the keychain password
        const decryptedValue = safeStorage.decryptString(
          Buffer.from(encryptedValue, "hex"),
        );
        decryptedData[key] = decryptedValue;

        logger.debug(`Successfully decrypted data for key: ${key}`);
      } catch (decryptError) {
        logger.error(`Failed to decrypt data for key ${key}:`, decryptError);
        // Continue with other keys even if one fails
      }
    }

    // Store the decrypted data in a format that Electron can use
    // We'll store it in a special decrypted_data key for easy access
    if (Object.keys(decryptedData).length > 0) {
      setSecureItem("decrypted_data", JSON.stringify(decryptedData));

      // Also set up individual keys for easier access
      for (const [key, value] of Object.entries(decryptedData)) {
        setSecureItem(`recovered_${key}`, value);
      }

      logger.info(
        `Successfully recovered ${Object.keys(decryptedData).length} encrypted data items`,
      );
      return true;
    } else {
      logger.warn("No data was successfully decrypted");
      return false;
    }
  } catch (error) {
    logger.error("Error in UserDataRecover:", error);
    return false;
  }
};

// Helper function to get recovered data
export const getRecoveredData = (key: string): string | undefined => {
  return getSecureItem(`recovered_${key}`);
};

// Helper function to get all recovered data
export const getAllRecoveredData = (): Record<string, string> => {
  const decryptedDataJson = getSecureItem("decrypted_data");
  if (decryptedDataJson) {
    try {
      return JSON.parse(decryptedDataJson);
    } catch (error) {
      logger.error("Failed to parse recovered data:", error);
      return {};
    }
  }
  return {};
};
