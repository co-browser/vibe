/**
 * Helper utilities for the Electron main process
 *
 * This module contains utility functions for memory management,
 * performance optimization, and input validation.
 */

import { TAB_SLEEP_CONFIG } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("MemoryUtils");

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * @param func The function to debounce
 * @param wait The number of milliseconds to delay
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;

  return function (...args: Parameters<T>) {
    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func(...args);
      timeout = null;
    }, wait);
  };
}

/**
 * Sets up memory monitoring to track and manage application memory usage
 * with proactive memory management and trigger-based monitoring
 * @returns Object with memory management utility functions
 */
export function setupMemoryMonitoring(): {
  triggerGarbageCollection: () => void;
  checkMemoryUsage: () => {
    heapUsed: number;
    isHighMemory: boolean;
  };
  setBrowserInstance: (browser: any) => void;
} {
  // Memory check interval
  const MEMORY_CHECK_INTERVAL = 1000 * 60 * 1; // 1 minute

  // Memory threshold levels for progressive intervention
  const MEMORY_THRESHOLDS = {
    MODERATE: 350 * 1024 * 1024, // 350 MB - start incremental GC
    HIGH: 500 * 1024 * 1024, // 500 MB - more aggressive GC
    CRITICAL: 750 * 1024 * 1024, // 750 MB - extreme measures
  };

  // Track consecutive high memory readings
  let consecutiveHighMemory = 0;

  // Browser instance for tab sleep integration
  let browserInstance: any = null;

  /**
   * Run garbage collection with optional aggressive mode
   * @param aggressive Whether to use aggressive collection strategy
   */
  const runGarbageCollection = (aggressive = false): void => {
    if (!global.gc) {
      logger.warn(
        "Garbage collection not available - run with --expose-gc flag for manual GC",
      );
      return;
    }

    try {
      if (aggressive) {
        // For aggressive GC, run multiple passes
        logger.warn("Running aggressive garbage collection");
        global.gc();
        // Short delay between passes
        setTimeout(() => {
          if (global.gc) {
            global.gc();
            logger.info("Aggressive garbage collection completed");
          }
        }, 1000);
      } else {
        // Standard GC
        global.gc();
        logger.info("Standard garbage collection completed");
      }
    } catch (error) {
      logger.error("Error during garbage collection:", error);
    }
  };

  /**
   * Check current memory usage and take appropriate action
   * @returns Object with memory usage details
   */
  const checkMemoryUsage = (): {
    heapUsed: number;
    isHighMemory: boolean;
  } => {
    const memoryUsage = process.memoryUsage();
    const heapUsedMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
    const rssUsedMB = Math.round(memoryUsage.rss / 1024 / 1024);

    // Only log memory usage in debug mode unless there's an issue
    if (process.env.LOG_LEVEL === "debug") {
      logger.info(`Memory usage: ${heapUsedMB} MB heap, ${rssUsedMB} MB total`);
    }

    const isHighMemory = memoryUsage.heapUsed > MEMORY_THRESHOLDS.HIGH;

    if (memoryUsage.heapUsed > MEMORY_THRESHOLDS.CRITICAL) {
      logger.error(`CRITICAL MEMORY USAGE: ${heapUsedMB} MB`);
      consecutiveHighMemory++;
      // Extremely aggressive memory recovery
      runGarbageCollection(true);

      // If we've had multiple consecutive critical readings, log additional diagnostics
      if (consecutiveHighMemory > 3) {
        logger.error("Multiple consecutive critical memory readings detected");
        // Log detailed memory information for debugging
        logger.error(JSON.stringify(process.memoryUsage(), null, 2));
      }
    } else if (memoryUsage.heapUsed > MEMORY_THRESHOLDS.HIGH) {
      logger.warn(`HIGH MEMORY USAGE: ${heapUsedMB} MB`);
      consecutiveHighMemory++;
      // More aggressive GC
      runGarbageCollection(true);

      // NEW: Trigger tab sleeping on high memory (browser integration)
      if (browserInstance) {
        const tabManager = browserInstance.getTabManager();
        if (tabManager) {
          const inactiveTabs = tabManager.getInactiveTabs(
            TAB_SLEEP_CONFIG.MAX_TABS_TO_SLEEP_ON_MEMORY_PRESSURE,
          );
          if (inactiveTabs.length > 0) {
            logger.info(
              `💾 High memory (${heapUsedMB}MB): sleeping ${inactiveTabs.length} tabs`,
            );
            inactiveTabs.forEach((tabKey: string) =>
              tabManager.putTabToSleep(tabKey),
            );
          } else {
            logger.info(
              `💾 High memory (${heapUsedMB}MB): no inactive tabs to sleep`,
            );
          }
        }
      }

      // Add note about potential favicon contribution to memory usage
      if (consecutiveHighMemory > 2) {
        logger.warn(
          "High memory may be related to favicon data URLs. Consider further optimization if this persists.",
        );
      }
    } else if (memoryUsage.heapUsed > MEMORY_THRESHOLDS.MODERATE) {
      // Only log moderate memory usage in debug mode
      if (process.env.LOG_LEVEL === "debug") {
        logger.info(`Moderate memory usage: ${heapUsedMB} MB`);
      }
      // Standard GC
      runGarbageCollection(false);
      // Reset counter as we're below critical threshold
      consecutiveHighMemory = 0;
    } else {
      // Reset counter as we're below all thresholds
      consecutiveHighMemory = 0;
    }

    return {
      heapUsed: memoryUsage.heapUsed,
      isHighMemory,
    };
  };

  /**
   * Explicitly trigger garbage collection from outside
   */
  const triggerGarbageCollection = (): void => {
    logger.info("Manually triggered garbage collection");
    runGarbageCollection(false);
  };

  // Set up the regular interval check
  setInterval(checkMemoryUsage, MEMORY_CHECK_INTERVAL);

  /**
   * Set browser instance for tab sleep integration
   */
  const setBrowserInstance = (browser: any): void => {
    browserInstance = browser;
  };

  // Return functions that can be called from outside to check or manage memory
  return {
    triggerGarbageCollection,
    checkMemoryUsage,
    setBrowserInstance,
  };
}

