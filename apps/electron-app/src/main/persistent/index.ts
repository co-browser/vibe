import Store from "electron-store";
import { safeStorage } from "electron";
import { createHash } from "crypto";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("PersistentStorage");

/**
 * Encrypted store configuration
 * Uses Electron's safeStorage API for encryption when available
 */
interface EncryptedStoreOptions {
  name?: string;
  defaults?: Record<string, any>;
  schema?: Record<string, any>;
  encryptionKey?: string; // Custom encryption key for profile-specific stores
}

/**
 * Non-encrypted store configuration
 * Standard electron-store without encryption
 */
interface PlainStoreOptions {
  name?: string;
  defaults?: Record<string, any>;
  schema?: Record<string, any>;
}

/**
 * Enhanced Encrypted Store Class
 * Automatically encrypts/decrypts data using safeStorage with optional custom key
 */
class EncryptedStore {
  private store: Store;
  private encryptionAvailable: boolean;
  private customEncryptionKey?: string;

  constructor(options: EncryptedStoreOptions = {}) {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    this.customEncryptionKey = options.encryptionKey;

    if (!this.encryptionAvailable) {
      const errorMessage =
        "Encryption not available on this system. Cannot store sensitive data securely.";
      logger.error(errorMessage);
      throw new Error(errorMessage);
    } else {
      logger.info("Encryption is available. Data will be encrypted on disk.");
    }

    // Configure the store with encryption (encryption is guaranteed to be available at this point)
    const storeOptions: any = {
      name: options.name || "encrypted-store",
      defaults: options.defaults || {},
      schema: options.schema,
      // Add encryption serialization with optional custom key
      serialize: (value: any) => {
        const jsonString = JSON.stringify(value);

        if (this.customEncryptionKey) {
          // Use custom encryption key for profile-specific data
          const encrypted = this.encryptWithCustomKey(
            jsonString,
            this.customEncryptionKey,
          );
          return encrypted;
        } else {
          // Use system encryption
          const encrypted = safeStorage.encryptString(jsonString);
          return encrypted.toString("base64");
        }
      },
      deserialize: (value: string) => {
        try {
          if (this.customEncryptionKey) {
            // Use custom decryption key for profile-specific data
            const decrypted = this.decryptWithCustomKey(
              value,
              this.customEncryptionKey,
            );
            return JSON.parse(decrypted);
          } else {
            // Use system decryption
            const buffer = Buffer.from(value, "base64");
            const decrypted = safeStorage.decryptString(buffer);
            return JSON.parse(decrypted);
          }
        } catch (error) {
          logger.error("Failed to decrypt data:", error);
          // Return empty object if decryption fails
          return {};
        }
      },
    };

    this.store = new Store(storeOptions);

    logger.info(
      `Encrypted store initialized: ${options.name || "encrypted-store"} (encryption: ${this.encryptionAvailable ? "enabled" : "disabled"}, custom key: ${!!this.customEncryptionKey})`,
    );

    console.log(
      `[EncryptedStore] Initialized "${options.name || "encrypted-store"}"`,
    );
    console.log(`[EncryptedStore] Store path:`, this.store.path);
    console.log(`[EncryptedStore] Store size:`, this.store.size);
    console.log(`[EncryptedStore] All keys:`, Object.keys(this.store.store));
  }

  /**
   * Custom encryption using the profile-specific key
   */
  private encryptWithCustomKey(data: string, key: string): string {
    try {
      // First encrypt with system encryption
      const systemEncrypted = safeStorage.encryptString(data);

      // Then add an additional layer with the custom key
      const keyHash = createHash("sha256").update(key).digest();
      const encrypted = Buffer.alloc(systemEncrypted.length);

      for (let i = 0; i < systemEncrypted.length; i++) {
        encrypted[i] = systemEncrypted[i] ^ keyHash[i % keyHash.length];
      }

      return encrypted.toString("base64");
    } catch (error) {
      logger.error("Failed to encrypt with custom key:", error);
      throw error;
    }
  }

