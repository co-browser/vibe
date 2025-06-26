import { BrowserWindow, app, ipcMain } from "electron";
import { EventEmitter } from "events";
import { join } from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";
import fs from "fs";
import path from "path";

const logger = createLogger("OnboardingWindow");

// Define interface for browser data
interface DetectedBrowser {
  name: string;
  path: string;
  default?: boolean;
}

/**
 * Onboarding completion data
 */
interface OnboardingData {
  profileName: string;
  email?: string;
  importPasswords: boolean;
  importHistory: boolean;
  selectedBrowser?: string;
  selectedChromeProfile?: string;
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
}

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
export async function openOnboardingForFirstRun(
  browser: any,
  detectedBrowsers?: DetectedBrowser[],
): Promise<void> {
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

    // Open the onboarding window with detected browsers
    applicationWindow.openOnboardingWindow(detectedBrowsers);
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
  private detectedBrowsers: DetectedBrowser[];

  constructor(
    parentWindow: BrowserWindow,
    detectedBrowsers: DetectedBrowser[] = [],
  ) {
    super();

    this.parentWindow = parentWindow;
    this.detectedBrowsers = detectedBrowsers;

    // Create popup window as child of parent
    this.window = new BrowserWindow(this.getWindowOptions());
    this.id = this.window.id;

    this.setupEvents();
    this.setupIpcHandlers();
    this.loadRenderer().catch(error => {
      logger.error("Failed to load onboarding renderer:", error);
    });
  }

  private getWindowOptions(): Electron.BrowserWindowConstructorOptions {
    return {
      modal: true,
      width: 900,
      height: 700,
      minWidth: 800,
      minHeight: 600,
      show: false,
      autoHideMenuBar: true,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 20, y: 20 },
      backgroundColor: "#00000000",
      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      closable: true,
      hasShadow: true,
      visualEffectState: "active",
      vibrancy: "under-window",
      roundedCorners: true,
      webPreferences: {
        preload: join(__dirname, "../preload/index.js"),
        sandbox: false,
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        backgroundThrottling: false,
        additionalArguments: [
          "--window-type=onboarding",
          `--detected-browsers=${JSON.stringify(this.detectedBrowsers)}`,
        ],
      },
    };
  }

  private setupEvents(): void {
    this.window.once("ready-to-show", () => {
      this.window.show();
      this.window.focus();
      // Center the onboarding window on screen
      this.window.center();

      // Send detected browsers to renderer after window is ready
      this.window.webContents.send("detected-browsers", this.detectedBrowsers);

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

  private setupIpcHandlers(): void {
    // Note: The main onboarding:complete handler is in src/main/ipc/app/onboarding.ts

    // Handle getting detected browsers
    ipcMain.handle("onboarding:get-browsers", async () => {
      return this.detectedBrowsers;
    });

    // Handle browser data preview
    ipcMain.handle(
      "onboarding:preview-browser-data",
      async (_event, _browserName: string) => {
        try {
          // Mock preview data - in real implementation would scan browser
          const preview = {
            passwords: Math.floor(Math.random() * 50) + 10,
            history: Math.floor(Math.random() * 1000) + 100,
            bookmarks: Math.floor(Math.random() * 100) + 20,
          };
          return { success: true, preview };
        } catch (error) {
          logger.error("Failed to preview browser data:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
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

  /* private async importBrowserData(
    profileId: string,
    browserName: string,
    data: { passwords: boolean; history: boolean },
  ): Promise<void> {
    try {
      logger.info(
        `Importing data from ${browserName} for profile ${profileId}`,
      );

      // This would implement actual browser data import
      // For now, we'll create some mock data
      const mockData = {
        passwords: data.passwords,
        history: data.history,
      };

      if (mockData.passwords) {
        await this.importBrowserPasswords(profileId, browserName);
      }

      if (mockData.history) {
        await this.importBrowserHistory(profileId, browserName);
      }

      logger.info(
        `Successfully imported ${mockData.passwords ? "passwords" : ""} and ${mockData.history ? "history" : ""}`,
      );
    } catch (error) {
      logger.error(`Failed to import data from ${browserName}:`, error);
      throw error;
    }
  }

  private async importBrowserPasswords(
    profileId: string,
    browserName: string,
  ): Promise<void> {
    try {
      logger.info(
        `Importing passwords from ${browserName} for profile ${profileId}`,
      );

      // This would implement actual browser password import
      // For now, we'll create some mock data
      const mockPasswords = [
        {
          url: "https://example.com",
          username: "user@example.com",
          password: "encrypted_password_data",
          title: "Example Site",
          source: browserName.toLowerCase() as any,
        },
      ];

      await this.profileService.importPasswords(profileId, mockPasswords);
      logger.info(`Successfully imported ${mockPasswords.length} passwords`);
    } catch (error) {
      logger.error(`Failed to import passwords from ${browserName}:`, error);
      throw error;
    }
  }

  private async importBrowserHistory(
    profileId: string,
    browserName: string,
  ): Promise<void> {
    try {
      logger.info(
        `Importing history from ${browserName} for profile ${profileId}`,
      );

      // This would implement actual browser history import
      // For now, we'll create some mock data
      const mockHistoryEntries = [
        {
          url: "https://example.com",
          title: "Example Site",
          visitCount: 5,
          lastVisit: new Date(),
          favicon: "https://example.com/favicon.ico",
        },
      ];

      for (const entry of mockHistoryEntries) {
        await this.profileService.addHistoryEntry(profileId, entry);
      }

      logger.info(
        `Successfully imported ${mockHistoryEntries.length} history entries`,
      );
    } catch (error) {
      logger.error(`Failed to import history from ${browserName}:`, error);
      throw error;
    }
  }

  private async previewBrowserData(browserName: string): Promise<{
    passwords: number;
    history: number;
    bookmarks: number;
  }> {
    try {
      logger.info(`Previewing data from ${browserName}`);

      // Mock data preview - in a real implementation, this would actually scan the browser
      const mockPreview = {
        passwords: Math.floor(Math.random() * 50) + 10,
        history: Math.floor(Math.random() * 1000) + 100,
        bookmarks: Math.floor(Math.random() * 100) + 20,
      };

      logger.info(`Preview for ${browserName}:`, mockPreview);
      return mockPreview;
    } catch (error) {
      logger.error(`Failed to preview data from ${browserName}:`, error);
      throw error;
    }
  }
  */

  public close(): void {
    if (!this.window.isDestroyed()) {
      this.window.close();
    }
  }

  public destroy(): void {
    if (this.window.isDestroyed()) return;

    // Clean up IPC handlers
    // Note: onboarding:complete is handled in onboarding.ts
    ipcMain.removeHandler("onboarding:get-browsers");
    ipcMain.removeHandler("onboarding:preview-browser-data");

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

  public getDetectedBrowsers(): DetectedBrowser[] {
    return this.detectedBrowsers;
  }
}

// Export the interface for use in other files
export type { DetectedBrowser, OnboardingData };
