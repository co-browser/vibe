import { safeStorage, systemPreferences, app } from "electron";
import Store from "electron-store";
import { Entry } from "@napi-rs/keyring";
import { createLogger } from "@vibe/shared-types";
import { randomBytes } from "crypto";

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

// Special key for storing the encrypted blob
const ENCRYPTED_BLOB_KEY = "__vibe_encrypted_blob__";
const STORE_INITIALIZED_KEY = "__vibe_store_initialized__";

export type IDesktopVibeUpdateSettings = {
  useTestFeedUrl: boolean;
};

export type IDesktopVibeMap = {
  [VibeDict.WindowBounds]: Electron.Rectangle;
  [VibeDict.UpdateSettings]: IDesktopVibeUpdateSettings;
  [VibeDict.DevTools]: boolean;
  [VibeDict.Theme]: string;
  [VibeDict.EncryptedData]: Record<string, string>;
  [VibeDict.Language]: string;
  [VibeDict.DisableKeyboardShortcuts]: {
    disableAllShortcuts: boolean;
  };
  [VibeDict.ASCFile]: string;
  [VibeDict.UpdateBuildNumber]: string;
};

// Runtime storage for plain items (in-memory)
const plainStore = new Map<string, any>();

// Runtime storage for secure items (encrypted individually)
const secureStore = new Map<string, string>();

// Persistent store only for the encrypted blob
const store = new Store<{ [key: string]: string }>({ name: "cobrowser" });

export const instance = store;

export const clear = () => {
  plainStore.clear();
  secureStore.clear();
  store.clear();
};

// Check if store has been initialized
export const isStoreInitialized = () => {
  return plainStore.get(STORE_INITIALIZED_KEY) === true;
};

export const getUpdateSettings = () => {
  const value = plainStore.get(VibeDict.UpdateSettings);
  return value || { useTestFeedUrl: false };
};

export const setUpdateSettings = (
  updateSettings: IDesktopVibeUpdateSettings,
): void => {
  plainStore.set(VibeDict.UpdateSettings, updateSettings);
};

export const getSecureItem = (key: string) => {
  if (!key || typeof key !== "string" || key.length > 256) {
    return undefined;
  }

  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error("safeStorage is not available");
    return undefined;
  }

  // Get encrypted value from runtime secure store
  const encryptedValue = secureStore.get(key);
  if (encryptedValue) {
    try {
      // Decrypt on-demand when requested
      const result = safeStorage.decryptString(
        Buffer.from(encryptedValue, "hex"),
      );
      return result;
    } catch {
      logger.error("Failed to decrypt secure item");
      return undefined;
    }
  }
  return undefined;
};

export const setSecureItem = (key: string, value: string): void => {
  if (!key || typeof key !== "string" || key.length > 256) {
    throw new Error("Invalid key");
  }
  if (!value || typeof value !== "string" || value.length > 1048576) {
    // 1MB limit
    throw new Error("Invalid value");
  }

  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error("safeStorage is not available");
    return;
  }
  try {
    // Encrypt and store in runtime secure store
    const encrypted = safeStorage.encryptString(value).toString("hex");
    secureStore.set(key, encrypted);
  } catch {
    logger.error(`failed to encrypt [REDACTED]`);
  }
};

export const deleteSecureItem = (key: string) => {
  secureStore.delete(key);
};

export const setUpdateBuildNumber = (buildNumber: string) => {
  plainStore.set(VibeDict.UpdateBuildNumber, buildNumber);
};

export const getUpdateBuildNumber = () => {
  const value = plainStore.get(VibeDict.UpdateBuildNumber);
  return value || "";
};

export const clearUpdateBuildNumber = () => {
  plainStore.delete(VibeDict.UpdateBuildNumber);
};

// Additional utility functions for other store keys
export const getTheme = () => {
  const value = plainStore.get(VibeDict.Theme);
  return value || "system";
};
export const setTheme = (theme: string) =>
  plainStore.set(VibeDict.Theme, theme);

export const getLanguage = () => {
  const value = plainStore.get(VibeDict.Language);
  return value || "en";
};
export const setLanguage = (language: string) =>
  plainStore.set(VibeDict.Language, language);

export const getDevTools = () => {
  const value = plainStore.get(VibeDict.DevTools);
  return value !== undefined ? value : false;
};
export const setDevTools = (enabled: boolean) =>
  plainStore.set(VibeDict.DevTools, enabled);

