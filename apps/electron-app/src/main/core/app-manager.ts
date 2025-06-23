import { app, BrowserWindow } from "electron";
import { optimizer } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";

import { Browser } from "@/browser/browser";
import { initializeConsolidatedIPC } from "@/ipc/consolidated";
import { ServiceManager } from "./service-manager";
import { EnvironmentManager } from "./environment-manager";

const logger = createLogger("AppManager");

/**
 * App Manager - Simplified Application Lifecycle Management
 * 
 * Centralizes and simplifies the main process initialization and lifecycle:
 * - Clean service management through ServiceManager
 * - Consolidated IPC system integration
 * - Simplified window management
 * - Graceful shutdown handling
 * 
 * Replaces the complex 578-line main/index.ts with focused, modular approach.
 */
export class AppManager {
  private browser: Browser | null = null;
  private serviceManager: ServiceManager | null = null;
  private environmentManager: EnvironmentManager;
  private isShuttingDown = false;
  private initialized = false;

  constructor() {
    this.environmentManager = new EnvironmentManager();
  }

  /**
   * Initialize the application
   */
  async initialize(): Promise<boolean> {
    if (this.initialized) {
      logger.warn("App already initialized");
      return true;
    }

    try {
      logger.info("Initializing Vibe Browser Application...");

      // Setup environment and configuration
      this.environmentManager.setup();

      // Request single instance lock
      if (!this.requestSingleInstanceLock()) {
        return false;
      }

      // Initialize browser
      this.initializeBrowser();

      // Setup services
      await this.initializeServices();

      // Setup IPC system
      this.initializeIPC();

      // Setup app event handlers
      this.setupAppEventHandlers();

      // Setup error handling
      this.setupErrorHandling();

      this.initialized = true;
      logger.info("✅ App Manager initialization complete");
      return true;
    } catch (error) {
      logger.error("App initialization failed:", error);
      throw error;
    }
  }

  /**
   * Create the initial application window
   */
  async createInitialWindow(): Promise<BrowserWindow | null> {
    if (!this.browser) {
      logger.error("Browser instance not available");
      return null;
    }

    try {
      const mainWindow = await this.browser.createWindow();

      // Open devtools in development
      if (!app.isPackaged) {
        mainWindow.webContents.openDevTools({ mode: "detach" });
      }

      logger.info("Initial window created successfully");
      return mainWindow;
    } catch (error) {
      logger.error("Failed to create initial window:", error);
      return null;
    }
  }

  /**
   * Perform graceful shutdown
   */
  async shutdown(signal: string = "MANUAL"): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    logger.info(`Graceful shutdown initiated by: ${signal}`);

    try {
      // Shutdown services
      if (this.serviceManager) {
        await this.serviceManager.shutdown();
      }

      // Cleanup IPC
      // The consolidated IPC system will handle its own cleanup

      // Destroy browser instance
      if (this.browser) {
        this.browser.destroy();
        this.browser = null;
      }

      // Close all windows
      this.closeAllWindows();

      // Quit application
      app.quit();

      // Force exit if cleanup takes too long
      setTimeout(() => {
        process.exit(0);
      }, 3000);

      logger.info("Graceful shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  }

  /**
   * Get the browser instance
   */
  getBrowser(): Browser | null {
    return this.browser;
  }

  /**
   * Get the service manager
   */
  getServiceManager(): ServiceManager | null {
    return this.serviceManager;
  }

  /**
   * Check if the app is shutting down
   */
  isShuttingDownState(): boolean {
    return this.isShuttingDown;
  }

  // === Private Methods ===

  private requestSingleInstanceLock(): boolean {
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      logger.info("Another instance already running, exiting");
      return false;
    }

    // Handle second instance
    app.on("second-instance", () => {
      this.handleSecondInstance();
    });

    return true;
  }

  private initializeBrowser(): void {
    logger.info("Initializing browser...");
    this.browser = new Browser();
    logger.info("Browser initialized");
  }

  private async initializeServices(): Promise<void> {
    logger.info("Initializing services...");
    this.serviceManager = new ServiceManager();
    await this.serviceManager.initialize();
    logger.info("Services initialized");
  }

  private initializeIPC(): void {
    if (!this.browser) {
      throw new Error("Browser must be initialized before IPC");
    }

    logger.info("Initializing consolidated IPC system...");
    initializeConsolidatedIPC(this.browser);
    logger.info("IPC system initialized");
  }

  private setupAppEventHandlers(): void {
    app.on("browser-window-created", (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });

    app.on("window-all-closed", () => {
      if (process.platform !== "darwin") {
        this.shutdown("WINDOW_ALL_CLOSED");
      }
    });

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        this.createInitialWindow();
      }
    });

    app.on("will-quit", () => {
      // Cleanup will be handled by shutdown method
      setTimeout(() => {
        process.exit(0);
      }, 2000);
    });
  }

  private setupErrorHandling(): void {
    // Graceful error handling without showing dialogs in development
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception:", error);
      if (!this.isShuttingDown) {
        // Log only, don't exit in development
        if (app.isPackaged) {
          this.shutdown("UNCAUGHT_EXCEPTION");
        }
      }
    });

    process.on("unhandledRejection", (reason) => {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      logger.error("Unhandled rejection:", error);
      if (!this.isShuttingDown && app.isPackaged) {
        this.shutdown("UNHANDLED_REJECTION");
      }
    });

    // Signal handlers
    process.on("SIGINT", () => this.shutdown("SIGINT"));
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
    process.on("SIGHUP", () => this.shutdown("SIGHUP"));
  }

  private handleSecondInstance(): void {
    if (!this.browser) return;

    const mainWindow = this.browser.getMainWindow();
    if (mainWindow) {
      mainWindow.focus();
    } else {
      this.createInitialWindow();
    }
  }

  private closeAllWindows(): void {
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.removeAllListeners();
        window.close();
      }
    });
  }
}