/**
 * Validates if a tab key is valid
 * @param key The key to validate
 * @returns True if the key is valid, false otherwise
 */
export function isValidTabKey(key: unknown): key is string {
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Validates and processes a URL input
 *
 * - Validates if the input is a properly formatted URL
 * - Adds appropriate protocol if missing
 * - Converts non-URL inputs to search queries
 *
 * @param url The URL or search query to validate
 * @returns Object containing validation results and processed URL
 */
export function isValidUrl(url: unknown): {
  isValid: boolean;
  url: string;
  isSearch: boolean;
} {
  if (typeof url !== "string")
    return { isValid: false, url: "", isSearch: false };

  const trimmedUrl = url.trim();

  // Check if empty
  if (trimmedUrl === "") return { isValid: false, url: "", isSearch: false };

  // Handle special case for localhost
  if (
    trimmedUrl.startsWith("localhost") ||
    trimmedUrl.startsWith("127.0.0.1")
  ) {
    return { isValid: true, url: `http://${trimmedUrl}`, isSearch: false };
  }

  try {
    // If it already has a protocol, validate it directly
    if (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) {
      new URL(trimmedUrl);
      return { isValid: true, url: trimmedUrl, isSearch: false };
    }

    // Check if it's likely a URL (contains domain-like structure)
    if (
      // Has domain-like structure (e.g., example.com)
      /^[a-zA-Z0-9][-a-zA-Z0-9]*(\.[a-zA-Z0-9][-a-zA-Z0-9]*)+/.test(
        trimmedUrl,
      ) ||
      // Single word + TLD pattern
      /^[a-zA-Z0-9][-a-zA-Z0-9]*\.(com|org|net|io|dev|co|ai|app|edu|gov|mil)$/.test(
        trimmedUrl,
      )
    ) {
      new URL(`https://${trimmedUrl}`);
      return { isValid: true, url: `https://${trimmedUrl}`, isSearch: false };
    }

    // If we're here, it's probably a search query
    return {
      isValid: true,
      url: `https://www.google.com/search?q=${encodeURIComponent(trimmedUrl)}`,
      isSearch: true,
    };
  } catch {
    // If URL parsing failed, treat as a search query
    return {
      isValid: true,
      url: `https://www.google.com/search?q=${encodeURIComponent(trimmedUrl)}`,
      isSearch: true,
    };
  }
}
