import { BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("WindowBroadcast");

/**
 * Optimized window broadcasting utility with safety checks and performance improvements
 */
export class WindowBroadcast {
  private static windowCache: WeakMap<BrowserWindow, number> = new WeakMap();
  private static lastCacheUpdate = 0;
  private static readonly CACHE_TTL = 1000; // 1 second cache TTL

  /**
   * Get all valid windows with caching and safety checks
   */
  private static getValidWindows(): BrowserWindow[] {
    const now = Date.now();

    // Use cached windows if still valid
    if (now - this.lastCacheUpdate < this.CACHE_TTL) {
      const allWindows = BrowserWindow.getAllWindows();
      return allWindows.filter(window => this.isWindowValid(window));
    }

    // Refresh cache
    const validWindows = BrowserWindow.getAllWindows().filter(window => {
      const isValid = this.isWindowValid(window);
      if (isValid) {
        this.windowCache.set(window, now);
      }
      return isValid;
    });

    this.lastCacheUpdate = now;
    return validWindows;
  }

  /**
   * Check if a window is valid and safe to use
   */
  private static isWindowValid(window: BrowserWindow): boolean {
    try {
      return (
        window &&
        !window.isDestroyed() &&
        window.webContents &&
        !window.webContents.isDestroyed()
      );
    } catch (error) {
      logger.warn("Error checking window validity:", error);
      return false;
    }
  }

  /**
   * Broadcast message to all valid windows with safety checks
   */
  public static broadcastToAll(channel: string, data?: any): number {
    const validWindows = this.getValidWindows();
    let successCount = 0;

    validWindows.forEach(window => {
      try {
        window.webContents.send(channel, data);
        successCount++;
      } catch (error) {
        logger.warn(`Failed to send to window ${window.id}:`, error);
      }
    });

    logger.debug(
      `Broadcast '${channel}' to ${successCount}/${validWindows.length} windows`,
    );
    return successCount;
  }

  /**
   * Broadcast message to all visible windows only
   */
  public static broadcastToVisible(channel: string, data?: any): number {
    const validWindows = this.getValidWindows().filter(window => {
      try {
        return window.isVisible();
      } catch {
        return false;
      }
    });

    let successCount = 0;

    validWindows.forEach(window => {
      try {
        window.webContents.send(channel, data);
        successCount++;
      } catch (error) {
        logger.warn(`Failed to send to visible window ${window.id}:`, error);
      }
    });

    logger.debug(
      `Broadcast '${channel}' to ${successCount}/${validWindows.length} visible windows`,
    );
    return successCount;
  }

  /**
   * Send message to specific window with safety checks
   */
  public static sendToWindow(
    window: BrowserWindow,
    channel: string,
    data?: any,
  ): boolean {
    if (!this.isWindowValid(window)) {
      logger.warn(`Cannot send to invalid window`);
      return false;
    }

    try {
      window.webContents.send(channel, data);
      return true;
    } catch (error) {
      logger.warn(`Failed to send '${channel}' to window ${window.id}:`, error);
      return false;
    }
  }

  /**
   * Send message only to the originating window (from IPC event)
   */
  public static replyToSender(
    event: Electron.IpcMainEvent,
    channel: string,
    data?: any,
  ): boolean {
    try {
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (senderWindow && this.isWindowValid(senderWindow)) {
        return this.sendToWindow(senderWindow, channel, data);
      }
      return false;
    } catch (error) {
      logger.warn(`Failed to reply to sender:`, error);
      return false;
    }
  }

  /**
   * Broadcast with debouncing to prevent spam
   */
  private static debouncedBroadcasts: Map<string, NodeJS.Timeout> = new Map();

  public static debouncedBroadcast(
    channel: string,
    data: any,
    delay: number = 100,
    toVisible: boolean = false,
  ): void {
    // Clear existing timeout for this channel
    const existingTimeout = this.debouncedBroadcasts.get(channel);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      if (toVisible) {
        this.broadcastToVisible(channel, data);
      } else {
        this.broadcastToAll(channel, data);
      }
      this.debouncedBroadcasts.delete(channel);
    }, delay);

    this.debouncedBroadcasts.set(channel, timeout);
  }

  /**
   * Filter windows by URL pattern (useful for targeting specific window types)
   */
  public static broadcastToWindowsMatching(
    urlPattern: RegExp,
    channel: string,
    data?: any,
  ): number {
    const matchingWindows = this.getValidWindows().filter(window => {
      try {
        const url = window.webContents.getURL();
        return urlPattern.test(url);
      } catch {
        return false;
      }
    });

    let successCount = 0;
    matchingWindows.forEach(window => {
      if (this.sendToWindow(window, channel, data)) {
        successCount++;
      }
    });

    logger.debug(
      `Broadcast '${channel}' to ${successCount}/${matchingWindows.length} matching windows`,
    );
    return successCount;
  }

  /**
   * Clean up debounced broadcasts (call on shutdown)
   */
  public static cleanup(): void {
    this.debouncedBroadcasts.forEach(timeout => clearTimeout(timeout));
    this.debouncedBroadcasts.clear();
    this.windowCache = new WeakMap();
    logger.info("WindowBroadcast cleaned up");
  }
}
