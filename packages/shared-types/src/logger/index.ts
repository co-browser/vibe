/**
 * Centralized logging utility for Vibe
 */

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface Logger {
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

class VibeLogger implements Logger {
  private isDevelopment: boolean;
  private logLevel: LogLevel;

  constructor() {
    // Browser-safe environment detection
    this.isDevelopment =
      typeof process !== "undefined"
        ? process.env.NODE_ENV !== "production"
        : false; // Default to production in browser

    // Get log level from environment with smart defaults (browser-safe)
    const envLevel =
      typeof process !== "undefined"
        ? (process.env.LOG_LEVEL?.toLowerCase() as LogLevel)
        : undefined;
    this.logLevel = envLevel || (this.isDevelopment ? "info" : "error");
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = { error: 3, warn: 2, info: 1, debug: 0 };
    return levels[level] >= levels[this.logLevel];
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog("error")) {
      console.error(`[ERROR] ${message}`, ...args);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog("warn")) {
      console.warn(`[WARN] ${message}`, ...args);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog("info")) {
      console.log(`[INFO] ${message}`, ...args);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog("debug")) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  }
}

const logger = new VibeLogger();

export function createLogger(context: string): Logger {
  return {
    error: (message: string, ...args: any[]) =>
      logger.error(`[${context}] ${message}`, ...args),
    warn: (message: string, ...args: any[]) =>
      logger.warn(`[${context}] ${message}`, ...args),
    info: (message: string, ...args: any[]) =>
      logger.info(`[${context}] ${message}`, ...args),
    debug: (message: string, ...args: any[]) =>
      logger.debug(`[${context}] ${message}`, ...args),
  };
}
