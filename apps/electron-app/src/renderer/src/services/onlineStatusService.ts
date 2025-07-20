/**
 * Online Status Service
 * Provides global access to online/offline status monitoring
 */

import { createLogger } from "@vibe/shared-types";

const logger = createLogger("online-status-service");

export class OnlineStatusService {
  private static instance: OnlineStatusService;
  private listeners: Set<(isOnline: boolean) => void> = new Set();
  private isOnline: boolean = navigator.onLine;

  private constructor() {
    this.setupEventListeners();
  }

  static getInstance(): OnlineStatusService {
    if (!OnlineStatusService.instance) {
      OnlineStatusService.instance = new OnlineStatusService();
    }
    return OnlineStatusService.instance;
  }

  private setupEventListeners(): void {
    const updateOnlineStatus = () => {
      this.isOnline = navigator.onLine;
      this.notifyListeners();
      this.updateDOMStatus();
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Initial update
    updateOnlineStatus();
  }

  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.isOnline);
      } catch (error) {
        logger.error("Error in online status listener:", error);
      }
    });
  }

  /**
   * Update DOM element with id="status" if it exists
   * This maintains compatibility with legacy code
   */
  private updateDOMStatus(): void {
    const statusElement = document.getElementById("status");
    if (statusElement) {
      statusElement.innerHTML = this.isOnline ? "online" : "offline";
    }
  }

  /**
   * Get current online status
   */
  getStatus(): boolean {
    return this.isOnline;
  }

  /**
   * Subscribe to online status changes
   */
  subscribe(callback: (isOnline: boolean) => void): () => void {
    this.listeners.add(callback);

    // Call immediately with current status
    callback(this.isOnline);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Force update the online status (useful for testing)
   */
  forceUpdate(): void {
    this.isOnline = navigator.onLine;
    this.notifyListeners();
    this.updateDOMStatus();
  }
}

// Export singleton instance
export const onlineStatusService = OnlineStatusService.getInstance();

// Expose to window for legacy compatibility
if (typeof window !== "undefined") {
  (window as any).onlineStatusService = onlineStatusService;

  // Also expose the simple update function for backward compatibility
  (window as any).updateOnlineStatus = () => {
    onlineStatusService.forceUpdate();
  };
}
