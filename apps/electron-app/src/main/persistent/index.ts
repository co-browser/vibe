import Store from 'electron-store';
import { safeStorage } from 'electron';
import { createLogger } from '@vibe/shared-types';

const logger = createLogger('PersistentStorage');

/**
 * Encrypted store configuration
 * Uses Electron's safeStorage API for encryption when available
 */
interface EncryptedStoreOptions {
  name?: string;
  defaults?: Record<string, any>;
  schema?: Record<string, any>;
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
 * Encrypted Store Class
 * Automatically encrypts/decrypts data using safeStorage when available
 */
class EncryptedStore {
  private store: Store;
  private encryptionAvailable: boolean;

  constructor(options: EncryptedStoreOptions = {}) {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    
    if (!this.encryptionAvailable) {
      logger.warn('Encryption not available on this system. Data will be stored in plain text.');
    } else {
      logger.info('Encryption is available. Data will be encrypted on disk.');
    }

    // Configure the store with encryption if available
    const storeOptions: any = {
      name: options.name || 'encrypted-store',
      defaults: options.defaults || {},
      schema: options.schema,
      // Add encryption serialization if available
      ...(this.encryptionAvailable && {
        serialize: (value: any) => {
          const jsonString = JSON.stringify(value);
          const encrypted = safeStorage.encryptString(jsonString);
          return encrypted.toString('base64');
        },
        deserialize: (value: string) => {
          try {
            const buffer = Buffer.from(value, 'base64');
            const decrypted = safeStorage.decryptString(buffer);
            return JSON.parse(decrypted);
          } catch (error) {
            logger.error('Failed to decrypt data:', error);
            // Return empty object if decryption fails
            return {};
          }
        }
      })
    };

    this.store = new Store(storeOptions);
    
    logger.info(`Encrypted store initialized: ${options.name || 'encrypted-store'} (encryption: ${this.encryptionAvailable ? 'enabled' : 'disabled'})`);
  }

  /**
   * Get a value from the encrypted store
   */
  get<T = any>(key: string, defaultValue?: T): T {
    try {
      return this.store.get(key, defaultValue);
    } catch (error) {
      logger.error(`Failed to get key "${key}" from encrypted store:`, error);
      return defaultValue as T;
    }
  }

  /**
   * Set a value in the encrypted store
   */
  set(key: string, value: any): void {
    try {
      this.store.set(key, value);
      logger.debug(`Set key "${key}" in encrypted store`);
    } catch (error) {
      logger.error(`Failed to set key "${key}" in encrypted store:`, error);
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
      logger.error(`Failed to delete key "${key}" from encrypted store:`, error);
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
      logger.info('Cleared all data from encrypted store');
    } catch (error) {
      logger.error('Failed to clear encrypted store:', error);
    }
  }

  /**
   * Get all data from the encrypted store
   */
  getAll(): Record<string, any> {
    try {
      return this.store.store;
    } catch (error) {
      logger.error('Failed to get all data from encrypted store:', error);
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
      logger.error('Failed to get encrypted store size:', error);
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
   * Get the store file path
   */
  get path(): string {
    return this.store.path;
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
      name: options.name || 'plain-store',
      defaults: options.defaults || {},
      schema: options.schema
    });

    logger.info(`Plain store initialized: ${options.name || 'plain-store'}`);
  }

  /**
   * Get a value from the plain store
   */
  get<T = any>(key: string, defaultValue?: T): T {
    return this.store.get(key, defaultValue);
  }

  /**
   * Set a value in the plain store
   */
  set(key: string, value: any): void {
    this.store.set(key, value);
    logger.debug(`Set key "${key}" in plain store`);
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
    logger.info('Cleared all data from plain store');
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
  onDidChange(key: string, callback: (newValue: any, oldValue: any) => void): () => void {
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
export function createEncryptedStore(options: EncryptedStoreOptions = {}): EncryptedStore {
  return new EncryptedStore(options);
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

// Default encrypted store for sensitive data (API keys, tokens, etc.)
export const secureStore = createEncryptedStore({
  name: 'vibe-secure',
  defaults: {
    apiKeys: {},
    tokens: {},
    credentials: {}
  }
});

// Default plain store for general application settings
export const settingsStore = createPlainStore({
  name: 'vibe-settings',
  defaults: {
    theme: 'system',
    language: 'en',
    windowBounds: {},
    preferences: {}
  }
});

// Default plain store for user data that doesn't need encryption
export const userDataStore = createPlainStore({
  name: 'vibe-userdata',
  defaults: {
    bookmarks: [],
    history: [],
    tabs: [],
    sessions: []
  }
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
 * Get information about the storage system
 */
export function getStorageInfo(): {
  encryptionAvailable: boolean;
  secureStorePath: string;
  settingsStorePath: string;
  userDataStorePath: string;
} {
  return {
    encryptionAvailable: isEncryptionAvailable(),
    secureStorePath: secureStore.path,
    settingsStorePath: settingsStore.path,
    userDataStorePath: userDataStore.path
  };
}

/**
 * Initialize all stores and log their status
 */
export function initializeStores(): void {
  const info = getStorageInfo();
  
  logger.info('Storage system initialized:', {
    encryptionAvailable: info.encryptionAvailable,
    stores: {
      secure: info.secureStorePath,
      settings: info.settingsStorePath,
      userData: info.userDataStorePath
    }
  });

  // Test stores to ensure they're working
  try {
    secureStore.set('_test', 'test-value');
    const testValue = secureStore.get('_test');
    if (testValue === 'test-value') {
      secureStore.delete('_test');
      logger.info('Secure store test: PASSED');
    } else {
      logger.warn('Secure store test: FAILED');
    }
  } catch (error) {
    logger.error('Secure store test failed:', error);
  }

  try {
    settingsStore.set('_test', 'test-value');
    const testValue = settingsStore.get('_test');
    if (testValue === 'test-value') {
      settingsStore.delete('_test');
      logger.info('Settings store test: PASSED');
    } else {
      logger.warn('Settings store test: FAILED');
    }
  } catch (error) {
    logger.error('Settings store test failed:', error);
  }
}

// Export the store classes for advanced usage
export { EncryptedStore, PlainStore };

// Export types
export type { EncryptedStoreOptions, PlainStoreOptions };