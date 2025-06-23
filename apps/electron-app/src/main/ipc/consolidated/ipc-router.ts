import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("IPCRouter");

/**
 * IPC Router - Consolidated IPC Message Handling
 *
 * Replaces the scattered 20+ IPC files across 7 directories with a unified system.
 * Provides type safety, centralized routing, and standardized error handling.
 */

// Type definitions for IPC messages
export interface IPCHandlerMap {
  [channel: string]: (
    event: IpcMainInvokeEvent,
    ...args: any[]
  ) => Promise<any> | any;
}

export interface IPCListenerMap {
  [channel: string]: (event: IpcMainEvent, ...args: any[]) => void;
}

/**
 * Base IPC Handler class with common functionality
 */
export abstract class BaseIPCHandler {
  protected abstract handlerName: string;

  protected log(message: string, ...args: any[]): void {
    logger.debug(`[${this.handlerName}] ${message}`, ...args);
  }

  protected logError(message: string, error: any): void {
    logger.error(`[${this.handlerName}] ${message}`, error);
  }

  protected getBrowser() {
    // This will be injected by the router
    const browser = (global as any).__vibeAppBrowser;
    if (!browser) {
      throw new Error("Browser instance not available");
    }
    return browser;
  }

  protected getApplicationWindow(webContentsId: number) {
    const browser = this.getBrowser();
    const appWindow = browser.getApplicationWindow(webContentsId);
    if (!appWindow) {
      throw new Error(
        `ApplicationWindow not found for webContents ID: ${webContentsId}`,
      );
    }
    return appWindow;
  }

  protected validateTabKey(tabKey: string): void {
    if (!tabKey || typeof tabKey !== "string") {
      throw new Error("Invalid tab key provided");
    }
  }

  // Abstract methods to be implemented by specific handlers
  abstract getHandlers(): IPCHandlerMap;
  abstract getListeners(): IPCListenerMap;
}

/**
 * IPC Router - Central coordinator for all IPC communication
 */
export class IPCRouter {
  private handlers: Map<string, BaseIPCHandler> = new Map();
  private isRegistered: boolean = false;

  /**
   * Register a handler for specific IPC channels
   */
  registerHandler(handler: BaseIPCHandler): void {
    const handlerName =
      (handler as any).handlerName || handler.constructor.name;

    if (this.handlers.has(handlerName)) {
      throw new Error(`Handler ${handlerName} already registered`);
    }

    this.handlers.set(handlerName, handler);
    logger.info(`Registered IPC handler: ${handlerName}`);
  }

  /**
   * Initialize all IPC handlers
   */
  initialize(browserInstance: any): void {
    if (this.isRegistered) {
      logger.warn("IPC Router already initialized");
      return;
    }

    // Make browser instance globally available for handlers
    (global as any).__vibeAppBrowser = browserInstance;

    // Register all handlers and listeners
    for (const [handlerName, handler] of this.handlers) {
      try {
        this.registerHandlersForHandler(handler);
        this.registerListenersForHandler(handler);
        logger.debug(`Initialized IPC handler: ${handlerName}`);
      } catch (error) {
        logger.error(`Failed to initialize handler ${handlerName}:`, error);
      }
    }

    this.isRegistered = true;
    logger.info(`IPC Router initialized with ${this.handlers.size} handlers`);
  }

  /**
   * Register IPC handle methods for a handler
   */
  private registerHandlersForHandler(handler: BaseIPCHandler): void {
    const handlers = handler.getHandlers();

    for (const [channel, handlerFunc] of Object.entries(handlers)) {
      ipcMain.handle(
        channel,
        async (event: IpcMainInvokeEvent, ...args: any[]) => {
          try {
            const result = await handlerFunc.call(handler, event, ...args);
            return { success: true, data: result };
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            logger.error(`IPC handler error on channel ${channel}:`, error);
            return { success: false, error: errorMessage };
          }
        },
      );
    }
  }

  /**
   * Register IPC listeners for a handler
   */
  private registerListenersForHandler(handler: BaseIPCHandler): void {
    const listeners = handler.getListeners();

    for (const [channel, listenerFunc] of Object.entries(listeners)) {
      ipcMain.on(channel, (event: IpcMainEvent, ...args: any[]) => {
        try {
          listenerFunc.call(handler, event, ...args);
        } catch (error) {
          logger.error(`IPC listener error on channel ${channel}:`, error);
        }
      });
    }
  }

  /**
   * Remove all IPC handlers (for cleanup)
   */
  cleanup(): void {
    if (!this.isRegistered) {
      return;
    }

    // Get all registered channels and remove them
    for (const handler of this.handlers.values()) {
      const handlers = handler.getHandlers();
      const listeners = handler.getListeners();

      for (const channel of Object.keys(handlers)) {
        ipcMain.removeHandler(channel);
      }

      for (const channel of Object.keys(listeners)) {
        ipcMain.removeAllListeners(channel);
      }
    }

    this.handlers.clear();
    this.isRegistered = false;

    // Clean up global reference
    delete (global as any).__vibeAppBrowser;

    logger.info("IPC Router cleanup complete");
  }

  /**
   * Get statistics about registered handlers
   */
  getStats(): {
    handlerCount: number;
    handlers: string[];
    isRegistered: boolean;
  } {
    return {
      handlerCount: this.handlers.size,
      handlers: Array.from(this.handlers.keys()),
      isRegistered: this.isRegistered,
    };
  }
}

// Global router instance
export const ipcRouter = new IPCRouter();
