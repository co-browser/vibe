import { BrowserWindow, nativeTheme, shell, ipcMain } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { WINDOW_CONFIG } from "@vibe/shared-types";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { download, CancelError } = require("electron-dl");

import { TabManager } from "./tab-manager";
import { ViewManager } from "./view-manager";
import { DialogManager } from "./dialog-manager";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ApplicationWindow");
import type { CDPManager } from "../services/cdp-service";

// Bluetooth handlers now moved to instance variables for proper cleanup

/**
 * ApplicationWindow - Simple window wrapper that contains per-window managers
 */
export class ApplicationWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  public readonly tabManager: TabManager;
  public readonly viewManager: ViewManager;
  public readonly dialogManager: DialogManager;
  private bluetoothPinCallback?: (response: any) => void;
  private selectBluetoothCallback?: (deviceId: string) => void;

  constructor(
    browser: any,
    options?: Electron.BrowserWindowConstructorOptions,
    cdpManager?: CDPManager,
  ) {
    super();

    // Create window with options
    this.window = new BrowserWindow(options || this.getDefaultOptions());

    this.window.webContents.on(
      "select-bluetooth-device",
      (_event, deviceList, callback) => {
        _event.preventDefault();
        logger.warn("Bluetooth select!");

        this.selectBluetoothCallback = callback;
        const result = deviceList.find(device => {
          return device.deviceName === "vibe";
        });
        if (result) {
          callback(result.deviceId);
        } else {
          logger.warn("Bluetooth device not found");
        }
      },
    );

    // Use instance-specific handlers that can be properly cleaned up
    const cancelBluetoothHandler = (_event: any) => {
      if (this.selectBluetoothCallback) {
        this.selectBluetoothCallback("");
      }
    };

    const bluetoothPairingHandler = (_event: any, response: any) => {
      if (this.bluetoothPinCallback) {
        this.bluetoothPinCallback(response);
      }
    };

    ipcMain.on("cancel-bluetooth-request", cancelBluetoothHandler);
    ipcMain.on("bluetooth-pairing-response", bluetoothPairingHandler);

    // Store handlers for cleanup
    this.window.once("closed", () => {
      ipcMain.removeListener(
        "cancel-bluetooth-request",
        cancelBluetoothHandler,
      );
      ipcMain.removeListener(
        "bluetooth-pairing-response",
        bluetoothPairingHandler,
      );
    });

    // Set up Bluetooth handler for this window's session
    const bluetoothHandler = (
      details: any,
      callback: (response: any) => void,
    ) => {
      this.bluetoothPinCallback = callback;
      // Send a message to the renderer to prompt the user to confirm the pairing.
      this.window.webContents.send("bluetooth-pairing-request", details);
    };

    // Apply to this window's session
    this.window.webContents.session.setBluetoothPairingHandler(
      bluetoothHandler,
    );

    this.id = this.window.id;

    // Create window-specific managers (ViewManager first, then TabManager)
    this.viewManager = new ViewManager(browser, this.window);
    this.tabManager = new TabManager(browser, this.viewManager, cdpManager);
    this.dialogManager = new DialogManager(this.window);

    // Set up tab event forwarding for this window
    this.setupTabEventForwarding();

    // Set up dialog event forwarding for this window
    this.setupDialogEventForwarding();

    // Simple lifecycle management
    this.setupEvents();
    this.loadRenderer().catch(error => {
      logger.error("🔧 ApplicationWindow: Failed to load renderer:", error);
    });
  }

  private getDefaultOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      minWidth: 800,
      minHeight: 400,
      width: 1280,
      height: 720,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      titleBarOverlay: {
        height: 30,
        symbolColor: nativeTheme.shouldUseDarkColors ? "white" : "black",
        color: "transparent",
      },
      ...(process.platform === "darwin" && {
        trafficLightPosition: WINDOW_CONFIG.TRAFFIC_LIGHT_POSITION,
      }),
      backgroundColor: process.platform === "darwin" ? "transparent" : "black",
      frame: false,
      transparent: true,
      resizable: true,
      visualEffectState: "active",
      backgroundMaterial: "none",
      roundedCorners: true,
      vibrancy: process.platform === "darwin" ? "fullscreen-ui" : undefined,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    };
  }

  private setupEvents(): void {
    this.window.once("ready-to-show", async () => {
      // Initialize overlay before showing window
      await this.viewManager.initializeOverlay();

      this.window.show();
      this.window.focus();
    });

    this.window.on("closed", () => {
      this.destroy();
    });

    this.window.on("resize", () => {
      this.viewManager.updateBounds();
    });

    this.window.webContents.setWindowOpenHandler(details => {
      // This handler is redundant since we already handle it in main/index.ts
      // But we'll keep it for consistency with the same OAuth logic
      try {
        const parsedUrl = new URL(details.url);

        // Check if this is an OAuth callback URL
        const isOAuthCallback =
          parsedUrl.pathname.includes("callback") ||
          parsedUrl.pathname.includes("oauth") ||
          parsedUrl.searchParams.has("code") ||
          parsedUrl.searchParams.has("token") ||
          parsedUrl.searchParams.has("access_token") ||
          parsedUrl.searchParams.has("state");

        // List of known OAuth provider domains
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
          return { action: "allow" };
        }

        // For all other URLs, open externally
        shell.openExternal(details.url);
        return { action: "deny" };
      } catch {
        // If URL parsing fails, default to opening externally
        shell.openExternal(details.url);
        return { action: "deny" };
      }
    });
  }

  private setupTabEventForwarding(): void {
    // Forward tab events from this window's TabManager to this window's renderer
    this.tabManager.on("tab-created", tabKey => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-created", tabKey);
      }
    });

    this.tabManager.on("tab-updated", tabState => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("update-tab-state", tabState);
      }
    });

    this.tabManager.on("tab-switched", switchData => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-switched", switchData);
      }
    });

    this.tabManager.on("tab-closed", tabKey => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("tab-closed", tabKey);
      }
    });

    this.tabManager.on("tabs-reordered", tabs => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("browser-tabs-reordered", tabs);
      }
    });
  }

  private setupDialogEventForwarding(): void {
    this.dialogManager.on("dialog-closed", (dialogType: string) => {
      if (!this.window.isDestroyed()) {
        this.window.webContents.send("dialog-closed", dialogType);
      }
    });
  }

  private async loadRenderer(): Promise<void> {
    logger.debug("🔧 ApplicationWindow: Loading renderer...");
    logger.debug("🔧 ApplicationWindow: is.dev =", is.dev);
    logger.debug(
      "🔧 ApplicationWindow: ELECTRON_RENDERER_URL =",
      process.env["ELECTRON_RENDERER_URL"],
    );

    if (is.dev) {
      // In development, try to load from the Vite dev server
      const devUrl =
        process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
      logger.debug("🔧 ApplicationWindow: Loading dev URL:", devUrl);

      // Wait a bit for the dev server to be ready
      let attempts = 0;
      const maxAttempts = 10;

      while (attempts < maxAttempts) {
        try {
          logger.debug(
            `🔧 ApplicationWindow: Attempt ${attempts + 1}/${maxAttempts} to load ${devUrl}`,
          );
          await this.window.loadURL(devUrl);
          logger.debug("🔧 ApplicationWindow: Successfully loaded dev URL");
          break;
        } catch (error) {
          attempts++;
          logger.debug(
            `🔧 ApplicationWindow: Failed to load (attempt ${attempts}):`,
            error,
          );

          if (attempts < maxAttempts) {
            logger.debug(
              "🔧 ApplicationWindow: Waiting 1 second before retry...",
            );
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            logger.error(
              "🔧 ApplicationWindow: Failed to load dev server after all attempts",
            );
            // Fallback to file loading
            const htmlPath = join(__dirname, "../renderer/index.html");
            logger.debug(
              "🔧 ApplicationWindow: Falling back to HTML file:",
              htmlPath,
            );
            this.window.loadFile(htmlPath);
          }
        }
      }
    } else {
      const htmlPath = join(__dirname, "../renderer/index.html");
      logger.debug("🔧 ApplicationWindow: Loading HTML file:", htmlPath);
      this.window.loadFile(htmlPath);
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    try {
      // Clean up TabManager (includes EventEmitter cleanup and intervals)
      this.tabManager.destroy();
    } catch (error) {
      logger.warn("Error destroying TabManager:", error);
    }

    try {
      // Clean up ViewManager
      this.viewManager.destroy();
    } catch (error) {
      logger.warn("Error destroying ViewManager:", error);
    }

    try {
      // Clean up DialogManager
      this.dialogManager.destroy();
    } catch (error) {
      logger.warn("Error destroying DialogManager:", error);
    }

    this.emit("destroy");
    this.removeAllListeners();

    if (!this.window.isDestroyed()) {
      this.window.removeAllListeners();
      this.window.close();
    }
  }
}

ipcMain.on("download-button", async (_event, { url }) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    try {
      console.log(await download(win, url));
    } catch (error) {
      if (error instanceof CancelError) {
        console.info("item.cancel() was called");
      } else {
        console.error(error);
      }
    }
  }
});
