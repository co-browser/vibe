/**
 * Storage Initialization
 */

import { getStorageService } from "./storage-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("StorageInit");

let initialized = false;

export async function initializeStorage(): Promise<void> {
  if (initialized) {
    logger.info("Storage already initialized");
    return;
  }

  try {
    logger.info("Initializing storage system...");

    // Get storage instance (auto-initializes)
    const storage = getStorageService();

    // Mark as initialized
    if (!storage.has("_initialized")) {
      storage.set("_initialized", true);
      storage.set("_initDate", new Date().toISOString());
    }

    initialized = true;
    logger.info("Storage initialization complete");

    // Log storage stats
    const stats = {
      totalKeys: storage.size,
      profiles: Object.keys(storage.get("profiles", {})).length,
      initialized: storage.get("_initialized"),
    };
    logger.info("Storage stats:", stats);
  } catch (error) {
    logger.error("Failed to initialize storage:", error);
    throw error;
  }
}

// Helper to check if storage is ready
export function isStorageReady(): boolean {
  return initialized;
}

// Helper to reset storage (useful for testing)
export async function resetStorage(): Promise<void> {
  const storage = getStorageService();
  storage.clear();
  initialized = false;
  await initializeStorage();
}
