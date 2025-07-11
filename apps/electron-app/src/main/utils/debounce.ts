import { createLogger } from "@vibe/shared-types";

const logger = createLogger("Debounce");

/**
 * Debounce utility with proper timer cleanup and memory management
 */
export class DebounceManager {
  private static timers: Map<string, NodeJS.Timeout> = new Map();
  private static callbacks: Map<string, (...args: any[]) => any> = new Map();

  /**
   * Debounce a function call with automatic cleanup
   */
  public static debounce<T extends (...args: any[]) => any>(
    key: string,
    fn: T,
    delay: number = 300,
  ): (...args: Parameters<T>) => void {
    return (...args: Parameters<T>) => {
      // Clear existing timer for this key
      this.clearTimer(key);

      // Store the callback for potential cleanup
      this.callbacks.set(key, () => fn(...args));

      // Create new timer
      const timer = setTimeout(() => {
        try {
          const callback = this.callbacks.get(key);
          if (callback) {
            callback();
          }
        } catch (error) {
          logger.error(`Debounced function error for key '${key}':`, error);
        } finally {
          // Clean up after execution
          this.timers.delete(key);
          this.callbacks.delete(key);
        }
      }, delay);

      this.timers.set(key, timer);
    };
  }

  /**
   * Create a debounced version of a function that can be called multiple times
   */
  public static createDebounced<T extends (...args: any[]) => any>(
    key: string,
    fn: T,
    delay: number = 300,
  ): (...args: Parameters<T>) => void {
    return this.debounce(key, fn, delay);
  }

  /**
   * Cancel a specific debounced operation
   */
  public static cancel(key: string): boolean {
    return this.clearTimer(key);
  }

  /**
   * Cancel all debounced operations
   */
  public static cancelAll(): number {
    let canceledCount = 0;

    for (const key of this.timers.keys()) {
      if (this.clearTimer(key)) {
        canceledCount++;
      }
    }

    return canceledCount;
  }

  /**
   * Clear a specific timer
   */
  private static clearTimer(key: string): boolean {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
      this.callbacks.delete(key);
      return true;
    }
    return false;
  }

  /**
   * Get the number of active debounced operations
   */
  public static getActiveCount(): number {
    return this.timers.size;
  }

  /**
   * Check if a specific key is currently debounced
   */
  public static isPending(key: string): boolean {
    return this.timers.has(key);
  }

  /**
   * Execute a debounced operation immediately and cancel the timer
   */
  public static flush(key: string): boolean {
    const callback = this.callbacks.get(key);
    if (callback) {
      this.clearTimer(key);
      try {
        callback();
        return true;
      } catch (error) {
        logger.error(`Error flushing debounced function '${key}':`, error);
        return false;
      }
    }
    return false;
  }

  /**
   * Flush all pending debounced operations
   */
  public static flushAll(): number {
    let flushedCount = 0;

    // Create a copy of keys to avoid modification during iteration
    const keys = Array.from(this.timers.keys());

    for (const key of keys) {
      if (this.flush(key)) {
        flushedCount++;
      }
    }

    return flushedCount;
  }

  /**
   * Clean up all timers and callbacks (call on shutdown)
   */
  public static cleanup(): void {
    const activeCount = this.timers.size;

    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.callbacks.clear();

    if (activeCount > 0) {
      logger.info(`Cleaned up ${activeCount} debounced operations`);
    }
  }

  /**
   * Get debug information about active operations
   */
  public static getDebugInfo(): { activeKeys: string[]; totalActive: number } {
    return {
      activeKeys: Array.from(this.timers.keys()),
      totalActive: this.timers.size,
    };
  }
}

/**
 * Simple debounce function for one-off usage
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300,
): (...args: Parameters<T>) => void {
  let timer: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      try {
        fn(...args);
      } catch (error) {
        logger.error("Debounced function error:", error);
      } finally {
        timer = null;
      }
    }, delay);
  };
}

/**
 * Throttle function with proper cleanup
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300,
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timer: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else {
      if (timer) {
        clearTimeout(timer);
      }

      timer = setTimeout(
        () => {
          lastCall = Date.now();
          try {
            fn(...args);
          } catch (error) {
            logger.error("Throttled function error:", error);
          } finally {
            timer = null;
          }
        },
        delay - (now - lastCall),
      );
    }
  };
}
