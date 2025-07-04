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
  Tray,
  nativeImage,
  Menu,
  ipcMain,
  globalShortcut,
} from "electron";
import { optimizer } from "@electron-toolkit/utils";
import { config } from "dotenv";
import * as path from "path";

import { Browser } from "@/browser/browser";
import { registerAllIpcHandlers } from "@/ipc";
import { setupMemoryMonitoring } from "@/utils/helpers";
import { registerImgProtocol } from "@/browser/protocol-handler";
import { AgentService } from "@/services/agent-service";
import { MCPService } from "@/services/mcp-service";
import { setMCPServiceInstance } from "@/ipc/mcp/mcp-status";
import { setAgentServiceInstance as setAgentStatusInstance } from "@/ipc/chat/agent-status";
import { setAgentServiceInstance as setChatMessagingInstance } from "@/ipc/chat/chat-messaging";
import { setAgentServiceInstance as setTabAgentInstance } from "@/utils/tab-agent";
import { useUserProfileStore } from "@/store/user-profile-store";
import {
  createLogger,
  MAIN_PROCESS_CONFIG,
  findFileUpwards,
} from "@vibe/shared-types";
import {
  init,
  browserWindowSessionIntegration,
  childProcessIntegration,
} from "@sentry/electron/main";
import AppUpdater from "./services/update-service";
import { resourcesPath } from "process";

let tray;

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
app.commandLine.appendSwitch("enable-experimental-web-platform-features");
app.commandLine.appendSwitch("optimization-guide-on-device-model");
app.commandLine.appendSwitch("prompt-api-for-gemini-nano");
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

if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient("vibe", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
  }
} else {
  app.setAsDefaultProtocolClient("vibe");
}

// Load environment variables
const envPath = findFileUpwards(__dirname, ".env");
if (envPath) {
  config({ path: envPath });
} else {
  logger.warn(".env file not found in directory tree");
}

// Global browser instance
export let browser: Browser | null = null;

// Global agent service instance
let agentService: AgentService | null = null;

// Global MCP service instance
let mcpService: MCPService | null = null;

// Track shutdown state
let isShuttingDown = false;

// Cleanup functions
let unsubscribeVibe: (() => void) | null = null;
const unsubscribeStore: (() => void) | null = null;
const unsubscribeBrowser: (() => void) | null = null;
let memoryMonitor: ReturnType<typeof setupMemoryMonitoring> | null = null;

// Track last C key press for double-press detection
let lastCPressTime = 0;

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

/**
 * Handles the "CC" global shortcut to open chat panel and focus chat input
 */
function handleCCShortcut(): void {
  try {
    if (!browser) {
      logger.warn("Browser not available for CC shortcut");
      return;
    }

    const mainWindow = browser.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      logger.warn("Main window not available for CC shortcut");
      return;
    }

    // Get current chat panel state
    const appWindow = browser.getApplicationWindow(mainWindow.id);
    if (!appWindow) {
      logger.warn("Application window not found for CC shortcut");
      return;
    }

    const chatPanelState = appWindow.viewManager.getChatPanelState();

    if (!chatPanelState.isVisible) {
      // Chat panel is closed, open it and focus the input
      appWindow.viewManager.toggleChatPanel(true);
      logger.info("CC shortcut: Opened chat panel");

      // Focus chat input after a short delay to ensure panel is rendered
      setTimeout(() => {
        mainWindow.webContents
          .executeJavaScript(
            `
          const chatInput = document.querySelector('.chat-input-field');
          if (chatInput) {
            chatInput.focus();
            console.log('CC shortcut: Focused chat input');
          } else {
            console.log('CC shortcut: Chat input not found');
          }
        `,
          )
          .catch(err => {
            logger.error("Failed to focus chat input:", err);
          });
      }, 100);
    } else {
      // Chat panel is already open, just focus the input
      mainWindow.webContents
        .executeJavaScript(
          `
        const chatInput = document.querySelector('.chat-input-field');
        if (chatInput) {
          chatInput.focus();
          console.log('CC shortcut: Focused chat input (panel already open)');
        } else {
          console.log('CC shortcut: Chat input not found');
        }
      `,
        )
        .catch(err => {
          logger.error("Failed to focus chat input:", err);
        });
    }
  } catch (error) {
    logger.error("Error handling CC shortcut:", error);
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
    // Initialize user profile store
    logger.info("Initializing user profile store");
    const userProfileStore = useUserProfileStore.getState();
    await userProfileStore.loadProfiles();
    logger.info("User profile store initialized");

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
  if (isProd) {
    //updater.init();
  }
  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  const icon = nativeImage.createFromDataURL(
    "data:image/png;base64,AAABAAQADBACAAEAAQCwAAAARgAAABggAgABAAEAMAEAAPYAAAAkMAIAAQABADADAAAmAgAAMEACAAEAAQAwBAAAVgUAACgAAAAMAAAAIAAAAAEAAQAAAAAAQAAAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAABgAAABAAAAAAQABAAAAAACAAAAAww4AAMMOAAACAAAAAgAAAD9XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAkAAAAYAAAAAEAAQAAAAAAgAEAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAwAAAAgAAAAAEAAQAAAAAAAAIAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  );
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: "Item1", type: "radio" },
    { label: "Item2", type: "radio" },
    { label: "Item3", type: "radio", checked: true },
    { label: "Item4", type: "radio" },
  ]);

  tray.setToolTip("Vibing");
  tray.setContextMenu(contextMenu);

  // Register the global img:// protocol for PDF handling
  registerImgProtocol();

  const initialized = initializeApp();
  if (!initialized) {
    app.quit();
    return;
  }

  // Register global shortcuts
  const ccShortcutRegistered = globalShortcut.register(
    "CommandOrControl+C",
    () => {
      // Check if this is a double-press (CC)
      const now = Date.now();
      if (now - lastCPressTime < 300) {
        // Double press detected, handle CC shortcut
        lastCPressTime = 0;
        handleCCShortcut();
      } else {
        // Set a timeout to reset if no second press
        lastCPressTime = now;
      }
    },
  );

  if (ccShortcutRegistered) {
    logger.info("CC global shortcut registered successfully");
  } else {
    logger.error("Failed to register CC global shortcut");
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

app.on("before-quit", async () => {
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

  // Clean up global shortcuts
  globalShortcut.unregisterAll();

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

const iconName = path.join(resourcesPath, "icon.png");

//drag-n-drop
ipcMain.on("ondragstart", (event, filePath) => {
  event.sender.startDrag({
    file: path.join(__dirname, filePath),
    icon: iconName,
  });
});

//deeplink handling
app.on("open-url", (_event, url) => {
  dialog.showErrorBox("Welcome Back", `You arrived from: ${url}`);
});
