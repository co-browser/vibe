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
  protocol,
} from "electron";
import { optimizer } from "@electron-toolkit/utils";
import { config } from "dotenv";
import * as path from "path";
import * as fs from "fs";
// import { autoUpdater } from "electron-updater";
import ElectronGoogleOAuth2 from "@getstation/electron-google-oauth2";

import { Browser } from "@/browser/browser";
import { registerAllIpcHandlers } from "@/ipc";
import { setupMemoryMonitoring } from "@/utils/helpers";
import { registerImgProtocol } from "@/browser/protocol-handler";
import { AgentService } from "@/services/agent-service";
import { setupCopyFix } from "@/browser/copy-fix";
import { MCPService } from "@/services/mcp-service";
import { NotificationService } from "@/services/notification-service";
import { setMCPServiceInstance } from "@/ipc/mcp/mcp-status";
import { setAgentServiceInstance as setAgentStatusInstance } from "@/ipc/chat/agent-status";
// import { sendTabToAgent } from "@/utils/tab-agent";
import { setAgentServiceInstance as setChatMessagingInstance } from "@/ipc/chat/chat-messaging";
import { setAgentServiceInstance as setTabAgentInstance } from "@/utils/tab-agent";
import { useUserProfileStore } from "@/store/user-profile-store";
import { initializeSessionManager } from "@/browser/session-manager";
import { FileDropService } from "@/services/file-drop-service";
import { userAnalytics } from "@/services/user-analytics";
import {
  createLogger,
  MAIN_PROCESS_CONFIG,
  findFileUpwards,
} from "@vibe/shared-types";
import {
  browserWindowSessionIntegration,
  childProcessIntegration,
} from "@sentry/electron/main";
import { UpdateService } from "./services/update";
import { resourcesPath } from "process";
import { WindowBroadcast } from "./utils/window-broadcast";
import { DebounceManager } from "./utils/debounce";
import { init } from "@sentry/electron/main";

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

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  logger.info("Another instance is already running. Exiting...");
  app.quit();
} else {
  // Handle when someone tries to run a second instance
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    logger.info("Second instance detected, focusing existing window");
    
    // Focus existing window if it exists
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      const mainWindow = windows[0];
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

// Initialize Sentry for error tracking
init({
  dsn: "https://21ac611f0272b8931073fa7ecc36c600@o4509464945623040.ingest.de.sentry.io/4509464948899920",
  debug: !isProd,
  integrations: [browserWindowSessionIntegration(), childProcessIntegration()],
  tracesSampleRate: isProd ? 0.1 : 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/(www\.)?gstatic\.com\//],
  onFatalError: () => {},
});

// Set up protocol handler for deep links
const isDefaultApp =
  process.defaultApp || process.mas || process.env.NODE_ENV === "development";

if (isDefaultApp) {
  if (process.argv.length >= 2) {
    const result = app.setAsDefaultProtocolClient("vibe", process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    logger.info(
      `Protocol handler registration (dev): ${result ? "success" : "failed"}`,
    );
  }
} else {
  const result = app.setAsDefaultProtocolClient("vibe");
  logger.info(
    `Protocol handler registration (prod): ${result ? "success" : "failed"}`,
  );
}

// Check if we're already the default protocol client
if (app.isDefaultProtocolClient("vibe")) {
  logger.info(
    "Vibe is registered as the default protocol client for vibe:// URLs",
  );
} else {
  logger.warn(
    "Vibe is NOT registered as the default protocol client for vibe:// URLs",
  );
  logger.warn(
    "Deep links may not work until the app is set as the default handler",
  );
}

// Load environment variables
const envPath = findFileUpwards(__dirname, ".env");
process.env.GOOGLE_API_KEY = 'AIzaSyAo6-3Yo9qYGtxlzFzcDgnIHoBGHiGZUTM'

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

// Global notification service instance
let notificationService: NotificationService | null = null;

// Global file drop service instance
let fileDropService: FileDropService | null = null;

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
    // Track session end
    userAnalytics.trackSessionEnd();

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

    // Clean up notification service
    if (notificationService) {
      try {
        await notificationService.destroy();
        logger.info("Notification service destroyed successfully");
      } catch (error) {
        logger.error("Error during notification service cleanup:", error);
      }
      notificationService = null;
    }

    // Clean up file drop service
    if (fileDropService) {
      try {
        // No explicit cleanup needed for FileDropService singleton
        logger.info("File drop service cleaned up successfully");
      } catch (error) {
        logger.error("Error during file drop service cleanup:", error);
      }
      fileDropService = null;
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

  // Setup file drop handling for the new window
  if (fileDropService) {
    fileDropService.setupWindowDropHandling(mainWindow);
  }

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
      // Use the same notification flow as the agent toggle button
      // This ensures proper state synchronization across all components
      appWindow.viewManager.toggleChatPanel(true);

      // Send the same notification that the IPC handler sends
      mainWindow.webContents.send("chat-area-visibility-changed", true);

      logger.info("CC shortcut: Opened chat panel with proper notifications");

      // Focus chat input after a short delay to ensure panel is rendered
      setTimeout(() => {
        mainWindow.webContents
          .executeJavaScript(
            `
          const chatInput = document.querySelector('.chat-input-field');
          if (chatInput) {
            chatInput.focus();
            // CC shortcut: Focused chat input
          } else {
            // CC shortcut: Chat input not found
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
          // CC shortcut: Focused chat input (panel already open)
        } else {
          // CC shortcut: Chat input not found
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

  // Setup copy fix for macOS
  setupCopyFix();

  // Setup chat panel recovery system
  setupChatPanelRecovery();

  // Setup second instance handler
  app.on("second-instance", (event, commandLine, workingDirectory) => {
    logger.info("Second instance detected", { commandLine, workingDirectory });

    if (!browser) return;

    // Check if there's a protocol URL in the command line arguments
    const protocolUrl = commandLine.find(arg => arg.startsWith("vibe://"));
    if (protocolUrl) {
      logger.info(`Second instance with protocol URL: ${protocolUrl}`);
      // Trigger the open-url handler manually for second instance
      app.emit("open-url", event, protocolUrl);
    }

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
 * Initializes essential services required for the window to function.
 * These services must be ready before the window can be created.
 */
async function initializeEssentialServices(): Promise<void> {
  try {
    // Initialize session manager first
    logger.info("Initializing session manager");
    initializeSessionManager();
    logger.info("Session manager initialized");

    // Initialize file drop service (needed for window drop handling)
    try {
      logger.info("Initializing file drop service");
      fileDropService = FileDropService.getInstance();
      logger.info("File drop service initialized successfully");
    } catch (error) {
      logger.error("File drop service initialization failed:", error);
      logger.warn("Application will continue without file drop functionality");
    }

    logger.info("Essential services initialized successfully");
  } catch (error) {
    logger.error(
      "Essential service initialization failed:",
      error instanceof Error ? error.message : String(error),
    );
    throw error;
  }
}

/**
 * Initializes background services that don't block window creation.
 * These services run asynchronously and broadcast their status when ready.
 */
async function initializeBackgroundServices(): Promise<void> {
  try {
    logger.info("Starting background service initialization");

    // Initialize user profile store
    logger.info("Initializing user profile store");
    const userProfileStore = useUserProfileStore.getState();
    await userProfileStore.initialize();
    logger.info("User profile store initialized");

    // Test profile system
    const testProfile = userProfileStore.getActiveProfile();
    logger.info("Profile system test:", {
      hasActiveProfile: !!testProfile,
      profileId: testProfile?.id,
      profileName: testProfile?.name,
      isStoreReady: userProfileStore.isStoreReady(),
      profilesCount: userProfileStore.profiles.size,
    });

    // Broadcast user profile ready status
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send("service-status", {
          service: "user-profile",
          status: "ready",
          data: { hasActiveProfile: !!testProfile },
        });
      }
    });

    // Initialize notification service
    try {
      logger.info("Initializing notification service");
      notificationService = NotificationService.getInstance();
      await notificationService.initialize();
      logger.info("Notification service initialized successfully");

      // Broadcast notification service ready status
      allWindows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send("service-status", {
            service: "notifications",
            status: "ready",
          });
        }
      });
    } catch (error) {
      logger.error("Notification service initialization failed:", error);
      logger.warn(
        "Application will continue without enhanced notification features",
      );
    }

    // Initialize simple analytics instead of complex telemetry system
    logger.info("Using simplified analytics system");

    // Log app startup
    logger.info("App startup complete", {
      version: app.getVersion(),
      platform: process.platform,
      environment: process.env.NODE_ENV || "development",
      has_openai_key: !!process.env.OPENAI_API_KEY,
    });

    // Initialize update service
    try {
      logger.info("Initializing update service");
      const updateService = new UpdateService();
      await updateService.initialize();
      logger.info("Update service initialized successfully");

      // Broadcast update service ready status
      allWindows.forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send("service-status", {
            service: "updates",
            status: "ready",
          });
        }
      });
    } catch (error) {
      logger.error("Update service initialization failed:", error);
      logger.warn("Application will continue without update service");
    }

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

        // Broadcast MCP service ready status
        const allWindows = BrowserWindow.getAllWindows();
        allWindows.forEach(window => {
          if (!window.isDestroyed()) {
            window.webContents.send("service-status", {
              service: "mcp",
              status: "ready",
            });
          }
        });
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

              // Broadcast agent service ready status
              const allWindows = BrowserWindow.getAllWindows();
              allWindows.forEach(window => {
                if (!window.isDestroyed()) {
                  window.webContents.send("service-status", {
                    service: "agent",
                    status: "ready",
                    data: data,
                  });
                }
              });
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

    logger.info("Background services initialization completed");
  } catch (error) {
    logger.error(
      "Background service initialization failed:",
      error instanceof Error ? error.message : String(error),
    );

    // Log service initialization failure
    logger.error("Background service initialization failed:", error);

    // Don't throw error - background services shouldn't crash the app
    logger.warn("Application will continue with reduced functionality");
  }
}

// Register standard schemes as privileged to enable WebAuthn
// This must be done before app.whenReady()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'https',
    privileges: {
      standard: true,
      secure: true,
      allowServiceWorkers: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  },
  {
    scheme: 'http',
    privileges: {
      standard: true,
      secure: false,
      allowServiceWorkers: false,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

// Main application initialization
app.whenReady().then(() => {
  if (isProd) {
    //updater.init();
  }

  app.on("ready", () => {
    const myApiOauth = new ElectronGoogleOAuth2(
      "756422833444-057sg8uit7bh2ocoepbahb0h9gsghh74.apps.googleusercontent.com",
      "CLIENT_SECRET",
      ["https://www.googleapis.com/auth/drive.metadata.readonly"],
    );

    myApiOauth.openAuthWindowAndGetTokens().then(token => {
      logger.info("Google OAuth token received", { token });
      // use your token.access_token
    });
  });

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Try to load tray icon from resources folder
  let trayIconPath: string;
  if (app.isPackaged) {
    // In production, use the resources path
    trayIconPath = path.join(process.resourcesPath, "tray.png");
  } else {
    // In development, use the local resources folder
    trayIconPath = path.join(__dirname, "../../resources/tray.png");
  }

  let icon: Electron.NativeImage;
  try {
    // Try to load from file first
    if (fs.existsSync(trayIconPath)) {
      const originalIcon = nativeImage.createFromPath(trayIconPath);

      // Resize based on platform
      // macOS: 22x22 for retina displays (will be 22x22 @1x or 44x44 @2x)
      // Windows/Linux: 16x16
      const size = process.platform === "darwin" ? 22 : 16;
      icon = originalIcon.resize({ width: size, height: size });

      logger.info(
        `Loaded and resized tray icon from: ${trayIconPath} to ${size}x${size}`,
      );
    } else {
      // Fallback to embedded base64 icon if file not found
      logger.warn(
        `Tray icon not found at: ${trayIconPath}, using embedded icon`,
      );
      const originalIcon = nativeImage.createFromDataURL(
        "data:image/png;base64,AAABAAQADBACAAEAAQCwAAAARgAAABggAgABAAEAMAEAAPYAAAAkMAIAAQABADADAAAmAgAAMEACAAEAAQAwBAAAVgUAACgAAAAMAAAAIAAAAAEAAQAAAAAAQAAAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAABgAAABAAAAAAQABAAAAAACAAAAAww4AAMMOAAACAAAAAgAAAD9XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAkAAAAYAAAAAEAAQAAAAAAgAEAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAwAAAAgAAAAAEAAQAAAAAAAAIAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      );

      // Resize the embedded icon too
      const size = process.platform === "darwin" ? 22 : 16;
      icon = originalIcon.resize({ width: size, height: size });
    }
  } catch (error) {
    logger.error("Failed to load tray icon:", error);
    // Use embedded icon as fallback
    const originalIcon = nativeImage.createFromDataURL(
      "data:image/png;base64,AAABAAQADBACAAEAAQCwAAAARgAAABggAgABAAEAMAEAAPYAAAAkMAIAAQABADADAAAmAgAAMEACAAEAAQAwBAAAVgUAACgAAAAMAAAAIAAAAAEAAQAAAAAAQAAAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKAAAABgAAABAAAAAAQABAAAAAACAAAAAww4AAMMOAAACAAAAAgAAAD9XAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAkAAAAYAAAAAEAAQAAAAAAgAEAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACgAAAAwAAAAgAAAAAEAAQAAAAAAAAIAAMMOAADDDgAAAgAAAAIAAAA/VwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    );

    // Resize the fallback icon too
    const size = process.platform === "darwin" ? 22 : 16;
    icon = originalIcon.resize({ width: size, height: size });
  }

  // On macOS, mark as template image so it adapts to light/dark mode
  if (process.platform === "darwin") {
    icon.setTemplateImage(true);
  }

  tray = new Tray(icon);

  // --- Differentiated Tray Menu ---
  // Provides quick access to Vibe's core AI features without needing to open the main window.

  // Update tray icon color based on persona
  const updateTrayIconForPersona = (persona: "work" | "pure" | "sexy") => {
    if (!tray || process.platform !== "darwin") return; // Only works on macOS with template images

    try {
      // Create a new image with persona color tint
      // Note: For macOS template images, we can't directly change color
      // But we can update the tooltip to indicate persona
      const personaColors = {
        work: "Work Mode (Blue)",
        pure: "Pure Mode (Yellow)",
        sexy: "Sexy Mode (Red)",
      };

      tray.setToolTip(`Vibing - ${personaColors[persona]}`);
    } catch (error) {
      logger.error("Failed to update tray icon for persona:", error);
    }
  };

  // Broadcast persona change to all windows
  const broadcastPersonaChange = (persona: "work" | "pure" | "sexy") => {
    const allWindows = BrowserWindow.getAllWindows();
    allWindows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send("persona:change", persona);
      }
    });

    // Update tray icon
    updateTrayIconForPersona(persona);
  };

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Writing Style",
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Executive",
      enabled: false,
      type: "radio",
      checked: true,
      click: () => {
        logger.info("Switched to Work persona");
        broadcastPersonaChange("work");
      },
    },
    {
      label: "Balanced",
      enabled: false,
      type: "radio",
      click: () => {
        logger.info("Switched to Pure persona");
        broadcastPersonaChange("pure");
      },
    },
    {
      label: "Twitter",
      enabled: false,
      type: "radio",
      click: () => {
        logger.info("Switched to Sexy persona");
        broadcastPersonaChange("sexy");
      },
    },
    { type: "separator" },
    { label: "Feature Request", role: "help" },
  ]);

  tray.setToolTip("Vibing");
  tray.setContextMenu(contextMenu);

  // --- Dock Menu (macOS) ---
  if (process.platform === "darwin") {
    const dockMenu = Menu.buildFromTemplate([
      {
        label: "Persona",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Work",
        type: "radio",
        checked: true,
        click: () => {
          logger.info("Switched to Work persona");
          broadcastPersonaChange("work");
        },
      },
      {
        label: "Pure",
        type: "radio",
        click: () => {
          logger.info("Switched to Pure persona");
          broadcastPersonaChange("pure");
        },
      },
      {
        label: "Sexy",
        type: "radio",
        click: () => {
          logger.info("Switched to Sexy persona");
          broadcastPersonaChange("sexy");
        },
      },
    ]);
    app.dock?.setMenu(dockMenu);
  }

  // Register the global img:// protocol for PDF handling
  registerImgProtocol();

  const initialized = initializeApp();
  if (!initialized) {
    app.quit();
    return;
  }

  // Register global shortcuts - using a dedicated shortcut instead of double-press
  const ccShortcutRegistered = globalShortcut.register(
    "CommandOrControl+Shift+C",
    () => {
      handleCCShortcut();
    },
  );

  // Also register the old double-press CC shortcut as fallback
  const ccDoublePressRegistered = globalShortcut.register(
    "CommandOrControl+C",
    () => {
      // Check if this is a double-press (CC)
      const now = Date.now();
      if (now - lastCPressTime < 400) {
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
    logger.info("CC global shortcut (Ctrl+Shift+C) registered successfully");
  } else {
    logger.error("Failed to register CC global shortcut (Ctrl+Shift+C)");
  }

  if (ccDoublePressRegistered) {
    logger.info("CC double-press shortcut (CC) registered successfully");
  } else {
    logger.error("Failed to register CC double-press shortcut (CC)");
  }

  // Initialize essential services and create window immediately, then background services
  userAnalytics
    .monitorPerformance("app-initialization", async () => {
      // Phase 1: Essential services + window creation (fast)
      await initializeEssentialServices();
      await createInitialWindow();

      // Initialize user analytics
      await userAnalytics.initialize();

      // Track memory usage after window creation
      userAnalytics.trackMemoryUsage("post-window-creation");

      // Phase 2: Background services (non-blocking)
      initializeBackgroundServices(); // Don't await - runs in background

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
            // UpdateService is now initialized globally and handles updates automatically
            // No need to manually check for updates here as it's handled by the service
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
      logger.error("App initialization failed:", error);
      userAnalytics.trackMemoryUsage("initialization-failed");
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
  // Track session end
  userAnalytics.trackSessionEnd();

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

  // Clean up window broadcast utilities
  WindowBroadcast.cleanup();

  // Clean up debounce manager
  DebounceManager.cleanup();

  // Clean up user profile store
  try {
    const userProfileStore = useUserProfileStore.getState();
    userProfileStore.cleanup();
  } catch (error) {
    logger.error("Error cleaning up user profile store:", error);
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
  // Set up context menu for any new web contents if they're in a BrowserWindow
  const window = BrowserWindow.fromWebContents(contents);
  if (window && contents.getType() === 'window') {
    // Set up context menu handler for OAuth popup windows
    contents.on('context-menu', (_event, params) => {
      // For editable content, let the system handle it
      if (params.isEditable) {
        return;
      }
      // For non-editable content in OAuth popups, we'll let the default system menu appear
      // since we don't have access to the full context menu infrastructure here
    });
  }

  contents.setWindowOpenHandler(({ url, disposition }) => {
    // Parse the URL to check if it's an OAuth callback
    try {
      const parsedUrl = new URL(url);

      // Check if this is an OAuth callback URL
      // Common OAuth callback patterns:
      // - Contains 'callback' in the path
      // - Contains 'oauth' in the path
      // - Contains 'code=' or 'token=' in query params
      // - Is from a known OAuth provider domain
      const isOAuthCallback =
        parsedUrl.pathname.includes("callback") ||
        parsedUrl.pathname.includes("oauth") ||
        parsedUrl.searchParams.has("code") ||
        parsedUrl.searchParams.has("token") ||
        parsedUrl.searchParams.has("access_token") ||
        parsedUrl.searchParams.has("state");

      // List of known OAuth provider domains that should be allowed
      const allowedOAuthDomains = [
        "accounts.google.com",
        "login.microsoftonline.com",
        "github.com",
        "api.github.com",
        "oauth.github.com",
        "login.live.com",
        "login.windows.net",
        "facebook.com",
        "www.facebook.com",
        "twitter.com",
        "api.twitter.com",
        "linkedin.com",
        "www.linkedin.com",
        "api.linkedin.com",
        "discord.com",
        "discord.gg",
        "slack.com",
        "api.slack.com",
        "dropbox.com",
        "www.dropbox.com",
        "api.dropbox.com",
        "reddit.com",
        "www.reddit.com",
        "oauth.reddit.com",
        "twitch.tv",
        "api.twitch.tv",
        "id.twitch.tv",
        "spotify.com",
        "accounts.spotify.com",
        "api.spotify.com",
        "amazon.com",
        "www.amazon.com",
        "api.amazon.com",
        "apple.com",
        "appleid.apple.com",
        "developer.apple.com",
        "paypal.com",
        "www.paypal.com",
        "api.paypal.com",
        "stripe.com",
        "connect.stripe.com",
        "dashboard.stripe.com",
        "zoom.us",
        "api.zoom.us",
        "salesforce.com",
        "login.salesforce.com",
        "test.salesforce.com",
        "box.com",
        "app.box.com",
        "account.box.com",
        "atlassian.com",
        "auth.atlassian.com",
        "id.atlassian.com",
        "gitlab.com",
        "bitbucket.org",
        "auth.bitbucket.org",
      ];

      const isFromOAuthProvider = allowedOAuthDomains.some(
        domain =>
          parsedUrl.hostname === domain ||
          parsedUrl.hostname.endsWith("." + domain),
      );

      // Allow OAuth callbacks or OAuth provider domains to open in the app
      if (isOAuthCallback || isFromOAuthProvider) {
        logger.info(`Allowing OAuth-related URL to open in app: ${url}`);
        
        // If it's trying to open in a new window (popup), configure it properly
        if (disposition === 'new-window' || disposition === 'foreground-tab' || disposition === 'background-tab') {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              webPreferences: {
                // Share the same session as the parent window to maintain user auth
                session: contents.session,
                contextIsolation: true,
                nodeIntegration: false,
                sandbox: true,
                webSecurity: true,
              },
              // Reasonable defaults for OAuth popups
              width: 800,
              height: 600,
              center: true,
              resizable: true,
              minimizable: true,
              maximizable: true,
              autoHideMenuBar: true,
            }
          };
        }
        
        return { action: "allow" };
      }

      // For all other URLs, open externally
      shell.openExternal(url);
      return { action: "deny" };
    } catch (error) {
      // If URL parsing fails, default to opening externally
      logger.error("Failed to parse URL for OAuth check:", error);
      shell.openExternal(url);
      return { action: "deny" };
    }
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
});

const iconName = path.join(resourcesPath, "tray.png");

//drag-n-drop
ipcMain.on("ondragstart", (event, filePath) => {
  event.sender.startDrag({
    file: path.join(__dirname, filePath),
    icon: iconName,
  });
});

//deeplink handling
app.on("open-url", async (_event, url) => {
  logger.info(`Deep link received: ${url}`);

  try {
    const urlObj = new URL(url);

    if (urlObj.protocol === "vibe:" && urlObj.hostname === "import-chrome") {
      logger.info("Handling vibe://import-chrome deep link");

      // Ensure browser is ready
      if (!browser) {
        logger.warn("Browser not ready for deep link handling");
        return;
      }

      // Get or create main window
      let mainWindow = browser.getMainWindow();
      if (!mainWindow) {
        await createInitialWindow();
        mainWindow = browser.getMainWindow();
      }

      if (mainWindow) {
        // Focus the main window
        mainWindow.focus();

        // Open settings dialog
        logger.info("Opening settings dialog for password import");
        const dialogManager = browser.getDialogManager();
        if (dialogManager) {
          await dialogManager.showSettingsDialog();

          // Send message to settings dialog to trigger Chrome import
          setTimeout(() => {
            mainWindow.webContents.send("trigger-chrome-import");
          }, 1000); // Wait for dialog to be ready

          logger.info("Chrome password import triggered via deep link");
        } else {
          logger.error("Dialog manager not available");
        }
      } else {
        logger.error("Main window not available for deep link handling");
      }
    } else {
      // Handle other deep links or show generic message
      dialog.showErrorBox("Deep Link", `You arrived from: ${url}`);
    }
  } catch (error) {
    logger.error("Error handling deep link:", error);
    dialog.showErrorBox("Deep Link Error", `Failed to handle: ${url}`);
  }
});
