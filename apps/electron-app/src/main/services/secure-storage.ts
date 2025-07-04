import { safeStorage, app } from "electron";
import { createLogger } from "@vibe/shared-types";
import Store from "electron-store";
import crypto from "crypto";

const logger = createLogger("SecureStorage");

interface SecureStorageOptions {
  encryptionKey?: string;
  storeName?: string;
}

interface StoredItem {
  value: string;
  encrypted: boolean;
  iv?: string;
  authTag?: string;
  timestamp: number;
}

export class SecureStorage {
  private store: Store;
  private encryptionAvailable: boolean;
  private aesKey?: Buffer;

  constructor(options: SecureStorageOptions = {}) {
    this.store = new Store({
      name: options.storeName || "secure-storage",
      encryptionKey: options.encryptionKey,
    });

    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    
    if (!this.encryptionAvailable) {
      logger.warn("Encryption is not available on this system");
    }

    // Generate AES key for additional encryption layer
    if (options.encryptionKey) {
      this.aesKey = crypto.scryptSync(options.encryptionKey, "vibe-salt", 32);
    }

    logger.info("Secure storage initialized", {
      encryptionAvailable: this.encryptionAvailable,
      hasAesKey: !!this.aesKey,
    });
  }

  // Store sensitive data with encryption
  async set(key: string, value: string): Promise<void> {
    try {
      let encryptedValue: string;
      let iv: string | undefined;
      let authTag: string | undefined;
      let encrypted = false;

      if (this.encryptionAvailable) {
        // Use Electron's safe storage
        const encryptedBuffer = safeStorage.encryptString(value);
        encryptedValue = encryptedBuffer.toString("base64");
        encrypted = true;
      } else if (this.aesKey) {
        // Fallback to AES encryption
        const result = this.encryptWithAES(value);
        encryptedValue = result.encrypted;
        iv = result.iv;
        authTag = result.authTag;
        encrypted = true;
      } else {
        // No encryption available - log warning
        logger.warn("Storing value without encryption", { key });
        encryptedValue = value;
      }

      const item: StoredItem = {
        value: encryptedValue,
        encrypted,
        iv,
        authTag,
        timestamp: Date.now(),
      };

      this.store.set(key, item);
      logger.info("Secure value stored", { key, encrypted });
    } catch (error) {
      logger.error("Failed to store secure value", { key, error });
      throw error;
    }
  }

  // Retrieve and decrypt sensitive data
  async get(key: string): Promise<string | null> {
    try {
      const item = this.store.get(key) as StoredItem | undefined;
      
      if (!item) {
        return null;
      }

      if (!item.encrypted) {
        logger.warn("Retrieved unencrypted value", { key });
        return item.value;
      }

      let decryptedValue: string;

      if (this.encryptionAvailable && !item.iv) {
        // Decrypt using Electron's safe storage
        const encryptedBuffer = Buffer.from(item.value, "base64");
        decryptedValue = safeStorage.decryptString(encryptedBuffer);
      } else if (this.aesKey && item.iv && item.authTag) {
        // Decrypt using AES
        decryptedValue = this.decryptWithAES(
          item.value,
          item.iv,
          item.authTag
        );
      } else {
        throw new Error("Cannot decrypt value - missing encryption components");
      }

      return decryptedValue;
    } catch (error) {
      logger.error("Failed to retrieve secure value", { key, error });
      return null;
    }
  }

  // Delete sensitive data
  async delete(key: string): Promise<void> {
    try {
      this.store.delete(key);
      logger.info("Secure value deleted", { key });
    } catch (error) {
      logger.error("Failed to delete secure value", { key, error });
      throw error;
    }
  }

  // Check if a key exists
  has(key: string): boolean {
    return this.store.has(key);
  }

  // Clear all stored data
  async clear(): Promise<void> {
    try {
      this.store.clear();
      logger.info("All secure storage cleared");
    } catch (error) {
      logger.error("Failed to clear secure storage", { error });
      throw error;
    }
  }

  // Get all keys (not values for security)
  getKeys(): string[] {
    return Object.keys(this.store.store);
  }

  // AES encryption helper
  private encryptWithAES(text: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    if (!this.aesKey) {
      throw new Error("AES key not available");
    }

    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.aesKey, iv);
    
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    
    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString("hex"),
      authTag: authTag.toString("hex"),
    };
  }

  // AES decryption helper
  private decryptWithAES(
    encryptedText: string,
    ivHex: string,
    authTagHex: string
  ): string {
    if (!this.aesKey) {
      throw new Error("AES key not available");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.aesKey, iv);
    
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedText, "hex", "utf8");
    decrypted += decipher.final("utf8");
    
    return decrypted;
  }

  // Export encrypted data for backup
  async exportEncrypted(): Promise<string> {
    const data = this.store.store;
    const exportData = {
      version: "1.0",
      timestamp: Date.now(),
      appVersion: app.getVersion(),
      data,
    };
    
    return JSON.stringify(exportData, null, 2);
  }

  // Import encrypted data from backup
  async importEncrypted(jsonData: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);
      
      if (importData.version !== "1.0") {
        throw new Error(`Unsupported backup version: ${importData.version}`);
      }

      // Clear existing data
      await this.clear();

      // Import new data
      Object.entries(importData.data).forEach(([key, value]) => {
        this.store.set(key, value);
      });

      logger.info("Encrypted data imported successfully", {
        keys: Object.keys(importData.data).length,
      });
    } catch (error) {
      logger.error("Failed to import encrypted data", { error });
      throw error;
    }
  }
}

// Singleton instance
let secureStorageInstance: SecureStorage | null = null;

export const getSecureStorage = (): SecureStorage => {
  if (!secureStorageInstance) {
    secureStorageInstance = new SecureStorage({
      encryptionKey: process.env.VIBE_ENCRYPTION_KEY || "default-dev-key",
      storeName: "vibe-secure",
    });
  }
  return secureStorageInstance;
};