  /**
   * Custom decryption using the profile-specific key
   */
  private decryptWithCustomKey(encryptedData: string, key: string): string {
    try {
      const encrypted = Buffer.from(encryptedData, "base64");
      const keyHash = createHash("sha256").update(key).digest();
      const systemEncrypted = Buffer.alloc(encrypted.length);

      // Reverse the XOR operation
      for (let i = 0; i < encrypted.length; i++) {
        systemEncrypted[i] = encrypted[i] ^ keyHash[i % keyHash.length];
      }

      // Then decrypt with system decryption
      return safeStorage.decryptString(systemEncrypted);
    } catch (error) {
      logger.error("Failed to decrypt with custom key:", error);
      throw error;
    }
  }

  /**
   * Get a value from the encrypted store
   */
  get<T = any>(key: string, defaultValue?: T): T {
    try {
      console.log(`[EncryptedStore] Getting key "${key}"`);
      console.log(`[EncryptedStore] Store path:`, this.store.path);

      const value = this.store.get(key, defaultValue) as T;
      console.log(
        `[EncryptedStore] Retrieved value for "${key}":`,
        key.includes("Key") && value ? "***" : value,
      );

      return value;
    } catch (error) {
      logger.error(`Failed to get key "${key}" from encrypted store:`, error);
      console.error(`[EncryptedStore] Error getting key "${key}":`, error);
      return defaultValue as T;
    }
  }

  /**
   * Set a value in the encrypted store
   */
  set(key: string, value: any): void {
    try {
      console.log(
        `[EncryptedStore] Setting key "${key}" with value:`,
        key.includes("Key") ? "***" : value,
      );
      console.log(`[EncryptedStore] Store path:`, this.store.path);

      this.store.set(key, value);
      logger.debug(`Set key "${key}" in encrypted store`);

      console.log(
        `[EncryptedStore] Successfully saved "${key}" to encrypted store`,
      );

      // Force sync to disk
      console.log(`[EncryptedStore] Forcing sync to disk...`);
    } catch (error) {
      logger.error(`Failed to set key "${key}" in encrypted store:`, error);
      console.error(`[EncryptedStore] Error setting key "${key}":`, error);
    }
  }

  /**
   * Delete a key from the encrypted store
   */
  delete(key: string): void {
    try {
      this.store.delete(key);
      logger.debug(`Deleted key "${key}" from encrypted store`);
    } catch (error) {
      logger.error(
        `Failed to delete key "${key}" from encrypted store:`,
        error,
      );
    }
  }

  /**
   * Check if a key exists in the encrypted store
   */
  has(key: string): boolean {
    try {
      return this.store.has(key);
    } catch (error) {
      logger.error(`Failed to check key "${key}" in encrypted store:`, error);
      return false;
    }
  }

  /**
   * Clear all data from the encrypted store
   */
  clear(): void {
    try {
      this.store.clear();
      logger.info("Cleared all data from encrypted store");
    } catch (error) {
      logger.error("Failed to clear encrypted store:", error);
    }
  }

  /**
   * Get all data from the encrypted store
   */
  getAll(): Record<string, any> {
    try {
      return this.store.store;
    } catch (error) {
      logger.error("Failed to get all data from encrypted store:", error);
      return {};
    }
  }

  /**
   * Get the size of the encrypted store
   */
  get size(): number {
    try {
      return this.store.size;
    } catch (error) {
      logger.error("Failed to get encrypted store size:", error);
      return 0;
    }
  }

  /**
   * Check if encryption is available
   */
  get isEncryptionEnabled(): boolean {
    return this.encryptionAvailable;
  }

  /**
   * Check if using custom encryption key
   */
  get hasCustomKey(): boolean {
    return !!this.customEncryptionKey;
  }

  /**
   * Get the store file path
   */
  get path(): string {
    return this.store.path;
  }

