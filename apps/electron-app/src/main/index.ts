/**
 * Main process entry point for Vibe Browser
 */

import { app, BrowserWindow, dialog, shell } from "electron";
import { optimizer } from "@electron-toolkit/utils";
import { config } from "dotenv";
import { resolve } from "path";
import { detect } from "node-mac-detect-browsers";
import { Browser } from "@/browser/browser";
import { registerAllIpcHandlers } from "@/ipc";
import { setupMemoryMonitoring } from "@/utils/helpers";
import { AgentService } from "@/services/agent-service";
import { setAgentServiceInstance as setAgentStatusInstance } from "@/ipc/chat/agent-status";
import { setAgentServiceInstance as setChatMessagingInstance } from "@/ipc/chat/chat-messaging";
import { setAgentServiceInstance as setTabAgentInstance } from "@/utils/tab-agent";
import { createLogger, MAIN_PROCESS_CONFIG } from "@vibe/shared-types";
import {
  init,
  browserWindowSessionIntegration,
  childProcessIntegration,
} from "@sentry/electron/main";
import AppUpdater from "./services/update-service";
import {
  isFirstRun,
  openOnboardingForFirstRun,
} from "@/browser/onboarding-window";

const logger = createLogger("main-process");

// Initialize Sentry for error tracking
init({
  dsn: "https://21ac611f0272b8931073fa7ecc36c600@o4509464945623040.ingest.de.sentry.io/4509464948899920",
  debug: false,
  integrations: [browserWindowSessionIntegration(), childProcessIntegration()],
  tracesSampleRate: 0.1,
  tracePropagationTargets: ["localhost"],
  onFatalError: () => {},
});

// Simple logging only for now

// Load environment variables
config({ path: resolve(__dirname, "../../../../.env") });

// Global browser instance
export let browser: Browser | null = null;

// Global agent service instance
let agentService: AgentService | null = null;

// Track shutdown state
let isShuttingDown = false;
let detectedBrowsers: any[] = []; // Store detected browsers globally

// Cleanup functions
let unsubscribeVibe: (() => void) | null = null;
const unsubscribeStore: (() => void) | null = null;
const unsubscribeBrowser: (() => void) | null = null;
let memoryMonitor: ReturnType<typeof setupMemoryMonitoring> | null = null;

// Configure remote debugging for browser integration
app.commandLine.appendSwitch(
  "remote-debugging-port",
  MAIN_PROCESS_CONFIG.REMOTE_DEBUGGING_PORT.toString(),
);
app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
app.commandLine.appendSwitch(
  "enable-features",
  "NetworkService,NetworkServiceInProcess",
);
app.commandLine.appendSwitch("enable-blink-features", "MojoJS,MojoJSTest");

// Check for OpenAI API key availability
if (!process.env.OPENAI_API_KEY) {
  logger.warn("OPENAI_API_KEY not found in environment");
}

// Error handling with telemetry integration
process.on("uncaughtException", error => {
  logger.error("Uncaught exception:", error.message);

  // Log error only
  logger.error("Main process error:", error);

  if (!isShuttingDown) {
    // Don't show error dialog in development to avoid blocking
    if (app.isPackaged && app.isReady()) {
      dialog.showErrorBox(
        "An error occurred",
        `Uncaught Exception: ${error.message}\n\n${error.stack}`,
      );
    }
    // Don't exit the process, just log the error
  }
});

process.on("unhandledRejection", reason => {
  const error = reason instanceof Error ? reason : new Error(String(reason));
  logger.error("Unhandled rejection:", error.message);

  // Log error only
  logger.error("Main process error:", error);

  if (!isShuttingDown) {
    // Don't show error dialog in development to avoid blocking
    if (app.isPackaged && app.isReady()) {
      dialog.showErrorBox(
        "An error occurred",
        `Unhandled Rejection: ${error.message}\n\n${error.stack}`,
      );
    }
    // Don't exit the process, just log the error
  }
});

/**
 * Performs a graceful shutdown of the application, cleaning up services, resources, and windows before exiting.
 *
 * Initiates termination of the agent service, unsubscribes event listeners, destroys the browser instance, and closes all open windows. Ensures shutdown is only performed once per signal. Forces process exit if cleanup fails or after a timeout.
 *
 * @param signal - The signal or reason that triggered the shutdown
 */
