import { BrowserWindow, nativeTheme, app } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";
import fs from "fs";
import path from "path";

const logger = createLogger("OnboardingWindow");

/**
 * Checks if this is the first time the app has been run
 * Uses a simple flag file in the user data directory
 */
export function isFirstRun(): boolean {
  try {
    const userDataPath = app.getPath("userData");
    logger.debug("User data path:", userDataPath);
    const firstRunFlagPath = path.join(
      userDataPath,
      ".vibe-first-run-complete",
    );

    // Check if the flag file exists
    const hasRunBefore = fs.existsSync(firstRunFlagPath);

    if (!hasRunBefore) {
      // Create the flag file to mark that the app has been run
      try {
        // Ensure the user data directory exists
        if (!fs.existsSync(userDataPath)) {
          fs.mkdirSync(userDataPath, { recursive: true });
        }

        // Create the flag file with timestamp
        fs.writeFileSync(
          firstRunFlagPath,
          JSON.stringify({
            firstRunDate: new Date().toISOString(),
            version: app.getVersion(),
            platform: process.platform,
          }),
          "utf8",
        );

        logger.info("First run detected - created flag file");
        return true;
      } catch (error) {
        logger.error("Failed to create first run flag file:", error);
        // If we can't create the flag file, assume it's not first run to avoid repeated onboarding
        return false;
      }
    }

    logger.debug("App has been run before - flag file exists");
    return false;
  } catch (error) {
    logger.error("Error checking first run status:", error);
    // If we can't determine, assume it's not first run to be safe
    return false;
  }
}

/**
 * Opens the onboarding window for first-time users
 * This function should be called from the main process after the browser is ready
 */
export async function openOnboardingForFirstRun(browser: any): Promise<void> {
  if (!browser) {
    logger.error("Cannot open onboarding: browser instance not available");
    return;
  }

  try {
    // Get the main application window
    const mainWindow = browser.getMainWindow();
    if (!mainWindow) {
      logger.error("Cannot open onboarding: main window not found");
      return;
    }

    // Get the ApplicationWindow instance
    const applicationWindow =
      browser.getApplicationWindowFromBrowserWindow(mainWindow);
    if (!applicationWindow) {
      logger.error("Cannot open onboarding: ApplicationWindow not found");
      return;
    }

    // Open the onboarding window
    applicationWindow.openOnboardingWindow();
    logger.info("Onboarding window opened for first-time user");

    // Track first run onboarding
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents
          .executeJavaScript(
            `
            if (window.umami && typeof window.umami.track === 'function') {
              window.umami.track('first-run-onboarding', {
                version: '${app.getVersion()}',
                platform: '${process.platform}',
                timestamp: ${Date.now()}
              });
            }
          `,
          )
          .catch(err => {
            logger.error("Failed to track first run onboarding", {
              error: err.message,
            });
          });
      }
    }, 1000);
  } catch (error) {
    logger.error("Failed to open onboarding window:", error);
  }
}

/**
 * OnboardingWindow - Popup window for user onboarding
 * Child window of ApplicationWindow
 */
export class OnboardingWindow extends EventEmitter {
  public readonly id: number;
  public readonly window: BrowserWindow;
  private parentWindow: BrowserWindow;

  constructor(parentWindow: BrowserWindow) {
    super();

    this.parentWindow = parentWindow;

    // Create popup window as child of parent
    this.window = new BrowserWindow(this.getWindowOptions());
    this.id = this.window.id;

    this.setupEvents();
    this.loadRenderer().catch(error => {
      logger.error("Failed to load onboarding renderer:", error);
    });
  }

  private getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      // Remove parent and modal to make window independent but keep modal behavior
      modal: true, // Keep modal for onboarding as it's a guided experience
      width: 800,
      height: 600,
      minWidth: 600,
      minHeight: 400,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: process.platform === "darwin" ? "hidden" : undefined,
      titleBarOverlay: {
        height: 30,
        symbolColor: nativeTheme.shouldUseDarkColors ? "white" : "black",
        color: "rgba(0,0,0,0)",
      },
      backgroundColor: process.platform === "darwin" ? "#00000000" : "#000000",
      frame: false,
      transparent: true,
      resizable: true,
      movable: true, // Explicitly enable dragging
      minimizable: false, // Onboarding shouldn't be minimizable
      maximizable: false, // Keep onboarding at fixed size
      closable: true, // Allow closing
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
        additionalArguments: ["--window-type=onboarding"],
      },
    };
  }

  private setupEvents(): void {
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
      // Center the onboarding window on screen
      this.window.center();

      // Emit window opened event
      this.emit("opened", this.id);
    });

    this.window.on("closed", () => {
      // Emit window closed event before destroying
      this.emit("closed", this.id);
      this.destroy();
    });

    // Handle escape key to close
    this.window.webContents.on("before-input-event", (event, input) => {
      if (input.key === "Escape") {
        event.preventDefault(); // Prevent the event from bubbling up
        this.close();
      }
    });

    // Handle parent window events
    this.parentWindow.on("closed", () => {
      // Close onboarding window when parent is closed
      this.close();
    });
  }

  private async loadRenderer(): Promise<void> {
    logger.debug("Loading onboarding renderer...");

    if (is.dev) {
      // In development, load from Vite dev server with onboarding route
      const devUrl =
        process.env["ELECTRON_RENDERER_URL"] || "http://localhost:5173";
      const onboardingUrl = `${devUrl}#/onboarding`;

      try {
        await this.window.loadURL(onboardingUrl);
        logger.debug("Successfully loaded onboarding dev URL");
      } catch (error) {
        logger.error("Failed to load onboarding dev URL:", error);
        // Fallback to file loading
        const htmlPath = join(__dirname, "../renderer/index.html");
        await this.window.loadFile(htmlPath, { hash: "onboarding" });
      }
    } else {
      const htmlPath = join(__dirname, "../renderer/index.html");
      await this.window.loadFile(htmlPath, { hash: "onboarding" });
    }
  }

  public close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    this.emit("destroy");
    this.removeAllListeners();

    if (!this.window.isDestroyed()) {
      this.window.removeAllListeners();
      this.window.close();
    }
  }

  public show(): void {
    if (!this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
    }
  }

  public hide(): void {
    if (!this.window.isDestroyed()) {
      this.window.hide();
    }
  }
}