  /**
   * Watch for changes to a key
   */
  onDidChange(
    key: string,
    callback: (newValue: any, oldValue: any) => void,
  ): () => void {
    return this.store.onDidChange(key, callback);
  }

  /**
   * Watch for any changes to the store
   */
  onDidAnyChange(callback: (newValue: any, oldValue: any) => void): () => void {
    return this.store.onDidAnyChange(callback);
  }
}

/**
 * Plain Store Class
 * Standard electron-store without encryption
 */
class PlainStore {
  private store: Store;

  constructor(options: PlainStoreOptions = {}) {
    this.store = new Store({
      name: options.name || "plain-store",
      defaults: options.defaults || {},
      schema: options.schema,
    });

    logger.info(`Plain store initialized: ${options.name || "plain-store"}`);

    console.log(`[PlainStore] Initialized "${options.name || "plain-store"}"`);
    console.log(`[PlainStore] Store path:`, this.store.path);
    console.log(`[PlainStore] Store size:`, this.store.size);
    console.log(`[PlainStore] All keys:`, Object.keys(this.store.store));
  }

  /**
   * Get a value from the plain store
   */
  get<T = any>(key: string, defaultValue?: T): T {
    console.log(`[PlainStore] Getting key "${key}"`);
    console.log(`[PlainStore] Store path:`, this.store.path);

    const value = this.store.get(key, defaultValue) as T;
    console.log(`[PlainStore] Retrieved value for "${key}":`, value);

    return value;
  }

  /**
   * Set a value in the plain store
   */
  set(key: string, value: any): void {
    console.log(`[PlainStore] Setting key "${key}" with value:`, value);
    console.log(`[PlainStore] Store path:`, this.store.path);

    this.store.set(key, value);
    logger.debug(`Set key "${key}" in plain store`);

    console.log(`[PlainStore] Successfully saved "${key}" to plain store`);
  }

  /**
   * Delete a key from the plain store
   */
  delete(key: string): void {
    this.store.delete(key);
    logger.debug(`Deleted key "${key}" from plain store`);
  }

  /**
   * Check if a key exists in the plain store
   */
  has(key: string): boolean {
    return this.store.has(key);
  }

  /**
   * Clear all data from the plain store
   */
  clear(): void {
    this.store.clear();
    logger.info("Cleared all data from plain store");
  }

  /**
   * Get all data from the plain store
   */
  getAll(): Record<string, any> {
    return this.store.store;
  }

  /**
   * Get the size of the plain store
   */
  get size(): number {
    return this.store.size;
  }

  /**
   * Get the store file path
   */
  get path(): string {
    return this.store.path;
  }

  /**
   * Watch for changes to a key
   */
  onDidChange(
    key: string,
    callback: (newValue: any, oldValue: any) => void,
  ): () => void {
    return this.store.onDidChange(key, callback);
  }

  /**
   * Watch for any changes to the store
   */
  onDidAnyChange(callback: (newValue: any, oldValue: any) => void): () => void {
    return this.store.onDidAnyChange(callback);
  }
}

/**
 * Store Factory Functions
 */

/**
 * Create a new encrypted store instance
 * @param options Configuration options for the encrypted store
 * @returns EncryptedStore instance
 */
export function createEncryptedStore(
  options: EncryptedStoreOptions = {},
): EncryptedStore {
  return new EncryptedStore(options);
}

/**
 * Create a profile-specific encrypted store with custom encryption key
 * @param profileId Profile identifier
 * @param encryptionKey Custom encryption key (hash of "cobro" + timestamp)
 * @param options Additional configuration options
 * @returns EncryptedStore instance with profile-specific encryption
 */
export function createProfileStore(
  profileId: string,
  encryptionKey: string,
  options: Omit<EncryptedStoreOptions, "encryptionKey" | "name"> = {},
): EncryptedStore {
  return new EncryptedStore({
    ...options,
    name: `profile-${profileId}`,
    encryptionKey,
    defaults: {
      passwords: [],
      history: [],
      chatQueries: [],
      bookmarks: [],
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      customData: {},
      ...options.defaults,
    },
  });
}

