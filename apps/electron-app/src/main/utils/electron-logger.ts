/**
 * Electron-specific logger that writes to both console and electron-log file
 */

import log from "electron-log";
import {
  createLogger as createSharedLogger,
  type Logger,
} from "@vibe/shared-types";

// Configure electron-log for utility processes
if (process.type === "utility") {
  log.transports.file.level = "info";
  log.transports.file.fileName = "mcp-manager.log";
  log.transports.console.level = "info";
}

/**
 * Create a logger that writes to both console and electron-log file
 */
export function createElectronLogger(context: string): Logger {
  const sharedLogger = createSharedLogger(context);

  return {
    error: (message: string, ...args: any[]) => {
      sharedLogger.error(message, ...args);
      log.error(`[${context}] ${message}`, ...args);
    },
    warn: (message: string, ...args: any[]) => {
      sharedLogger.warn(message, ...args);
      log.warn(`[${context}] ${message}`, ...args);
    },
    info: (message: string, ...args: any[]) => {
      sharedLogger.info(message, ...args);
      log.info(`[${context}] ${message}`, ...args);
    },
    debug: (message: string, ...args: any[]) => {
      sharedLogger.debug(message, ...args);
      log.debug(`[${context}] ${message}`, ...args);
    },
  };
}