export const getWindowBounds = () => plainStore.get(VibeDict.WindowBounds);
export const setWindowBounds = (bounds: Electron.Rectangle) =>
  plainStore.set(VibeDict.WindowBounds, bounds);

export const getKeyboardShortcutsDisabled = () => {
  const value = plainStore.get(VibeDict.DisableKeyboardShortcuts);
  return value || { disableAllShortcuts: false };
};
export const setKeyboardShortcutsDisabled = (disabled: {
  disableAllShortcuts: boolean;
}) => plainStore.set(VibeDict.DisableKeyboardShortcuts, disabled);

export const getASCFile = () => {
  const value = plainStore.get(VibeDict.ASCFile);
  return value || "";
};
export const setASCFile = (ascFile: string) =>
  plainStore.set(VibeDict.ASCFile, ascFile);

export const NewUserStore = async (
  reason: string = "Authenticate to access secure storage",
): Promise<boolean> => {
  let randomPassword: string | null = null;

  try {
    // Touch ID is only available on macOS
    if (process.platform !== "darwin") {
      logger.info("Touch ID is not supported on this platform");
      return false;
    }

    // Check if Touch ID is available
    if (!systemPreferences.canPromptTouchID()) {
      logger.warn("Touch ID is not available on this system");
      return false;
    }

    // Touch ID authentication verifies human presence
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

    // Create a cryptographically secure random password
    randomPassword = randomBytes(64).toString("base64url");

    // Store app key in keychain for services that need direct access

    const entry = new Entry("xyz.cobrowser.vibe", "app_key");
    entry.setPassword(randomPassword);
    const storedPassword = entry.getPassword();

    if (!storedPassword) {
      logger.error("Failed to store password in keychain");
      return false;
    }

    // Store a flag indicating keychain has been configured
    setSecureItem("keychain_configured", "true");

    // Also store a flag indicating Touch ID was used for initialization
    setSecureItem("touch_id_initialized", "true");

    // Mark store as initialized
    plainStore.set(STORE_INITIALIZED_KEY, true);

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
// Check if this is the first launch
export const isFirstLaunch = (): boolean => {
  // Check if we have an encrypted blob or any stored data
  const hasEncryptedBlob = store.has(ENCRYPTED_BLOB_KEY);
  const hasStoredData = store.size > 0;
  return !hasEncryptedBlob && !hasStoredData;
};

// Called on app startup to decrypt the blob and restore data
export const initializeStore = async (): Promise<boolean> => {
  try {
    const available = safeStorage.isEncryptionAvailable();
    if (!available) {
      logger.error("safeStorage is not available");
      return false;
    }

    // Check if this is first launch - if so, skip initialization
    if (isFirstLaunch()) {
      logger.info(
        "First launch detected, skipping store initialization until onboarding complete",
      );
      return true;
    }

    // Check if we have an encrypted blob
    const encryptedBlob = store.get(ENCRYPTED_BLOB_KEY);
    if (!encryptedBlob) {
      logger.info("No encrypted blob found, starting with empty store");
      return true;
    }

    try {
      // Decrypt the blob
      const decryptedJson = safeStorage.decryptString(
        Buffer.from(encryptedBlob, "hex"),
      );
      const data = JSON.parse(decryptedJson) as {
        plain: Record<string, any>;
        secure: Record<string, string>;
        metadata?: {
          encryptedAt: string;
          version: string;
        };
      };

      logger.info(
        `Decrypted store with ${Object.keys(data.plain || {}).length} plain items and ${Object.keys(data.secure || {}).length} secure items`,
      );
      if (data.metadata) {
        logger.info(`Store was encrypted at: ${data.metadata.encryptedAt}`);
      }

      // Restore plain items to runtime store
      for (const [key, value] of Object.entries(data.plain)) {
        plainStore.set(key, value);
      }

      // Restore secure items (still encrypted) to runtime store
      for (const [key, value] of Object.entries(data.secure)) {
        secureStore.set(key, value);
      }

      logger.info("Store initialized successfully from encrypted blob");
      return true;
    } catch (error) {
      logger.error("Failed to decrypt blob:", error);
      // Clear the corrupted blob
      store.delete(ENCRYPTED_BLOB_KEY);
      return false;
    }
  } catch (error) {
    logger.error("Error in initializeStore:", error);
    return false;
  }
};

// Called on app exit to encrypt everything as a blob
export const encryptStoreOnExit = async (): Promise<boolean> => {
  try {
    const available = safeStorage.isEncryptionAvailable();
    if (!available) {
      logger.error("safeStorage is not available for exit encryption");
      return false;
    }

    // Collect all plain data
    const plainData: Record<string, any> = {};
    for (const [key, value] of plainStore.entries()) {
      plainData[key] = value;
    }

    // Collect all secure data (already encrypted)
    const secureData: Record<string, string> = {};
    for (const [key, value] of secureStore.entries()) {
      secureData[key] = value;
    }

    logger.info(
      `Encrypting store with ${plainStore.size} plain items and ${secureStore.size} secure items`,
    );

    // Create the combined data structure
    const combinedData = {
      plain: plainData,
      secure: secureData,
      metadata: {
        encryptedAt: new Date().toISOString(),
        version: "1.0",
      },
    };

    // Encrypt everything as a blob
    const jsonString = JSON.stringify(combinedData);
    const encryptedBlob = safeStorage.encryptString(jsonString).toString("hex");

    // Store only the encrypted blob
    store.set(ENCRYPTED_BLOB_KEY, encryptedBlob);

    // Clear the runtime stores after successful encryption
    plainStore.clear();
    secureStore.clear();

    logger.info("Store encrypted successfully on exit");
    return true;
  } catch (error) {
    logger.error("Error in encryptStoreOnExit:", error);
    return false;
  }
};

// Register exit handler
let exitHandlerRegistered = false;
let isEncrypting = false;
let encryptionPromise: Promise<boolean> | null = null;

// Export a function to handle store encryption on exit
export const handleStoreEncryption = async (): Promise<boolean> => {
  // If already encrypting, return the existing promise
  if (encryptionPromise) {
    return encryptionPromise;
  }

  // Skip if store was never initialized (first launch without onboarding completion)
  if (isFirstLaunch() && !plainStore.has(STORE_INITIALIZED_KEY)) {
    logger.info("Skipping encryption - store was never initialized");
    return true;
  }

  // Skip if already encrypted during this session
  if (isEncrypting) {
    return true;
  }

  isEncrypting = true;
  encryptionPromise = encryptStoreOnExit();

  try {
    const result = await encryptionPromise;
    logger.info("Store encryption completed with result:", result);
    return result;
  } catch (error) {
    logger.error("Store encryption failed:", error);
    return false;
  } finally {
    encryptionPromise = null;
  }
};

export const registerExitHandler = () => {
  if (exitHandlerRegistered) return;

  // Use will-quit instead of before-quit to avoid conflicts
  app.on("will-quit", async event => {
    // Only handle if we haven't encrypted yet
    if (!isEncrypting && !isFirstLaunch()) {
      event.preventDefault();

      const encrypted = await handleStoreEncryption();

      if (encrypted) {
        logger.info("Store encrypted successfully, allowing quit");
      } else {
        logger.error("Store encryption failed, but allowing quit anyway");
      }

      // Force quit after encryption attempt
      setImmediate(() => {
        app.exit(0);
      });
    }
  });

  exitHandlerRegistered = true;
};

// Complete store initialization after onboarding
export const completeStoreInitialization = async (): Promise<boolean> => {
  try {
    if (!isFirstLaunch()) {
      logger.info("Store already initialized, skipping");
      return true;
    }

    // Mark store as initialized
    plainStore.set(STORE_INITIALIZED_KEY, true);

    // Initialize with default values
    setTheme("system");
    setLanguage("en");

    // Create initial secure items if needed
    const result = await NewUserStore(
      "Initialize secure storage after onboarding",
    );

    logger.info("Store initialization completed after onboarding");
    return result;
  } catch (error) {
    logger.error("Error completing store initialization:", error);
    return false;
  }
};

// Legacy compatibility - redirect to initializeStore
export const UserDataRecover = initializeStore;

// Helper function to get recovered data
export const getRecoveredData = (key: string): string | undefined => {
  return getSecureItem(key);
};

// Helper function to get all recovered data
export const getAllRecoveredData = (): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const [key] of secureStore.entries()) {
    const value = getSecureItem(key);
    if (value) {
      result[key] = value;
    }
  }
  return result;
};
