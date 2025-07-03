/**
 * Unified Storage Service
 * A simple, flat key-value store with automatic encryption for secure keys
 */

import { safeStorage } from "electron";
import Store from "electron-store";
import { createLogger } from "@vibe/shared-types";
import { EventEmitter } from "events";

const logger = createLogger("StorageService");

export class StorageService extends EventEmitter {
  private static instance: StorageService | null = null;
  private store: Store;
  private secureCache: Map<string, any> = new Map();

  private constructor() {
    super();
    this.store = new Store({
      name: "vibe",
      // Don't encrypt the whole store, we'll handle encryption per-key
      encryptionKey: undefined,
    });
    this.initialize();
  }

  static getInstance(): StorageService {
    if (!StorageService.instance) {
      StorageService.instance = new StorageService();
    }
    return StorageService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      // Load any secure items into cache on startup
      const keys = this.store.store || {};
      for (const [key, value] of Object.entries(keys)) {
        if (this.isSecureKey(key) && typeof value === "string") {
          try {
            const decrypted = await this.decryptValue(value);
            this.secureCache.set(key, decrypted);
          } catch {
            logger.warn(
              `Failed to decrypt ${key}, will re-encrypt on next save`,
            );
          }
        }
      }
      logger.info("Storage service initialized");
    } catch (error) {
      logger.error("Failed to initialize storage:", error);
    }
  }

  // ========== Public API ==========

  get(key: string, defaultValue?: any): any {
    if (!key || typeof key !== "string") {
      return defaultValue;
    }

    if (this.isSecureKey(key)) {
      return this.getSecure(key) || defaultValue;
    }

    return this.store.get(key, defaultValue);
  }

  set(key: string, value: any): void {
    if (!key || typeof key !== "string") {
      logger.warn("Invalid key provided to set()");
      return;
    }

    const oldValue = this.get(key);

    if (this.isSecureKey(key)) {
      this.setSecure(key, value);
    } else {
      this.store.set(key, value);
    }

    this.emit("change", key, value, oldValue);
    this.emit(`change:${key}`, value, oldValue);
  }

  delete(key: string): void {
    if (!key || typeof key !== "string") {
      return;
    }

    const oldValue = this.get(key);

    if (this.isSecureKey(key)) {
      this.secureCache.delete(key);
    }

    this.store.delete(key);
    this.emit("change", key, undefined, oldValue);
    this.emit(`change:${key}`, undefined, oldValue);
  }

  has(key: string): boolean {
    if (this.isSecureKey(key)) {
      return this.secureCache.has(key) || this.store.has(key);
    }
    return this.store.has(key);
  }

  clear(): void {
    this.secureCache.clear();
    this.store.clear();
    this.emit("cleared");
  }

  // Get all keys (excluding secure values for safety)
  keys(): string[] {
    return Object.keys(this.store.store || {});
  }

  // Get size of store
  get size(): number {
    return this.keys().length;
  }

  // ========== App Settings Convenience Methods ==========

  getTheme(): string {
    return this.get("settings.theme", "system");
  }

  setTheme(theme: string): void {
    this.set("settings.theme", theme);
  }

  getLanguage(): string {
    return this.get("settings.language", "en");
  }

  setLanguage(language: string): void {
    this.set("settings.language", language);
  }

  getWindowBounds(): Electron.Rectangle | undefined {
    return this.get("settings.windowBounds");
  }

  setWindowBounds(bounds: Electron.Rectangle): void {
    this.set("settings.windowBounds", bounds);
  }

  getDevToolsEnabled(): boolean {
    return this.get("settings.devTools", false);
  }

  setDevToolsEnabled(enabled: boolean): void {
    this.set("settings.devTools", enabled);
  }

  // ========== Private Methods ==========

  private isSecureKey(key: string): boolean {
    return (
      key.startsWith("secure.") ||
      key.includes(".secure.") ||
      key.endsWith(".apiKeys") ||
      key.endsWith(".passwords")
    );
  }

  private getSecure(key: string): any {
    // Check cache first
    if (this.secureCache.has(key)) {
      return this.secureCache.get(key);
    }

    // Try to load and decrypt from store
    const encrypted = this.store.get(key);
    if (!encrypted) return null;

    try {
      const decrypted = this.decryptValueSync(encrypted as string);
      this.secureCache.set(key, decrypted);
      return decrypted;
    } catch (error) {
      logger.error(`Failed to decrypt ${key}:`, error);
      return null;
    }
  }

  private setSecure(key: string, value: any): void {
    if (value === undefined || value === null) {
      this.delete(key);
      return;
    }

    try {
      const encrypted = this.encryptValue(value);
      this.store.set(key, encrypted);
      this.secureCache.set(key, value);
    } catch (error) {
      logger.error(`Failed to encrypt ${key}:`, error);
      // Fallback: store unencrypted with warning
      logger.warn(`Storing ${key} unencrypted due to encryption failure`);
      this.store.set(key, value);
      this.secureCache.set(key, value);
    }
  }

  private encryptValue(value: any): string {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encryption not available");
    }

    const jsonString = JSON.stringify(value);
    const encrypted = safeStorage.encryptString(jsonString);
    return encrypted.toString("base64");
  }

  private decryptValueSync(encrypted: string): any {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Encryption not available");
    }

    const buffer = Buffer.from(encrypted, "base64");
    const decrypted = safeStorage.decryptString(buffer);
    return JSON.parse(decrypted);
  }

  private async decryptValue(encrypted: string): Promise<any> {
    return this.decryptValueSync(encrypted);
  }
}

// Export singleton getter
export function getStorageService(): StorageService {
  return StorageService.getInstance();
}
