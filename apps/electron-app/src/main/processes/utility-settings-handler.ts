/**
 * Utility Process Settings Handler
 * Provides settings access and change watching for utility processes
 * Communicates with main process to get/set/watch settings
 */

// In utility processes, parentPort is available on the process object
declare const process: NodeJS.Process & {
  parentPort?: {
    postMessage: (message: any) => void;
    on: (event: string, listener: (message: any) => void) => void;
  };
};

const parentPort = process.parentPort;

/**
 * Utility Process Settings API
 * Provides settings access for utility processes via IPC to main process
 */
export class UtilityProcessSettings {
  private static watchCallbacks = new Map<
    string,
    (newValue: any, oldValue: any) => void
  >();
  private static isWatching = false;
  private static messageIdCounter = 0;
  private static pendingRequests = new Map<
    string,
    { resolve: (value: any) => void; reject: (reason?: any) => void }
  >();

  /**
   * Initialize settings handler and set up message listeners
   */
  static initialize(): void {
    if (!parentPort) {
      throw new Error(
        "UtilityProcessSettings can only be used in utility processes",
      );
    }

    // Listen for settings change notifications from main process
    parentPort.on("message", (message: any) => {
      if (message.type === "settings:changed") {
        const { key, newValue, oldValue } = message.data;
        const callback = this.watchCallbacks.get(key);
        if (callback) {
          callback(newValue, oldValue);
        }
      } else if (message.type === "settings:response") {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.resolve(message.data);
          this.pendingRequests.delete(message.id);
        }
      } else if (message.type === "settings:error") {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          pending.reject(new Error(message.error || "Unknown error"));
          this.pendingRequests.delete(message.id);
        }
      }
    });
  }

  /**
   * Get a setting value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    const messageId = `settings-${++this.messageIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject });

      parentPort?.postMessage({
        id: messageId,
        type: "settings:get",
        key,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error("Settings request timed out"));
        }
      }, 5000);
    });
  }

  /**
   * Set a setting value
   */
  static async set(key: string, value: any): Promise<boolean> {
    const messageId = `settings-${++this.messageIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject });

      parentPort?.postMessage({
        id: messageId,
        type: "settings:set",
        key,
        value,
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error("Settings request timed out"));
        }
      }, 5000);
    });
  }

  /**
   * Get current profile ID
   */
  static async getCurrentProfileId(): Promise<string | null> {
    const messageId = `settings-${++this.messageIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject });

      parentPort?.postMessage({
        id: messageId,
        type: "settings:get-profile",
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error("Profile request timed out"));
        }
      }, 5000);
    });
  }

  /**
   * Watch for changes to a specific setting
   */
  static watch(
    key: string,
    callback: (newValue: any, oldValue: any) => void,
  ): () => void {
    this.watchCallbacks.set(key, callback);

    // Start watching if not already
    if (!this.isWatching) {
      parentPort?.postMessage({
        id: `watch-${++this.messageIdCounter}`,
        type: "settings:watch",
      });
      this.isWatching = true;
    }

    // Return unwatch function
    return () => {
      this.watchCallbacks.delete(key);

      // Stop watching if no more callbacks
      if (this.watchCallbacks.size === 0 && this.isWatching) {
        parentPort?.postMessage({
          id: `unwatch-${++this.messageIdCounter}`,
          type: "settings:unwatch",
        });
        this.isWatching = false;
      }
    };
  }

  /**
   * Get all settings (masked for security)
   */
  static async getAll(): Promise<Record<string, any>> {
    const messageId = `settings-${++this.messageIdCounter}`;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(messageId, { resolve, reject });

      parentPort?.postMessage({
        id: messageId,
        type: "settings:get-all",
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(messageId)) {
          this.pendingRequests.delete(messageId);
          reject(new Error("Settings request timed out"));
        }
      }, 5000);
    });
  }
}

// Auto-initialize when imported in utility process
if (typeof parentPort !== "undefined" && parentPort) {
  UtilityProcessSettings.initialize();
}