async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;

  isShuttingDown = true;
  logger.info(`Graceful shutdown triggered by: ${signal}`);

  try {
    // Clean up resources
    if (memoryMonitor) {
      memoryMonitor.triggerGarbageCollection();
    }

    // Cleanup agent service
    if (agentService) {
      try {
        await agentService.terminate();
        logger.info("Agent service terminated successfully");
      } catch (error) {
        logger.error("Error during agent service termination:", error);
      }
      agentService = null;
    }

    if (unsubscribeBrowser) {
      unsubscribeBrowser();
    }

    if (unsubscribeStore) {
      unsubscribeStore();
    }

    if (unsubscribeVibe) {
      unsubscribeVibe();
    }

    // Destroy browser instance (will clean up its own menu)
    if (browser) {
      browser.destroy();
    }

    // Close all windows
    BrowserWindow.getAllWindows().forEach(window => {
      if (!window.isDestroyed()) {
        window.removeAllListeners();
        window.close();
      }
    });

    // Console cleanup no longer needed with proper logging system

    app.quit();

    setTimeout(() => {
      process.exit(0);
    }, 3000);
  } catch {
    // Console cleanup no longer needed with proper logging system
    process.exit(1);
  }
}

// Register signal handlers
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGHUP", () => gracefulShutdown("SIGHUP"));
process.on("EPIPE", () => {
  if (!isShuttingDown) {
    gracefulShutdown("EPIPE");
  }
});

process.stdout.on("error", err => {
  if (err.code === "EPIPE" || err.code === "EIO") {
    gracefulShutdown("STDOUT_ERROR");
  }
});

process.stderr.on("error", err => {
  if (err.code === "EPIPE" || err.code === "EIO") {
    gracefulShutdown("STDERR_ERROR");
  }
});

function printHeader(): void {
  const buildType = app.isPackaged ? "Production" : "Development";
  logger.info(`Vibe Browser ${buildType} Build (${app.getVersion()})`);
}

async function createInitialWindow(): Promise<void> {
  if (!browser) {
    logger.error("Browser instance not available");
    return;
  }

  const mainWindow = await browser.createWindow();

  // Open devtools in development
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  // Check if this is the first run and open onboarding if needed
  const firstRun = isFirstRun();
  if (firstRun) {
    logger.info("First run detected - will open onboarding window");

    // Wait a bit for the main window to be fully ready
    setTimeout(() => {
      openOnboardingForFirstRun(browser, detectedBrowsers);
    }, 2000); // 2 second delay to ensure everything is loaded
  }
}

function initializeApp(): boolean {
  const gotTheLock = app.requestSingleInstanceLock();

  if (!gotTheLock) {
    logger.info("Another instance already running, exiting");
    return false;
  }

  printHeader();

  // Initialize the Browser
  browser = new Browser();

  // Setup second instance handler
  app.on("second-instance", () => {
    if (!browser) return;

    const mainWindow = browser.getMainWindow();
    if (mainWindow) {
      mainWindow.focus();
    } else {
      createInitialWindow();
    }
  });

  // Register IPC handlers
  unsubscribeVibe = registerAllIpcHandlers(browser);

  // Initialize memory monitoring
  memoryMonitor = setupMemoryMonitoring();

  // Connect browser instance to memory monitor
  if (memoryMonitor && browser) {
    memoryMonitor.setBrowserInstance(browser);
  }

  app.on("will-quit", _event => {
    // Force close any remaining resources
    if (browser) {
      browser = null;
    }

    // Force exit after a timeout if process doesn't exit cleanly
    setTimeout(() => {
      process.exit(0);
    }, 2000);
  });

  return true;
}

/**
 * Initializes application services, including analytics and the AgentService if an OpenAI API key is present.
 *
 * If the `OPENAI_API_KEY` environment variable is set, this function creates and configures the AgentService, sets up event listeners, and injects the service into relevant IPC handlers. If the key is missing, service initialization is skipped and a warning is logged.
 *
 * @throws If service initialization fails unexpectedly.
 */
