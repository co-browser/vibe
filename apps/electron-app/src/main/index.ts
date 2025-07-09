/**
 * Main process entry point for Vibe Browser
 */

import {
  app,
  BrowserWindow,
  dialog,
  shell,
  powerMonitor,
  powerSaveBlocker,
  protocol,
  net,
} from "electron";
import { join } from "path";
import { optimizer } from "@electron-toolkit/utils";
import { config } from "dotenv";

import { Browser } from "@/browser/browser";
import { registerAllIpcHandlers } from "@/ipc";
import { setupMemoryMonitoring } from "@/utils/helpers";
import { AgentService } from "@/services/agent-service";
import { MCPService } from "@/services/mcp-service";
import { setMCPServiceInstance } from "@/ipc/mcp/mcp-status";
import { setAgentServiceInstance as setAgentStatusInstance } from "@/ipc/chat/agent-status";
import { setAgentServiceInstance as setChatMessagingInstance } from "@/ipc/chat/chat-messaging";
import { setAgentServiceInstance as setTabAgentInstance } from "@/utils/tab-agent";
import { initializeStorage } from "@/store/initialize-storage";
import { getStorageService } from "@/store/storage-service";
import { createLogger, MAIN_PROCESS_CONFIG } from "@vibe/shared-types";
import { findFileUpwards } from "@vibe/shared-types/utils/path";

import {
  init,
  browserWindowSessionIntegration,
  childProcessIntegration,
} from "@sentry/electron/main";
import AppUpdater from "./services/update-service";
import log from "electron-log";

// Configure electron-log to write to file
log.transports.file.level = "info";
log.transports.file.fileName = "main.log";
log.transports.console.level =
  process.env.NODE_ENV === "development" ? "info" : "error";

// Set consistent log level for all processes
if (!process.env.LOG_LEVEL) {
  process.env.LOG_LEVEL =
    process.env.NODE_ENV === "development" ? "info" : "error";
}

// Reduce Sentry noise in development
if (process.env.NODE_ENV === "development") {
  // Silence verbose Sentry logs
  process.env.SENTRY_LOG_LEVEL = "error";
}

const logger = createLogger("main-process");

const isProd: boolean = process.env.NODE_ENV === "production";

// Initialize Sentry for error tracking
init({
  dsn: "https://21ac611f0272b8931073fa7ecc36c600@o4509464945623040.ingest.de.sentry.io/4509464948899920",
  debug: !isProd,
  integrations: [browserWindowSessionIntegration(), childProcessIntegration()],
  tracesSampleRate: isProd ? 0.1 : 1.0,
  tracePropagationTargets: ["localhost"],
  onFatalError: () => {},
});

// Simple logging only for now

// Load environment variables only in development
// In production, environment variables should be set via LSEnvironment or system
let envPath: string | null = null;
if (!app.isPackaged) {
  envPath = findFileUpwards(__dirname, ".env");
  if (envPath) {
    config({ path: envPath });
    logger.info(`Loaded environment variables from: ${envPath}`);
  } else {
    logger.warn(".env file not found in directory tree");
  }
} else {
  logger.info("Running in packaged mode, skipping .env file loading");
}

// ---------------------------------------------------------------------------
// 🛠  Local RAG server toggle
// ---------------------------------------------------------------------------
// 1. In packaged (production) builds we *never* want to start the local RAG
//    server unless the user explicitly opts-in.  Finder launches inherit a
//    sparse environment which can accidentally pick up a lingering
//    USE_LOCAL_RAG_SERVER=TRUE from a previous shell or system-wide export.
// 2. To avoid surprises we forcibly set the variable to "false" for packaged
//    apps **unless** the user passes `--enable-local-rag` on the command line.

const userEnabledLocalRag = process.argv.includes("--enable-local-rag");

if (app.isPackaged) {
  if (userEnabledLocalRag) {
    process.env.USE_LOCAL_RAG_SERVER = "true";
    logger.info("User flag detected – enabling local RAG server");
  } else {
    if (process.env.USE_LOCAL_RAG_SERVER !== "false") {
      logger.info(
        `Overriding USE_LOCAL_RAG_SERVER (${process.env.USE_LOCAL_RAG_SERVER}) → false for packaged build`,
      );
    }
    process.env.USE_LOCAL_RAG_SERVER = "false";
  }
} else {
  // Development: if not set, default to false to avoid unintended server spin-up
  if (!process.env.USE_LOCAL_RAG_SERVER) {
    process.env.USE_LOCAL_RAG_SERVER = "false";
  }
}
// ---------------------------------------------------------------------------

// Handle USE_LOCAL_GMAIL_AUTH for production builds
// Similar to RAG server, we force it to false unless explicitly enabled
if (app.isPackaged) {
  if (process.env.USE_LOCAL_GMAIL_AUTH !== "true") {
    process.env.USE_LOCAL_GMAIL_AUTH = "false";
    logger.info("Setting USE_LOCAL_GMAIL_AUTH to false for packaged build");
  }
} else {
  // Development: if not set, default to false
  if (!process.env.USE_LOCAL_GMAIL_AUTH) {
    process.env.USE_LOCAL_GMAIL_AUTH = "false";
  }
}

