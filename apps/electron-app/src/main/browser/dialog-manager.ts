/**
 * Dialog Manager for native Electron dialogs
 * Manages downloads and settings dialogs as child windows
 * PRUNED VERSION: Chrome extraction moved to ChromeDataExtractionService
 */

import { BaseWindow, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { EventEmitter } from "events";
import path from "path";
import { createLogger } from "@vibe/shared-types";
import { chromeDataExtraction } from "@/services/chrome-data-extraction";
import { DEFAULT_USER_AGENT } from "../constants/user-agent";

const logger = createLogger("dialog-manager");

interface DialogOptions {
  width: number;
  height: number;
  title: string;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
}

export class DialogManager extends EventEmitter {
  private static instances: Map<number, DialogManager> = new Map();
  private static ipcHandlersRegistered = false;

  private parentWindow: BrowserWindow;
  private activeDialogs: Map<string, BaseWindow> = new Map();
  private pendingOperations: Map<string, Promise<any>> = new Map();
  private loadingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(parentWindow: BrowserWindow) {
    super();
    this.parentWindow = parentWindow;

    // Register this instance
    DialogManager.instances.set(parentWindow.id, this);

    // Register IPC handlers only once, globally
    if (!DialogManager.ipcHandlersRegistered) {
      DialogManager.registerGlobalHandlers();
      DialogManager.ipcHandlersRegistered = true;
      logger.info("DialogManager IPC handlers registered");
    }
  }

  // NOTE: File path validation removed - add back when needed for actual file operations

  private static getManagerForWindow(
    webContents: Electron.WebContents,
  ): DialogManager | undefined {
    const window = BrowserWindow.fromWebContents(webContents);
    if (!window) return undefined;

    // First, check if this window has a DialogManager
    let manager = DialogManager.instances.get(window.id);
    if (manager) return manager;

    // If not, check if this is a dialog window by looking for its parent
    const parent = window.getParentWindow();
    if (parent) {
      manager = DialogManager.instances.get(parent.id);
      if (manager) return manager;
    }

    // As a fallback, return the first available DialogManager (usually from main window)
    if (DialogManager.instances.size > 0) {
      return DialogManager.instances.values().next().value;
    }

    return undefined;
  }

  private static registerGlobalHandlers(): void {
    logger.info("Setting up DialogManager IPC handlers");

    // Dialog management handlers
    ipcMain.handle("dialog:show-downloads", async event => {
      const manager = DialogManager.getManagerForWindow(event.sender);
      if (!manager)
        return { success: false, error: "No dialog manager for window" };
      return manager.showDownloadsDialog();
    });

    ipcMain.handle("dialog:show-settings", async event => {
      const manager = DialogManager.getManagerForWindow(event.sender);
      if (!manager)
        return { success: false, error: "No dialog manager for window" };
      return manager.showSettingsDialog();
    });

    ipcMain.handle("dialog:close", async (event, dialogType: string) => {
      logger.info(`IPC handler: dialog:close called for ${dialogType}`);
      const manager = DialogManager.getManagerForWindow(event.sender);
      if (!manager)
        return { success: false, error: "No dialog manager for window" };
      return manager.closeDialog(dialogType);
    });

    ipcMain.handle("dialog:force-close", async (event, dialogType: string) => {
      logger.info(`IPC handler: dialog:force-close called for ${dialogType}`);
      const manager = DialogManager.getManagerForWindow(event.sender);
      if (!manager)
        return { success: false, error: "No dialog manager for window" };
      return manager.forceCloseDialog(dialogType);
    });

    // REFACTORED: Chrome data extraction handlers now use ChromeDataExtractionService
    ipcMain.handle("password:extract-chrome", async () => {
      return chromeDataExtraction.extractPasswords();
    });

    ipcMain.handle(
      "passwords:import-chrome",
      async (event, windowId?: number) => {
        try {
          logger.info("passwords:import-chrome IPC handler called");

          // Get the window for progress bar
          let targetWindow: BrowserWindow | null = null;
          if (windowId) {
            targetWindow = BrowserWindow.fromId(windowId);
          }

          // Find main window if not provided
          if (!targetWindow) {
            const allWindows = BrowserWindow.getAllWindows();
            for (const win of allWindows) {
              if (!win.getParentWindow()) {
                targetWindow = win;
                break;
              }
            }
          }

          // Set initial progress
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.setProgressBar(0.1);
          }

          const result = await chromeDataExtraction.extractPasswords(
            undefined,
            progress => {
              if (targetWindow && !targetWindow.isDestroyed()) {
                targetWindow.setProgressBar(progress / 100);
              }

              // Send progress to renderer
              if (!event.sender.isDestroyed()) {
                event.sender.send("chrome-import-progress", {
                  progress,
                  message: "Extracting Chrome passwords...",
                });
              }
            },
          );

          logger.info("Chrome extraction result:", result);

          if (!result.success) {
            logger.warn("Chrome extraction failed:", result.error);
            return result;
          }

          const { useUserProfileStore } = await import(
            "@/store/user-profile-store"
          );
          const userProfileStore = useUserProfileStore.getState();
          const activeProfile = userProfileStore.getActiveProfile();

          if (!activeProfile) {
            logger.warn("No active profile found");
            return { success: false, error: "No active profile" };
          }

          if (result.data && result.data.length > 0) {
            logger.info(
              `Storing ${result.data.length} passwords for profile ${activeProfile.id}`,
            );
            await userProfileStore.storeImportedPasswords(
              activeProfile.id,
              "chrome",
              result.data,
            );
          }

          logger.info(
            `Chrome import completed successfully with ${result.data?.length || 0} passwords`,
          );

          // Clear progress bar
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.setProgressBar(-1);
          }

          return { success: true, count: result.data?.length || 0 };
        } catch (error) {
          logger.error("Failed to import Chrome passwords:", error);

          // Clear progress bar on error
          if (windowId) {
            const targetWindow = BrowserWindow.fromId(windowId);
            if (targetWindow && !targetWindow.isDestroyed()) {
              targetWindow.setProgressBar(-1);
            }
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );

    ipcMain.handle("passwords:import-safari", async () => {
      // Safari import not implemented for security reasons
      return {
        success: false,
        error: "Safari import not supported for security reasons",
      };
    });

    ipcMain.handle(
      "passwords:import-csv",
      async (_event, { filename, content }) => {
        try {
          const { useUserProfileStore } = await import(
            "@/store/user-profile-store"
          );
          const userProfileStore = useUserProfileStore.getState();
          const activeProfile = userProfileStore.getActiveProfile();

          if (!activeProfile) {
            return { success: false, error: "No active profile" };
          }

          // Parse CSV content (basic implementation)
          const lines = content.split("\n").filter(line => line.trim());
          const headers = lines[0].split(",").map(h => h.trim().toLowerCase());

          const urlIndex = headers.findIndex(
            h => h.includes("url") || h.includes("site"),
          );
          const usernameIndex = headers.findIndex(
            h =>
              h.includes("username") ||
              h.includes("email") ||
              h.includes("user"),
          );
          const passwordIndex = headers.findIndex(
            h => h.includes("password") || h.includes("pass"),
          );

          if (urlIndex === -1 || usernameIndex === -1 || passwordIndex === -1) {
            return {
              success: false,
              error: "CSV must contain URL, Username, and Password columns",
            };
          }

          const passwords = lines
            .slice(1)
            .map((line, index) => {
              const columns = line
                .split(",")
                .map(c => c.trim().replace(/^"|"$/g, ""));
              return {
                id: `csv_${filename}_${index}`,
                url: columns[urlIndex] || "",
                username: columns[usernameIndex] || "",
                password: columns[passwordIndex] || "",
                source: "csv" as const,
                dateCreated: new Date(),
                lastModified: new Date(),
              };
            })
            .filter(p => p.url && p.username && p.password);

          if (passwords.length > 0) {
            await userProfileStore.storeImportedPasswords(
              activeProfile.id,
              `csv_${filename}`,
              passwords,
            );
          }

          return { success: true, count: passwords.length };
        } catch (error) {
          logger.error("Failed to import CSV passwords:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );

    // REFACTORED: Chrome comprehensive import handlers using ChromeDataExtractionService
    ipcMain.handle("chrome:import-comprehensive", async () => {
      try {
        logger.info("Starting comprehensive Chrome profile import");
        const result = await chromeDataExtraction.extractAllData();

        if (!result.success) {
          logger.warn("Chrome comprehensive extraction failed:", result.error);
          return result;
        }

        const { useUserProfileStore } = await import(
          "@/store/user-profile-store"
        );
        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          logger.warn("No active profile found");
          return { success: false, error: "No active profile" };
        }

        const data = result.data;
        let totalSaved = 0;

        // Save passwords if extracted
        if (data?.passwords && data.passwords.length > 0) {
          logger.info(
            `Storing ${data.passwords.length} passwords for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedPasswords(
            activeProfile.id,
            "chrome",
            data.passwords,
          );
          totalSaved += data.passwords.length;
        }

        // Save bookmarks if extracted
        if (data?.bookmarks && data.bookmarks.length > 0) {
          logger.info(
            `Storing ${data.bookmarks.length} bookmarks for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedBookmarks(
            activeProfile.id,
            "chrome",
            data.bookmarks,
          );
          totalSaved += data.bookmarks.length;
        }

        // Save history if extracted
        if (data?.history && data.history.length > 0) {
          logger.info(
            `Storing ${data.history.length} history entries for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedHistory(
            activeProfile.id,
            "chrome",
            data.history,
          );
          totalSaved += data.history.length;
        }

        logger.info(
          `Comprehensive Chrome import completed successfully with ${totalSaved} total items saved`,
        );
        return {
          success: true,
          data: {
            ...data,
            totalSaved,
          },
          passwordCount: data?.passwords?.length || 0,
          bookmarkCount: data?.bookmarks?.length || 0,
          historyCount: data?.history?.length || 0,
          autofillCount: data?.autofill?.length || 0,
          searchEngineCount: data?.searchEngines?.length || 0,
        };
      } catch (error) {
        logger.error("Comprehensive Chrome import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    // REFACTORED: Individual Chrome import handlers using ChromeDataExtractionService
    ipcMain.handle("chrome:import-bookmarks", async () => {
      try {
        logger.info("Starting Chrome bookmarks import with progress");
        return await chromeDataExtraction.extractBookmarks();
      } catch (error) {
        logger.error("Chrome bookmarks import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("chrome:import-history", async () => {
      try {
        logger.info("Starting Chrome history import with progress");
        return await chromeDataExtraction.extractHistory();
      } catch (error) {
        logger.error("Chrome history import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("chrome:import-autofill", async () => {
      try {
        logger.info("Starting Chrome autofill import with progress");
        // TODO: Implement in ChromeDataExtractionService
        return {
          success: false,
          error: "Autofill extraction not implemented yet",
        };
      } catch (error) {
        logger.error("Chrome autofill import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("chrome:import-search-engines", async () => {
      try {
        logger.info("Starting Chrome search engines import");
        // TODO: Implement in ChromeDataExtractionService
        return {
          success: false,
          error: "Search engines extraction not implemented yet",
        };
      } catch (error) {
        logger.error("Chrome search engines import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle(
      "chrome:import-all-profiles",
      async (event, windowId?: number) => {
        // Get the window to show progress on
        let targetWindow: BrowserWindow | null = null;

        try {
          logger.info("Starting Chrome all profiles import");

          if (windowId) {
            targetWindow = BrowserWindow.fromId(windowId);
          }

          // Get all windows
          const allWindows = BrowserWindow.getAllWindows();

          // Find the main window (not the settings dialog)
          if (!targetWindow && allWindows.length > 0) {
            // Find the largest window that is not a modal/child window
            for (const win of allWindows) {
              // Skip child windows (like the settings dialog)
              if (!win.getParentWindow()) {
                // This is a top-level window, likely the main window
                targetWindow = win;
                break;
              }
            }

            // Fallback to largest window if no parent-less window found
            if (!targetWindow) {
              targetWindow = allWindows.reduce((largest, current) => {
                const largestSize = largest.getBounds();
                const currentSize = current.getBounds();
                return currentSize.width * currentSize.height >
                  largestSize.width * largestSize.height
                  ? current
                  : largest;
              });
            }
          }

          logger.info(
            `Target window for progress: ${targetWindow?.id || "none"}, title: ${targetWindow?.getTitle() || "N/A"}`,
          );

          const profiles = await chromeDataExtraction.getChromeProfiles();
          if (!profiles || profiles.length === 0) {
            return { success: false, error: "No Chrome profiles found" };
          }

          logger.info(`Found ${profiles.length} Chrome profiles`);

          // Import data from all profiles
          const allData = {
            passwords: [] as any[],
            bookmarks: [] as any[],
            history: [] as any[],
            autofill: [] as any[],
            searchEngines: [] as any[],
          };

          let totalProgress = 0;
          const progressPerProfile = 100 / profiles.length;

          for (let i = 0; i < profiles.length; i++) {
            const profile = profiles[i];
            logger.info(
              `Processing profile ${i + 1}/${profiles.length}: ${profile.name}`,
            );

            // Send progress update
            if (targetWindow && !targetWindow.isDestroyed()) {
              const progressValue =
                (totalProgress + progressPerProfile * 0.1) / 100;
              logger.info(
                `Setting progress bar to ${progressValue} on main window ${targetWindow.id}`,
              );
              targetWindow.setProgressBar(progressValue);
            } else {
              logger.warn("No target window for progress bar");
            }

            // Always send progress to the Settings dialog
            if (!event.sender.isDestroyed()) {
              event.sender.send("chrome-import-progress", {
                progress: totalProgress + progressPerProfile * 0.1,
                message: `Processing profile: ${profile.name}`,
              });
            }

            const profileResult = await chromeDataExtraction.extractAllData(
              profile,
              progress => {
                if (targetWindow && !targetWindow.isDestroyed()) {
                  const overallProgress =
                    totalProgress + progress * progressPerProfile;
                  targetWindow.setProgressBar(overallProgress / 100);
                }

                // Always send progress to the Settings dialog
                if (!event.sender.isDestroyed()) {
                  const overallProgress =
                    totalProgress + progress * progressPerProfile;
                  event.sender.send("chrome-import-progress", {
                    progress: overallProgress,
                    message: `Extracting data from ${profile.name}...`,
                  });
                }
              },
            );

            if (profileResult.success && profileResult.data) {
              // Aggregate data from all profiles
              allData.passwords.push(...(profileResult.data.passwords || []));
              allData.bookmarks.push(...(profileResult.data.bookmarks || []));
              allData.history.push(...(profileResult.data.history || []));
              allData.autofill.push(...(profileResult.data.autofill || []));
              allData.searchEngines.push(
                ...(profileResult.data.searchEngines || []),
              );
            }

            totalProgress += progressPerProfile;
          }

          // Save all imported data
          const userProfileStore = await import(
            "@/store/user-profile-store"
          ).then(m => m.useUserProfileStore.getState());
          const activeProfile = userProfileStore.getActiveProfile();

          if (!activeProfile) {
            return { success: false, error: "No active user profile" };
          }

          let totalSaved = 0;

          // Save passwords
          if (allData.passwords.length > 0) {
            await userProfileStore.storeImportedPasswords(
              activeProfile.id,
              "chrome-all-profiles",
              allData.passwords,
            );
            totalSaved += allData.passwords.length;
          }

          // Save bookmarks
          if (allData.bookmarks.length > 0) {
            await userProfileStore.storeImportedBookmarks(
              activeProfile.id,
              "chrome-all-profiles",
              allData.bookmarks,
            );
            totalSaved += allData.bookmarks.length;
          }

          logger.info(
            `All Chrome profiles import completed successfully with ${totalSaved} total items saved`,
          );

          // Clear progress bar
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.setProgressBar(-1); // -1 removes the progress bar
            logger.info("Progress bar cleared on main window");
          }

          return {
            success: true,
            data: allData,
            passwordCount: allData.passwords.length,
            bookmarkCount: allData.bookmarks.length,
            historyCount: allData.history.length,
            autofillCount: allData.autofill.length,
            searchEngineCount: allData.searchEngines.length,
            totalSaved,
          };
        } catch (error) {
          logger.error("Chrome all profiles import failed:", error);

          // Clear progress bar on error
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.setProgressBar(-1);
            logger.info("Progress bar cleared due to error");
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    );
  }

  private async loadContentWithTimeout(
    webContents: Electron.WebContents,
    url: string,
    dialogType: string,
    timeout: number = 10000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (webContents.isDestroyed()) {
        reject(new Error("WebContents destroyed before loading"));
        return;
      }

      const timeoutId = setTimeout(() => {
        this.loadingTimeouts.delete(dialogType);
        reject(new Error(`Loading timeout after ${timeout}ms`));
      }, timeout);

      this.loadingTimeouts.set(dialogType, timeoutId);

      webContents
        .loadURL(url)
        .then(() => {
          clearTimeout(timeoutId);
          this.loadingTimeouts.delete(dialogType);
          resolve();
        })
        .catch(error => {
          clearTimeout(timeoutId);
          this.loadingTimeouts.delete(dialogType);
          reject(error);
        });
    });
  }

  private validateDialogState(dialog: BaseWindow, dialogType: string): boolean {
    if (!dialog || dialog.isDestroyed()) {
      logger.warn(`Dialog ${dialogType} is destroyed or invalid`);
      this.activeDialogs.delete(dialogType);
      return false;
    }
    return true;
  }

  private createDialog(type: string, options: DialogOptions): BaseWindow {
    const dialog = new BaseWindow({
      width: options.width,
      height: options.height,
      resizable: options.resizable ?? false,
      minimizable: options.minimizable ?? false,
      maximizable: options.maximizable ?? false,
      movable: true,
      show: false,
      modal: false, // Enable moving by making it non-modal
      parent: this.parentWindow,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
    });

    // Create WebContentsView for the dialog content
    const preloadPath = path.join(__dirname, "../preload/index.js");
    logger.debug(`Creating dialog with preload path: ${preloadPath}`);

    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        preload: preloadPath,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });

    // Set browser user agent
    view.webContents.setUserAgent(DEFAULT_USER_AGENT);

    // Set view bounds to fill the dialog
    const updateViewBounds = () => {
      const [width, height] = dialog.getContentSize();
      view.setBounds({
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
    };

    // Set initial bounds
    updateViewBounds();
    dialog.setContentView(view);

    // Update bounds when window is resized
    dialog.on("resize", () => {
      updateViewBounds();
    });

    // Position dialog as a side panel from the right edge
    const parentBounds = this.parentWindow.getBounds();
    const x = parentBounds.x + parentBounds.width - options.width - 20; // 20px margin from right edge
    const y = parentBounds.y + 40; // Top margin
    dialog.setPosition(x, y);

    // Handle dialog lifecycle
    dialog.on("closed", () => {
      this.activeDialogs.delete(type);
      this.emit("dialog-closed", type);
    });

    // Handle escape key after content is loaded
    view.webContents.once("did-finish-load", () => {
      logger.debug(`Dialog ${type} finished loading`);

      view.webContents.on("before-input-event", (_event, input) => {
        if (input.key === "Escape" && input.type === "keyDown") {
          logger.info(`Escape key pressed, closing dialog: ${type}`);
          this.closeDialog(type);
        }
      });
    });

    // Store view reference for content loading
    (dialog as any).contentView = view;

    return dialog;
  }

  public async showDownloadsDialog(): Promise<void> {
    // Check for existing dialog first
    if (this.activeDialogs.has("downloads")) {
      const existingDialog = this.activeDialogs.get("downloads");
      if (
        existingDialog &&
        this.validateDialogState(existingDialog, "downloads")
      ) {
        existingDialog.focus();
        return;
      }
    }

    // Prevent race conditions by checking for pending operations
    if (this.pendingOperations.has("downloads")) {
      logger.debug("Downloads dialog already being created, waiting...");
      return this.pendingOperations.get("downloads");
    }

    const operation = this.createDownloadsDialog();
    this.pendingOperations.set("downloads", operation);

    try {
      await operation;
    } finally {
      this.pendingOperations.delete("downloads");
    }
  }

  private async createDownloadsDialog(): Promise<void> {
    let dialog: BaseWindow | null = null;
    let view: WebContentsView | null = null;

    try {
      dialog = this.createDialog("downloads", {
        width: 880,
        height: 560,
        title: "Downloads",
        resizable: true,
      });

      view = (dialog as any).contentView as WebContentsView;

      // Validate WebContents before loading
      if (!view || !view.webContents || view.webContents.isDestroyed()) {
        throw new Error("Invalid WebContents for downloads dialog");
      }

      // Load the React downloads app instead of HTML template
      let downloadsUrl: string;
      if (process.env.NODE_ENV === "development") {
        // In development, use the dev server
        downloadsUrl = "http://localhost:5173/downloads.html";
      } else {
        // In production, use the built files
        downloadsUrl = `file://${path.join(__dirname, "../renderer/downloads.html")}`;
      }

      await this.loadContentWithTimeout(
        view.webContents,
        downloadsUrl,
        "downloads",
      );

      dialog.show();
      this.activeDialogs.set("downloads", dialog);

      logger.info("Downloads dialog opened successfully with React app");
    } catch (error) {
      logger.error("Failed to create downloads dialog:", error);

      // Clean up on error
      if (dialog && !dialog.isDestroyed()) {
        try {
          dialog.close();
        } catch (closeError) {
          logger.error("Error closing failed downloads dialog:", closeError);
        }
      }

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has("downloads")) {
        clearTimeout(this.loadingTimeouts.get("downloads")!);
        this.loadingTimeouts.delete("downloads");
      }

      throw error;
    }
  }

  public async showSettingsDialog(): Promise<void> {
    // Check for existing dialog first
    if (this.activeDialogs.has("settings")) {
      const existingDialog = this.activeDialogs.get("settings");
      if (
        existingDialog &&
        this.validateDialogState(existingDialog, "settings")
      ) {
        existingDialog.focus();
        return;
      }
    }

    // Prevent race conditions by checking for pending operations
    if (this.pendingOperations.has("settings")) {
      logger.debug("Settings dialog already being created, waiting...");
      return this.pendingOperations.get("settings");
    }

    const operation = this.createSettingsDialog();
    this.pendingOperations.set("settings", operation);

    try {
      await operation;
    } finally {
      this.pendingOperations.delete("settings");
    }
  }

  private async createSettingsDialog(): Promise<void> {
    let dialog: BaseWindow | null = null;
    let view: WebContentsView | null = null;

    try {
      dialog = this.createDialog("settings", {
        width: 800,
        height: 600,
        title: "Settings",
        resizable: true,
        maximizable: true,
      });

      view = (dialog as any).contentView as WebContentsView;

      // Validate WebContents before loading
      if (!view || !view.webContents || view.webContents.isDestroyed()) {
        throw new Error("Invalid WebContents for settings dialog");
      }

      // Load the React settings app instead of HTML template
      let settingsUrl: string;
      if (process.env.NODE_ENV === "development") {
        // In development, use the dev server
        settingsUrl = "http://localhost:5173/settings.html";
      } else {
        // In production, use the built files
        settingsUrl = `file://${path.join(__dirname, "../renderer/settings.html")}`;
      }

      await this.loadContentWithTimeout(
        view.webContents,
        settingsUrl,
        "settings",
      );

      dialog.show();
      this.activeDialogs.set("settings", dialog);

      logger.info("Settings dialog opened successfully with React app");
    } catch (error) {
      logger.error("Failed to create settings dialog:", error);

      // Clean up on error
      if (dialog && !dialog.isDestroyed()) {
        try {
          dialog.close();
        } catch (closeError) {
          logger.error("Error closing failed settings dialog:", closeError);
        }
      }

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has("settings")) {
        clearTimeout(this.loadingTimeouts.get("settings")!);
        this.loadingTimeouts.delete("settings");
      }

      throw error;
    }
  }

  public closeDialog(_type: string): boolean {
    logger.info(`Attempting to close dialog: ${_type}`);
    try {
      const dialog = this.activeDialogs.get(_type);
      if (dialog && this.validateDialogState(dialog, _type)) {
        logger.info(`Closing dialog window: ${_type}`);
        dialog.close();
        return true;
      }

      logger.warn(`Dialog ${_type} not found or invalid`);

      // Clean up tracking even if dialog is invalid
      this.activeDialogs.delete(_type);

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    } catch (error) {
      logger.error(`Error closing dialog ${_type}:`, error);

      // Force cleanup on error
      this.activeDialogs.delete(_type);
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    }
  }

  public forceCloseDialog(_type: string): boolean {
    logger.info(`Force closing dialog: ${_type}`);
    try {
      const dialog = this.activeDialogs.get(_type);
      if (dialog) {
        if (!dialog.isDestroyed()) {
          logger.info(`Force destroying dialog window: ${_type}`);
          dialog.destroy();
        }
        this.activeDialogs.delete(_type);

        // Clean up any pending timeouts
        if (this.loadingTimeouts.has(_type)) {
          clearTimeout(this.loadingTimeouts.get(_type)!);
          this.loadingTimeouts.delete(_type);
        }

        return true;
      }

      logger.warn(`Dialog ${_type} not found for force close`);
      return false;
    } catch (error) {
      logger.error(`Error force closing dialog ${_type}:`, error);

      // Force cleanup on error
      this.activeDialogs.delete(_type);
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    }
  }

  public closeAllDialogs(): void {
    const dialogTypes = Array.from(this.activeDialogs.keys());

    for (const dialogType of dialogTypes) {
      try {
        const dialog = this.activeDialogs.get(dialogType);
        if (dialog && !dialog.isDestroyed()) {
          dialog.close();
        }
      } catch (error) {
        logger.error(`Error closing dialog ${dialogType}:`, error);
      }
    }

    // Force cleanup of all state
    this.activeDialogs.clear();

    // Clean up all pending timeouts
    for (const [dialogType, timeout] of this.loadingTimeouts.entries()) {
      try {
        clearTimeout(timeout);
      } catch (error) {
        logger.error(`Error clearing timeout for ${dialogType}:`, error);
      }
    }
    this.loadingTimeouts.clear();
  }

  public destroy(): void {
    // Close all dialogs
    this.closeAllDialogs();

    // Remove from instances map
    DialogManager.instances.delete(this.parentWindow.id);

    // Remove all listeners
    this.removeAllListeners();

    logger.info("DialogManager destroyed");
  }
}