async function initializeServices(): Promise<void> {
  try {
    // Initialize simple analytics instead of complex telemetry system
    logger.info("Using simplified analytics system");
    
    // Detect browsers and store globally
    detect((err, results) => {
      if (err) {
        logger.error(err.message || String(err));
        detectedBrowsers = []; // Set empty array on error
      } else {
        detectedBrowsers = results || [];
        logger.info(`Detected ${detectedBrowsers.length} browsers:`, detectedBrowsers.map(b => b.name));
      }
    });
    // Log app startup
    logger.info("App startup complete", {
      version: app.getVersion(),
      platform: process.platform,
      environment: process.env.NODE_ENV || "development",
      has_openai_key: !!process.env.OPENAI_API_KEY,
    });

    if (process.env.OPENAI_API_KEY) {
      // Initialize agent service after MCP is ready
      await new Promise(resolve => {
        setTimeout(async () => {
          try {
            logger.info(
              "Initializing AgentService with utility process isolation",
            );

            // Create AgentService instance
            agentService = new AgentService();

            // Set up error handling for agent service
            agentService.on("error", error => {
              logger.error("AgentService error:", error);
            });

            agentService.on("terminated", data => {
              logger.info("AgentService terminated:", data);
            });

            agentService.on("ready", data => {
              logger.info("AgentService ready:", data);
            });

            // Initialize with configuration
            await agentService.initialize({
              openaiApiKey: process.env.OPENAI_API_KEY!,
              model: "gpt-4o-mini",
              processorType: "react",
            });

            // Inject agent service into IPC handlers
            setAgentStatusInstance(agentService);
            setChatMessagingInstance(agentService);
            setTabAgentInstance(agentService);

            logger.info(
              "AgentService initialized successfully with utility process isolation",
            );
            resolve(void 0);
          } catch (error) {
            logger.error(
              "AgentService initialization failed:",
              error instanceof Error ? error.message : String(error),
            );

            // Log agent initialization failure
            logger.error("Agent initialization failed:", error);

            resolve(void 0); // Don't fail the whole startup process
          }
        }, 500);
      });
    } else {
      logger.warn("OPENAI_API_KEY not found, skipping service initialization");
    }
  } catch (error) {
    logger.error(
      "Service initialization failed:",
      error instanceof Error ? error.message : String(error),
    );

    // Log service initialization failure
    logger.error("Service initialization failed:", error);

    throw error;
  }
}

// Main application initialization
app.whenReady().then(() => {
  app.on("browser-window-created", (_, window) => {
    //PDFWindow.addSupport(window);
    optimizer.watchWindowShortcuts(window);
  });

  const initialized = initializeApp();
  if (!initialized) {
    app.quit();
    return;
  }

  // Initialize services and create initial window
  initializeServices()
    .then(() => createInitialWindow())
    .then(() => {
      // Track app startup after window is ready
      setTimeout(() => {
        const windows = browser?.getAllWindows();
        if (windows && windows.length > 0) {
          const mainWindow = windows[0];
          if (
            mainWindow &&
            mainWindow.webContents &&
            !mainWindow.webContents.isDestroyed()
          ) {
            //TODO: move to ipc service
            const appUpdater = new AppUpdater(mainWindow);
            appUpdater.checkForUpdates();
            mainWindow.webContents
              .executeJavaScript(
                `
              if (window.umami && typeof window.umami.track === 'function') {
                window.umami.track('app-started', {
                  version: '${app.getVersion()}',
                  platform: '${process.platform}',
                  timestamp: ${Date.now()}
                });
              }
            `,
              )
              .catch(err => {
                logger.error("Failed to track app startup", {
                  error: err.message,
                });
              });
          }
        }
      }, 1000); // Small delay to ensure renderer is ready
    })
    .catch(error => {
      logger.error(
        "Error during initialization:",
        error instanceof Error ? error.message : String(error),
      );
    });
});

// App lifecycle events
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createInitialWindow();
  }
});

app.on("before-quit", async _event => {
  // Track app shutdown
  try {
    const windows = browser?.getAllWindows();
    if (windows && windows.length > 0) {
      const mainWindow = windows[0];
      if (
        mainWindow &&
        mainWindow.webContents &&
        !mainWindow.webContents.isDestroyed()
      ) {
        await mainWindow.webContents
          .executeJavaScript(
            `
          if (window.umami && typeof window.umami.track === 'function') {
            window.umami.track('app-shutdown', {
              uptime_ms: ${process.uptime() * 1000},
              timestamp: ${Date.now()}
            });
          }
        `,
          )
          .catch(err => {
            logger.error("Failed to track app shutdown", {
              error: err.message,
            });
          });
      }
    }
  } catch (error) {
    logger.error("Error during shutdown tracking:", error);
  }

  // Log app shutdown
  try {
    logger.info("App shutdown", {
      uptime_ms: process.uptime() * 1000,
      clean_exit: true,
    });
  } catch (error) {
    logger.error("Error during shutdown logging:", error);
  }

  // Clean up browser resources
  if (browser && !browser.isDestroyed()) {
    browser.destroy();
  }

  // Clean up memory monitor
  if (memoryMonitor) {
    memoryMonitor = null;
  }

  // Clean up IPC handlers
  if (unsubscribeVibe) {
    unsubscribeVibe();
    unsubscribeVibe = null;
  }

  // Force garbage collection
  if (global.gc) {
    global.gc();
  }
});

// Platform-specific handling
app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});
