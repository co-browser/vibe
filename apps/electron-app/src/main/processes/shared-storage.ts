/**
 * Shared Storage Handler for Utility Processes
 * Provides a clean API for utility processes to access settings and profile data
 * via IPC communication with the main process
 */

import { createLogger } from "@vibe/shared-types";

// Type definitions for better type safety
interface UtilityPort {
  postMessage: (message: any) => void;
  on: (event: string, listener: (message: any) => void) => void;
}

interface ProcessWithPort {
  parentPort?: UtilityPort;
}

interface IPCMessage {
  id: string;
  type: string;
  key?: string;
  value?: any;
  data?: any;
  error?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
  timeoutId: NodeJS.Timeout;
}

type WatchCallback = (newValue: any, oldValue: any) => void;

const logger = createLogger("SharedStorage");
const DEFAULT_TIMEOUT = 5000;

/**
 * Shared storage access for utility processes
 * Provides a simplified API to interact with main process storage
 */
export class SharedStorage {
  private static instance: SharedStorage | null = null;
  private parentPort = (process as any as ProcessWithPort).parentPort;
  private watchCallbacks = new Map<string, WatchCallback>();
  private pendingRequests = new Map<string, PendingRequest>();
  private messageIdCounter = 0;
  private isInitialized = false;
  private isWatching = false;

  private constructor() {
    if (!this.parentPort) {
      throw new Error("SharedStorage can only be used in utility processes");
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): SharedStorage {
    if (!SharedStorage.instance) {
      SharedStorage.instance = new SharedStorage();
      SharedStorage.instance.initialize();
    }
    return SharedStorage.instance;
  }

  /**
   * Initialize message listeners
   */
  private initialize(): void {
    if (this.isInitialized) return;

    this.parentPort!.on("message", this.handleMessage.bind(this));
    this.isInitialized = true;
    logger.debug("SharedStorage initialized");
  }

  /**
   * Handle incoming messages from main process
   */
  private handleMessage(message: IPCMessage): void {
    switch (message.type) {
      case "settings:changed":
        this.handleSettingChanged(message);
        break;
      case "settings:response":
        this.handleResponse(message);
        break;
      case "settings:error":
        this.handleError(message);
        break;
      default:
        // Ignore non-settings messages
        break;
    }
  }

  /**
   * Handle setting change notifications
   */
  private handleSettingChanged(message: IPCMessage): void {
    if (!message.data) return;

    const { key, newValue, oldValue } = message.data;
    const callback = this.watchCallbacks.get(key);

    if (callback) {
      try {
        callback(newValue, oldValue);
      } catch (error) {
        logger.error(`Error in watch callback for key ${key}:`, error);
      }
    }
  }

  /**
   * Handle successful responses
   */
  private handleResponse(message: IPCMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.resolve(message.data);
      this.pendingRequests.delete(message.id);
    }
  }

  /**
   * Handle error responses
   */
  private handleError(message: IPCMessage): void {
    const pending = this.pendingRequests.get(message.id);
    if (pending) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message.error || "Unknown error"));
      this.pendingRequests.delete(message.id);
    }
  }

  /**
   * Generate unique message ID
   */
  private generateMessageId(prefix: string): string {
    return `${prefix}-${++this.messageIdCounter}`;
  }

  /**
   * Send message and wait for response with timeout
   */
  private async sendRequest<T>(
    message: Omit<IPCMessage, "id">,
    timeout = DEFAULT_TIMEOUT,
  ): Promise<T> {
    const messageId = this.generateMessageId(message.type);

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error(`Request timeout: ${message.type}`));
        }
      }, timeout);

      // Store pending request
      this.pendingRequests.set(messageId, { resolve, reject, timeoutId });

      // Send message
      this.parentPort!.postMessage({ ...message, id: messageId });
    });
  }

  /**
   * Get a setting value
   */
  async get<T = any>(key: string): Promise<T | null> {
    return this.sendRequest<T>({
      type: "settings:get",
      key,
    });
  }

  /**
   * Set a setting value
   */
  async set(key: string, value: any): Promise<boolean> {
    return this.sendRequest<boolean>({
      type: "settings:set",
      key,
      value,
    });
  }

  /**
   * Get current profile ID
   */
  async getCurrentProfileId(): Promise<string | null> {
    return this.sendRequest<string | null>({
      type: "settings:get-profile",
    });
  }

  /**
   * Get all settings
   */
  async getAll(): Promise<Record<string, any>> {
    return this.sendRequest<Record<string, any>>({
      type: "settings:get-all",
    });
  }

  /**
   * Watch for changes to a specific setting
   */
  watch(key: string, callback: WatchCallback): () => void {
    // Store callback
    this.watchCallbacks.set(key, callback);

    // Start watching if first watcher
    if (!this.isWatching) {
      this.parentPort!.postMessage({
        id: this.generateMessageId("watch"),
        type: "settings:watch",
        keys: Array.from(this.watchCallbacks.keys()),
      });
      this.isWatching = true;
    } else {
      // Add this key to existing watch
      this.parentPort!.postMessage({
        id: this.generateMessageId("watch-add"),
        type: "settings:watch",
        keys: [key],
      });
    }

    // Return unwatch function
    return () => {
      this.watchCallbacks.delete(key);

      // Stop watching if no more callbacks
      if (this.watchCallbacks.size === 0 && this.isWatching) {
        this.parentPort!.postMessage({
          id: this.generateMessageId("unwatch"),
          type: "settings:unwatch",
        });
        this.isWatching = false;
      } else {
        // Remove just this key from watch
        this.parentPort!.postMessage({
          id: this.generateMessageId("unwatch-remove"),
          type: "settings:unwatch",
          keys: [key],
        });
      }
    };
  }

  /**
   * Batch get multiple settings
   */
  async batchGet(keys: string[]): Promise<Record<string, any>> {
    const results: Record<string, any> = {};

    // Use Promise.all for parallel fetching
    const values = await Promise.all(
      keys.map(key => this.get(key).catch(() => null)),
    );

    keys.forEach((key, index) => {
      results[key] = values[index];
    });

    return results;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    // Clear all pending requests
    this.pendingRequests.forEach(({ reject, timeoutId }) => {
      clearTimeout(timeoutId);
      reject(new Error("SharedStorage destroyed"));
    });
    this.pendingRequests.clear();

    // Clear watch callbacks
    this.watchCallbacks.clear();

    // Stop watching if active
    if (this.isWatching) {
      this.parentPort!.postMessage({
        id: this.generateMessageId("unwatch"),
        type: "settings:unwatch",
      });
      this.isWatching = false;
    }

    SharedStorage.instance = null;
  }
}

// Export convenience functions for backward compatibility
export const sharedStorage = SharedStorage.getInstance();

// Legacy static API for backward compatibility
export class UtilityProcessSettings {
  static async get<T = any>(key: string): Promise<T | null> {
    return sharedStorage.get<T>(key);
  }

  static async set(key: string, value: any): Promise<boolean> {
    return sharedStorage.set(key, value);
  }

  static async getCurrentProfileId(): Promise<string | null> {
    return sharedStorage.getCurrentProfileId();
  }

  static async getAll(): Promise<Record<string, any>> {
    return sharedStorage.getAll();
  }

  static watch(key: string, callback: WatchCallback): () => void {
    return sharedStorage.watch(key, callback);
  }

  static initialize(): void {
    // No-op for backward compatibility
    // Initialization happens automatically via getInstance()
  }
}
