import { ipcRouter } from "./ipc-router";
import { BrowserIPCHandler } from "./browser-handler";
import { AppIPCHandler } from "./app-handler";
import { StateIPCHandler } from "./state-handler";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ConsolidatedIPC");

/**
 * Consolidated IPC System
 *
 * Replaces the scattered 20+ IPC files across 7 directories with:
 * - 3 focused handlers (Browser, App, State)
 * - Centralized routing and error handling
 * - Type-safe channel definitions
 * - Standardized logging and debugging
 *
 * Reduction: 20+ files → 4 files (80% reduction)
 * Improvement: Better organization, error handling, and maintainability
 */

/**
 * Initialize the consolidated IPC system
 *
 * @param browserInstance - The browser instance to make available to handlers
 */
export function initializeConsolidatedIPC(browserInstance: any): void {
  try {
    logger.info("Initializing consolidated IPC system...");

    // Register all handlers
    ipcRouter.registerHandler(new BrowserIPCHandler());
    ipcRouter.registerHandler(new AppIPCHandler());
    ipcRouter.registerHandler(new StateIPCHandler());

    // Initialize the router with browser instance
    ipcRouter.initialize(browserInstance);

    const stats = ipcRouter.getStats();
    logger.info(`Consolidated IPC system initialized successfully:`, {
      handlerCount: stats.handlerCount,
      handlers: stats.handlers,
    });

    logger.info("✅ IPC Consolidation Phase 3 Complete");
    logger.info(
      `📊 Replaced 20+ scattered files with ${stats.handlerCount} focused handlers`,
    );
  } catch (error) {
    logger.error("Failed to initialize consolidated IPC system:", error);
    throw error;
  }
}

/**
 * Cleanup the consolidated IPC system
 */
export function cleanupConsolidatedIPC(): void {
  try {
    logger.info("Cleaning up consolidated IPC system...");
    ipcRouter.cleanup();
    logger.info("Consolidated IPC system cleanup complete");
  } catch (error) {
    logger.error("Failed to cleanup consolidated IPC system:", error);
  }
}

/**
 * Get statistics about the consolidated IPC system
 */
export function getConsolidatedIPCStats() {
  return ipcRouter.getStats();
}

// Export handlers for testing or advanced usage
export { BrowserIPCHandler, AppIPCHandler, StateIPCHandler };
export { ipcRouter };

// Export types for use in other parts of the application
export type { IPCHandlerMap, IPCListenerMap } from "./ipc-router";