// Debug: Log environment state after loading
logger.debug("Main Process Environment:", {
  USE_LOCAL_RAG_SERVER: process.env.USE_LOCAL_RAG_SERVER || "undefined",
  USE_LOCAL_GMAIL_AUTH: process.env.USE_LOCAL_GMAIL_AUTH || "undefined",
  NODE_ENV: process.env.NODE_ENV || "undefined",
  PATH: process.env.PATH
    ? `${process.env.PATH.substring(0, 100)}...`
    : "undefined",
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ? "present" : "not set",
  envFileFound: !!envPath,
  isPackaged: app.isPackaged,
  LaunchMethod: process.env.PATH?.includes("/usr/local/bin")
    ? "terminal"
    : "finder/dock",
});

// Global browser instance
export let browser: Browser | null = null;

// Global agent service instance
let agentService: AgentService | null = null;

// Global MCP service instance
let mcpService: MCPService | null = null;

// Track shutdown state
let isShuttingDown = false;
let browserDestroyed = false;

// Cleanup functions
let unsubscribeVibe: (() => void) | null = null;
const unsubscribeStore: (() => void) | null = null;
const unsubscribeBrowser: (() => void) | null = null;
let memoryMonitor: ReturnType<typeof setupMemoryMonitoring> | null = null;

// Register custom protocol as secure for WebCrypto API support
protocol.registerSchemesAsPrivileged([
  {
    scheme: "vibe",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

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
    // No need to encrypt on shutdown - new storage encrypts on write
    logger.info("Shutting down - storage automatically encrypted");

    // Clean up resources
    if (memoryMonitor) {
      memoryMonitor.triggerGarbageCollection();
    }

    // Cleanup MCP service first (before agent)
    if (mcpService) {
      try {
        await mcpService.terminate();
        logger.info("MCP service terminated successfully");
      } catch (error) {
        logger.error("Error during MCP service termination:", error);
      }
      mcpService = null;
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
    if (browser && !browserDestroyed) {
      browserDestroyed = true;
      await browser.destroy();
      browser = null;
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

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }
}

function broadcastChatPanelState(): void {
  if (!browser) return;

  try {
    const allWindows = browser.getAllWindows();

    allWindows.forEach(browserWindow => {
      if (browserWindow && !browserWindow.isDestroyed()) {
        const appWindow = browser?.getApplicationWindow(
          browserWindow.webContents.id,
        );
        const chatPanelState = appWindow?.viewManager?.getChatPanelState() || {
          isVisible: false,
        };
        browserWindow.webContents.send("sync-chat-panel-state", chatPanelState);
      }
    });
  } catch (error) {
    logger.error("Error during chat panel state broadcast:", error);
  }
}

function setupChatPanelRecovery(): void {
  try {
    const USE_POWER_SAVE_BLOCKER = process.env.VIBE_PREVENT_SLEEP === "true";
    let powerSaveBlockerId: number | null = null;

    if (USE_POWER_SAVE_BLOCKER) {
      powerSaveBlockerId = powerSaveBlocker.start("prevent-display-sleep");
    }

    powerMonitor.on("resume", () => {
      setTimeout(() => {
        broadcastChatPanelState();
      }, 1000);
    });

    powerMonitor.on("unlock-screen", () => {
      setTimeout(() => {
        broadcastChatPanelState();
      }, 500);
    });

    app.on("browser-window-focus", (_event, window) => {
      setTimeout(() => {
        if (window && !window.isDestroyed()) {
          const appWindow = browser?.getApplicationWindow(
            window.webContents.id,
          );
          const chatPanelState =
            appWindow?.viewManager?.getChatPanelState() || { isVisible: false };
          window.webContents.send("sync-chat-panel-state", chatPanelState);
        }
      }, 500);
    });

    app.on("will-quit", () => {
      if (
        powerSaveBlockerId !== null &&
        powerSaveBlocker.isStarted(powerSaveBlockerId)
      ) {
        powerSaveBlocker.stop(powerSaveBlockerId);
      }
    });
  } catch (error) {
    logger.error("Failed to setup chat panel recovery:", error);
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

  // Setup chat panel recovery system
  setupChatPanelRecovery();

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

  app.on("will-quit", event => {
    // If we're not already shutting down, prevent quit and use graceful shutdown
    if (!isShuttingDown) {
      event.preventDefault();
      gracefulShutdown("will-quit");
      return;
    }

    // Force close any remaining resources
    if (browser && !browserDestroyed) {
      browserDestroyed = true;
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

    // Log app startup
    logger.info("App startup complete", {
      version: app.getVersion(),
      platform: process.platform,
      environment: process.env.NODE_ENV || "development",
      has_openai_key: !!process.env.OPENAI_API_KEY,
    });

    // Initialize MCP service first (before agent)
    try {
      logger.info("Initializing MCP service");

      mcpService = new MCPService();

      // Set up error handling for MCP service
      mcpService.on("error", error => {
        logger.error("MCPService error:", error);
      });

      mcpService.on("ready", () => {
        logger.info("MCPService ready");
      });

      // Initialize MCP service
      await mcpService.initialize();

      // Inject MCP service into IPC handlers
      setMCPServiceInstance(mcpService);

      logger.info("MCP service initialized successfully");
    } catch (error) {
      logger.error("MCP service initialization failed:", error);
      // MCP service failed to initialize - this may impact functionality
      logger.warn("Application will continue without MCP service");
    }
    // Wait for MCP service to be ready before initializing agent
    if (mcpService) {
      const mcpStatus = mcpService.getStatus();
      if (mcpStatus.serviceStatus !== "ready") {
        logger.info(
          "Waiting for MCP service to be ready before initializing agent...",
        );
        await Promise.race([
          new Promise<void>(resolve => {
            const checkReady = () => {
              if (!mcpService) {
                resolve();
                return;
              }
              const status = mcpService.getStatus();
              if (status.serviceStatus === "ready") {
                resolve();
              }
            };

            // Check immediately in case it's already ready
            checkReady();

            // If not ready, wait for ready event
            if (
              mcpService &&
              mcpService.getStatus().serviceStatus !== "ready"
            ) {
              mcpService.once("ready", () => {
                logger.info("MCP service is now ready");
                resolve();
              });

              // Also listen for error event to avoid hanging forever
              mcpService.once("error", error => {
                logger.warn("MCP service failed to initialize:", error);
                resolve(); // Continue anyway
              });
            }
          }),
          new Promise<void>(resolve => {
            setTimeout(() => {
              logger.warn(
                "MCP service readiness timeout after 30s, continuing anyway",
              );
              resolve();
            }, 30000);
          }),
        ]);
      }
    } else {
      logger.info(
        "No MCP service available, proceeding with agent initialization",
      );
    }

    // Now initialize agent service
    try {
      logger.info("Initializing AgentService with utility process isolation");

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

      agentService.on("status-changed", () => {
        logger.info("AgentService status changed, broadcasting to renderers");
        // Broadcast to all windows
        const allWindows = browser?.getAllWindows() || [];
        allWindows.forEach(browserWindow => {
          if (browserWindow && !browserWindow.isDestroyed()) {
            browserWindow.webContents.send("agent:status-changed");
          }
        });
      });

      // Get auth token from proper storage mechanism
      const { getAuthToken } = await import("./ipc/app/app-info.js");
      const authToken = getAuthToken();

      // Initialize with configuration
      await agentService.initialize({
        openaiApiKey: process.env.OPENAI_API_KEY, // Allow undefined - agent service will check storage
        model: "gpt-4o-mini",
        processorType: "react",
        authToken: authToken ?? undefined,
      });

      // Inject agent service into IPC handlers
      setAgentStatusInstance(agentService);
      setChatMessagingInstance(agentService);
      setTabAgentInstance(agentService);

      logger.info(
        "AgentService initialized successfully with utility process isolation",
      );
    } catch (error) {
      logger.error(
        "AgentService initialization failed:",
        error instanceof Error ? error.message : String(error),
      );

      // Log agent initialization failure
      logger.error("Agent initialization failed:", error);
      // Don't fail the whole startup process - app can work without agent
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
app.whenReady().then(async () => {
  // Initialize storage first
  try {
    await initializeStorage();

    // Check if this is first launch
    const storage = getStorageService();
    const firstLaunchComplete = storage.get("_firstLaunchComplete", false);

    if (!firstLaunchComplete) {
      logger.info("First launch detected - waiting for onboarding completion");
    } else {
      logger.info("Storage initialized successfully");
    }
  } catch (error) {
    logger.error("Failed to initialize storage:", error);
  }

  // Register the custom protocol handler for secure context
  protocol.handle("vibe", request => {
    const url = new URL(request.url);
    const normalizedPath = url.pathname.replace(/^\//, ""); // Remove leading slash
    const filePath = join(__dirname, "../renderer", normalizedPath);
    return net.fetch(`file://${filePath}`);
  });

  if (isProd) {
    //updater.init();
  }
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const initialized = initializeApp();
  if (!initialized) {
    // Use gracefulShutdown instead of app.quit()
    gracefulShutdown("initialization-failed");
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
    // Use gracefulShutdown instead of app.quit()
    gracefulShutdown("window-all-closed");
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createInitialWindow();
  }
});

app.on("before-quit", async event => {
  // Prevent default quit behavior if already shutting down
  if (isShuttingDown) {
    event.preventDefault();
    return;
  }

  // No longer need to prevent default for encryption
  // Storage automatically encrypts on write

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
  if (browser && !browserDestroyed && !browser.isDestroyed()) {
    browserDestroyed = true;
    browser.destroy();
    browser = null;
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
