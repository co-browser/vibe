import { safeStorage } from "electron";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2Sync,
} from "crypto";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("EncryptionService");

/**
 * Encryption service for handling sensitive data encryption/decryption
 * Uses Electron's safeStorage when available, fallback to basic encryption
 */
export class EncryptionService {
  private static instance: EncryptionService;
  private fallbackKey: string;

  private constructor() {
    // Generate secure fallback key using environment-specific data
    this.fallbackKey = this.generateSecureFallbackKey();
  }

  /**
   * Generate a secure fallback key using machine-specific data
   */
  private generateSecureFallbackKey(): string {
    try {
      // Use environment variable if available, otherwise derive from machine-specific data
      const envKey = process.env.VIBE_ENCRYPTION_KEY;
      if (envKey && envKey.length >= 32) {
        return envKey.substring(0, 32);
      }

      // Derive key from machine-specific data
      const machineId =
        process.env.HOSTNAME || process.env.COMPUTERNAME || "vibe-default";
      const appVersion = process.env.npm_package_version || "1.0.0";
      const platform = process.platform;

      // Combine machine-specific data
      const keyMaterial = `${machineId}-${platform}-${appVersion}-vibe-encryption`;

      // Use PBKDF2 to derive a secure key
      const salt = Buffer.from("vibe-salt-2024", "utf8");
      const derivedKey = pbkdf2Sync(keyMaterial, salt, 100000, 32, "sha256");

      return derivedKey.toString("hex").substring(0, 32);
    } catch {
      logger.warn(
        "Failed to generate secure fallback key, using minimal fallback",
      );
      // Last resort fallback - still better than hardcoded
      const timestamp = Date.now().toString();
      return pbkdf2Sync(
        `vibe-${timestamp}`,
        "fallback-salt",
        10000,
        32,
        "sha256",
      )
        .toString("hex")
        .substring(0, 32);
    }
  }

  public static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Check if secure storage is available
   */
  public isAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      logger.warn(
        "safeStorage not available, falling back to basic encryption",
      );
      return true; // Fallback is always available
    }
  }

  /**
   * Encrypt sensitive data
   */
  public async encryptData(data: string): Promise<string> {
    if (!data) {
      return "";
    }

    try {
      // Try to use Electron's safeStorage first
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = safeStorage.encryptString(data);
        return buffer.toString("base64");
      }
    } catch (error) {
      logger.warn("safeStorage encryption failed, using fallback:", error);
    }

    // Fallback to basic encryption
    return this.encryptWithFallback(data);
  }

  /**
   * Decrypt sensitive data
   */
  public async decryptData(encryptedData: string): Promise<string> {
    if (!encryptedData) {
      return "";
    }

    try {
      // Try to use Electron's safeStorage first
      if (safeStorage.isEncryptionAvailable()) {
        const buffer = Buffer.from(encryptedData, "base64");
        return safeStorage.decryptString(buffer);
      }
    } catch (error) {
      logger.warn("safeStorage decryption failed, using fallback:", error);
    }

    // Fallback to basic decryption
    return this.decryptWithFallback(encryptedData);
  }

  /**
   * Encrypt data (alias for encryptData for backward compatibility)
   */
  public async encrypt(data: string): Promise<string> {
    return this.encryptData(data);
  }

  /**
   * Decrypt data (alias for decryptData for backward compatibility)
   */
  public async decrypt(encryptedData: string): Promise<string> {
    return this.decryptData(encryptedData);
  }

  /**
   * Fallback encryption using Node.js crypto
   */
  private encryptWithFallback(data: string): string {
    try {
      const algorithm = "aes-256-cbc";
      const key = Buffer.from(this.fallbackKey.padEnd(32, "0").slice(0, 32));
      const iv = randomBytes(16);

      const cipher = createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(data, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Prepend IV to encrypted data
      return iv.toString("hex") + ":" + encrypted;
    } catch (error) {
      logger.error("Fallback encryption failed:", error);
      throw new Error("Failed to encrypt data");
    }
  }

  /**
   * Fallback decryption using Node.js crypto
   */
  private decryptWithFallback(encryptedData: string): string {
    try {
      const algorithm = "aes-256-cbc";
      const key = Buffer.from(this.fallbackKey.padEnd(32, "0").slice(0, 32));

      // Split IV and encrypted data
      const parts = encryptedData.split(":");
      if (parts.length !== 2) {
        throw new Error("Invalid encrypted data format");
      }

      const iv = Buffer.from(parts[0], "hex");
      const encrypted = parts[1];

      const decipher = createDecipheriv(algorithm, key, iv);
      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch (error) {
      logger.error("Fallback decryption failed:", error);
      throw new Error("Failed to decrypt data");
    }
  }

  /**
   * Migrate plain text data to encrypted format
   */
  public async migratePlainTextToEncrypted(
    plainTextData: string,
  ): Promise<string> {
    if (!plainTextData) {
      return "";
    }

    logger.info("Migrating plain text data to encrypted format");
    return this.encryptData(plainTextData);
  }

  /**
   * Check if data appears to be encrypted
   */
  public isEncrypted(data: string): boolean {
    if (!data) {
      return false;
    }

    // Simple heuristic: encrypted data is typically base64 or hex
    const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
    const hexPattern = /^[0-9a-fA-F]+$/;

    return base64Pattern.test(data) || hexPattern.test(data);
  }
}