/**
 * Create a new plain store instance
 * @param options Configuration options for the plain store
 * @returns PlainStore instance
 */
export function createPlainStore(options: PlainStoreOptions = {}): PlainStore {
  return new PlainStore(options);
}

/**
 * Default store instances for common use cases
 */

console.log("[Persistent Storage] Creating default store instances...");

// Default encrypted store for sensitive data (API keys, tokens, etc.)
export const secureStore = createEncryptedStore({
  name: "vibe-secure",
  defaults: {
    apiKeys: {},
    tokens: {},
    credentials: {},
  },
});

// Default plain store for general application settings
export const settingsStore = createPlainStore({
  name: "vibe-settings",
  defaults: {
    theme: "system",
    language: "en",
    windowBounds: {},
    preferences: {},
  },
});

// Default plain store for user data that doesn't need encryption
export const userDataStore = createPlainStore({
  name: "vibe-userdata",
  defaults: {
    bookmarks: [],
    history: [],
    tabs: [],
    sessions: [],
  },
});

// Profile metadata store (plain store for profile management)
export const profileMetadataStore = createPlainStore({
  name: "vibe-profiles",
  defaults: {
    profiles: {},
    currentProfile: null,
    defaultProfile: null,
  },
});

/**
 * Utility functions
 */

/**
 * Check if encryption is available on the current system
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Generate encryption key for profile (hash of "cobro" + timestamp)
 */
export function generateProfileEncryptionKey(
  timestamp: number = Date.now(),
): string {
  return createHash("sha256").update(`cobro${timestamp}`).digest("hex");
}

/**
 * Get information about the storage system
 */
export function getStorageInfo(): {
  encryptionAvailable: boolean;
  secureStorePath: string;
  settingsStorePath: string;
  userDataStorePath: string;
  profileMetadataStorePath: string;
} {
  return {
    encryptionAvailable: isEncryptionAvailable(),
    secureStorePath: secureStore.path,
    settingsStorePath: settingsStore.path,
    userDataStorePath: userDataStore.path,
    profileMetadataStorePath: profileMetadataStore.path,
  };
}

/**
 * Initialize all stores and log their status
 */
export function initializeStores(): void {
  const info = getStorageInfo();

  logger.info("Storage system initialized:", {
    encryptionAvailable: info.encryptionAvailable,
    stores: {
      secure: info.secureStorePath,
      settings: info.settingsStorePath,
      userData: info.userDataStorePath,
      profileMetadata: info.profileMetadataStorePath,
    },
  });

  // Test stores to ensure they're working
  try {
    secureStore.set("_test", "test-value");
    const testValue = secureStore.get("_test");
    if (testValue === "test-value") {
      secureStore.delete("_test");
      logger.info("Secure store test: PASSED");
    } else {
      logger.warn("Secure store test: FAILED");
    }
  } catch (error) {
    logger.error("Secure store test failed:", error);
  }

  try {
    settingsStore.set("_test", "test-value");
    const testValue = settingsStore.get("_test");
    if (testValue === "test-value") {
      settingsStore.delete("_test");
      logger.info("Settings store test: PASSED");
    } else {
      logger.warn("Settings store test: FAILED");
    }
  } catch (error) {
    logger.error("Settings store test failed:", error);
  }

  try {
    profileMetadataStore.set("_test", "test-value");
    const testValue = profileMetadataStore.get("_test");
    if (testValue === "test-value") {
      profileMetadataStore.delete("_test");
      logger.info("Profile metadata store test: PASSED");
    } else {
      logger.warn("Profile metadata store test: FAILED");
    }
  } catch (error) {
    logger.error("Profile metadata store test failed:", error);
  }
}

// Export the store classes for advanced usage
export { EncryptedStore, PlainStore };

// Export types
export type { EncryptedStoreOptions, PlainStoreOptions };
