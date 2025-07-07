/**
 * Dialog Manager for native Electron dialogs
 * Manages downloads and settings dialogs as child windows
 */

import { BaseWindow, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { EventEmitter } from "events";
import path from "path";
import * as fsSync from "fs";
import * as os from "os";
import { createLogger } from "@vibe/shared-types";
import * as sqlite3 from "sqlite3";
import { pbkdf2, createDecipheriv } from "crypto";
import { promisify } from "util";
import { exec } from "child_process";
import { Keyring } from "@napi-rs/keyring";

const pbkdf2Async = promisify(pbkdf2);
const execAsync = promisify(exec);

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

  /**
   * Security: Validate file paths to prevent directory traversal attacks
   */
  private validateFilePath(filePath: string): boolean {
    if (!filePath || typeof filePath !== "string") {
      return false;
    }

    // Check for directory traversal attempts
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes("..") || normalizedPath !== filePath) {
      logger.warn("Directory traversal attempt detected:", filePath);
      return false;
    }

    // Check for suspicious characters
    const suspiciousChars = /[<>"|*?]/;
    if (suspiciousChars.test(filePath)) {
      logger.warn("Suspicious characters in file path:", filePath);
      return false;
    }

    // Check path length
    if (filePath.length > 4096) {
      logger.warn("File path too long:", filePath.length);
      return false;
    }

    return true;
  }

  /**
   * Security: Safely join paths with validation
   */
  private safePath(...pathSegments: string[]): string {
    for (const segment of pathSegments) {
      if (!this.validateFilePath(segment)) {
        throw new Error("Invalid path segment detected");
      }
    }
    return path.join(...pathSegments);
  }

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

    // Password extraction handlers
    ipcMain.handle("password:extract-chrome", async () => {
      const tempManager = new DialogManager(new BrowserWindow({ show: false }));
      return tempManager.extractChromePasswords();
    });

    ipcMain.handle("passwords:import-chrome", async () => {
      try {
        logger.info("passwords:import-chrome IPC handler called");
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const result = await tempManager.extractChromePasswords();
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

        if (result.passwords && result.passwords.length > 0) {
          logger.info(
            `Storing ${result.passwords.length} passwords for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedPasswords(
            activeProfile.id,
            "chrome",
            result.passwords,
          );
        }

        logger.info(
          `Chrome import completed successfully with ${result.passwords?.length || 0} passwords`,
        );
        return { success: true, count: result.passwords?.length || 0 };
      } catch (error) {
        logger.error("Failed to import Chrome passwords:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

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

    // Comprehensive Chrome profile import handlers
    ipcMain.handle("chrome:import-comprehensive", async () => {
      try {
        logger.info("Starting comprehensive Chrome profile import");
        // Create a temporary DialogManager instance to access the methods
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const result = await tempManager.extractAllChromeData();

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
        if (data?.passwords?.passwords && data.passwords.passwords.length > 0) {
          logger.info(
            `Storing ${data.passwords.passwords.length} passwords for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedPasswords(
            activeProfile.id,
            "chrome",
            data.passwords.passwords,
          );
          totalSaved += data.passwords.passwords.length;
        } else {
          logger.warn(
            `No passwords to store. data?.passwords: ${JSON.stringify(data?.passwords)}`,
          );
        }

        // Save bookmarks if extracted
        if (data?.bookmarks?.bookmarks && data.bookmarks.bookmarks.length > 0) {
          logger.info(
            `Storing ${data.bookmarks.bookmarks.length} bookmarks for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedBookmarks(
            activeProfile.id,
            "chrome",
            data.bookmarks.bookmarks,
          );
          totalSaved += data.bookmarks.bookmarks.length;
        }

        // Save history if extracted
        if (data?.history?.entries && data.history.entries.length > 0) {
          logger.info(
            `Storing ${data.history.entries.length} history entries for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedHistory(
            activeProfile.id,
            "chrome",
            data.history.entries,
          );
          totalSaved += data.history.entries.length;
        }

        // Save autofill if extracted
        if (
          data?.autofill &&
          (data.autofill.entries?.length > 0 ||
            data.autofill.profiles?.length > 0)
        ) {
          const autofillCount =
            (data.autofill.entries?.length || 0) +
            (data.autofill.profiles?.length || 0);
          logger.info(
            `Storing ${autofillCount} autofill items for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedAutofill(
            activeProfile.id,
            "chrome",
            data.autofill,
          );
          totalSaved += autofillCount;
        }

        // Save search engines if extracted
        if (
          data?.searchEngines?.engines &&
          data.searchEngines.engines.length > 0
        ) {
          logger.info(
            `Storing ${data.searchEngines.engines.length} search engines for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedSearchEngines(
            activeProfile.id,
            "chrome",
            data.searchEngines.engines,
          );
          totalSaved += data.searchEngines.engines.length;
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
          // Add individual counts for the UI
          passwordCount: data?.passwords?.count || 0,
          bookmarkCount: data?.bookmarks?.count || 0,
          historyCount: data?.history?.count || 0,
          autofillCount: data?.autofill?.count || 0,
          searchEngineCount: data?.searchEngines?.count || 0,
        };
      } catch (error) {
        logger.error("Comprehensive Chrome import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("chrome:import-bookmarks", async () => {
      try {
        logger.info("Starting Chrome bookmarks import with progress");
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const browserProfiles = tempManager.findBrowserProfiles();
        const chromeProfiles = browserProfiles.filter(
          p => p.browser === "chrome",
        );

        if (chromeProfiles.length === 0) {
          return { success: false, error: "No Chrome profiles found" };
        }

        return await tempManager.extractChromeBookmarks(
          chromeProfiles[0],
          true,
        ); // Enable progress
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
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const browserProfiles = tempManager.findBrowserProfiles();
        const chromeProfiles = browserProfiles.filter(
          p => p.browser === "chrome",
        );

        if (chromeProfiles.length === 0) {
          return { success: false, error: "No Chrome profiles found" };
        }

        return await tempManager.extractChromeHistoryWithProgress(
          chromeProfiles[0],
        );
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
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const browserProfiles = tempManager.findBrowserProfiles();
        const chromeProfiles = browserProfiles.filter(
          p => p.browser === "chrome",
        );

        if (chromeProfiles.length === 0) {
          return { success: false, error: "No Chrome profiles found" };
        }

        return await tempManager.extractChromeAutofillWithProgress(
          chromeProfiles[0],
        );
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
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const browserProfiles = tempManager.findBrowserProfiles();
        const chromeProfiles = browserProfiles.filter(
          p => p.browser === "chrome",
        );

        if (chromeProfiles.length === 0) {
          return { success: false, error: "No Chrome profiles found" };
        }

        return await tempManager.extractChromeSearchEngines(chromeProfiles[0]);
      } catch (error) {
        logger.error("Chrome search engines import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("chrome:import-all-profiles", async () => {
      try {
        logger.info("Starting Chrome all profiles import");
        const tempManager = new DialogManager(
          new BrowserWindow({ show: false }),
        );
        const result = await tempManager.extractAllChromeProfiles();

        if (!result.success) {
          logger.warn("Chrome all profiles extraction failed:", result.error);
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

        // Save merged passwords if extracted
        if (data?.passwords && data.passwords.length > 0) {
          logger.info(
            `Storing ${data.passwords.length} merged passwords for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedPasswords(
            activeProfile.id,
            "chrome-all-profiles",
            data.passwords,
          );
          totalSaved += data.passwords.length;
        }

        // Save merged bookmarks if extracted
        if (data?.bookmarks && data.bookmarks.length > 0) {
          logger.info(
            `Storing ${data.bookmarks.length} merged bookmarks for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedBookmarks(
            activeProfile.id,
            "chrome-all-profiles",
            data.bookmarks,
          );
          totalSaved += data.bookmarks.length;
        }

        // Save merged history if extracted
        if (data?.history && data.history.length > 0) {
          logger.info(
            `Storing ${data.history.length} merged history entries for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedHistory(
            activeProfile.id,
            "chrome-all-profiles",
            data.history,
          );
          totalSaved += data.history.length;
        }

        // Save merged autofill if extracted
        if (
          data?.autofill &&
          (data.autofill.entries?.length > 0 ||
            data.autofill.profiles?.length > 0)
        ) {
          const autofillCount =
            (data.autofill.entries?.length || 0) +
            (data.autofill.profiles?.length || 0);
          logger.info(
            `Storing ${autofillCount} merged autofill items for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedAutofill(
            activeProfile.id,
            "chrome-all-profiles",
            data.autofill,
          );
          totalSaved += autofillCount;
        }

        // Save merged search engines if extracted
        if (data?.searchEngines && data.searchEngines.length > 0) {
          logger.info(
            `Storing ${data.searchEngines.length} merged search engines for profile ${activeProfile.id}`,
          );
          await userProfileStore.storeImportedSearchEngines(
            activeProfile.id,
            "chrome-all-profiles",
            data.searchEngines,
          );
          totalSaved += data.searchEngines.length;
        }

        logger.info(
          `Chrome all profiles import completed successfully with ${totalSaved} total items saved`,
        );
        return {
          success: true,
          data: {
            ...data,
            totalSaved,
          },
          // Add individual counts for the UI
          passwordCount: data?.passwords?.length || 0,
          bookmarkCount: data?.bookmarks?.length || 0,
          historyCount: data?.history?.length || 0,
          autofillCount:
            (data?.autofill?.entries?.length || 0) +
            (data?.autofill?.profiles?.length || 0),
          searchEngineCount: data?.searchEngines?.length || 0,
        };
      } catch (error) {
        logger.error("Chrome all profiles import failed:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
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
      show: false,
      modal: true,
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

      // Check if preload script loaded correctly
      view.webContents
        .executeJavaScript(
          `
        // Preload script check - results logged via main process
        // window.electron available: checked
        // window.electron.ipcRenderer available: checked
        // window.vibe available: checked
        window.electron && window.electron.ipcRenderer ? 'PRELOAD_OK' : 'PRELOAD_FAILED';
      `,
        )
        .then(result => {
          logger.debug(`Dialog ${type} preload check result: ${result}`);
        })
        .catch(err => {
          logger.error(`Dialog ${type} preload check error:`, err);
        });

      view.webContents.on("before-input-event", (_event, input) => {
        if (input.key === "Escape" && input.type === "keyDown") {
          logger.info(`Escape key pressed, closing dialog: ${type}`);
          this.closeDialog(type);
        }
      });
    });

    // Handle preload script errors
    view.webContents.on("preload-error", (_event, preloadPath, error) => {
      logger.error(`Preload script error for dialog ${type}:`, {
        preloadPath,
        error,
      });
    });

    // Handle console messages from the dialog
    view.webContents.on(
      "console-message",
      (_event, level, message, line, sourceId) => {
        if (
          message.includes("[Dialog Manager]") ||
          message.includes("password") ||
          level >= 2
        ) {
          logger.debug(
            `Dialog ${type} console [${level}]: ${message} (${sourceId}:${line})`,
          );
        }
      },
    );

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
        resizable: false,
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

  // Downloads dialog now uses React app instead of HTML template

  // @ts-expect-error - Old method kept for reference but not used
  private generateDownloadsHTML_OLD_UNUSED(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self';">
        <title>Downloads</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
            background: #fafafa;
            color: #1d1d1f;
            height: 100vh;
            overflow: hidden;
            font-size: 13px;
            line-height: 1.47;
            font-weight: 400;
          }
          
          .sidebar {
            height: 100vh;
            width: 100%;
            background: #f7f7f9;
            border-right: 1px solid #d1d1d6;
            display: flex;
            flex-direction: column;
            border-radius: 10px;
            overflow: hidden;
          }
          
          .sidebar-header {
            position: relative;
            padding: 52px 20px 20px 20px;
            border-bottom: 1px solid #d1d1d6;
            background: #fafafa;
          }
          
          .close-btn {
            background: #c7c7cc;
            color: #1d1d1f;
            border: none;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            font-weight: 300;
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 18px;
            right: 18px;
            z-index: 1000;
            transition: all 0.15s ease;
          }
          
          .close-btn:hover {
            background: #a1a1a6;
            transform: scale(1.05);
          }
          
          .sidebar-title {
            font-size: 19px;
            font-weight: 600;
            color: #1d1d1f;
            margin: 0;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
          }
          
          .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
          }
          
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            text-align: center;
            color: #86868b;
          }
          
          .empty-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.6;
          }
          
          .empty-text {
            font-size: 15px;
            font-weight: 500;
          }
          
          .download-item {
            display: flex;
            align-items: center;
            padding: 8px;
            margin-bottom: 1px;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.15s ease;
          }
          
          .download-item:hover {
            background: #e8e8ed;
          }
          
          .download-icon {
            width: 32px;
            height: 32px;
            margin-right: 12px;
            border-radius: 6px;
            background: #007aff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
          }
          
          .download-info {
            flex: 1;
            min-width: 0;
          }
          
          .download-name {
            font-weight: 500;
            font-size: 13px;
            color: #1d1d1f;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
          }
          
          .download-date {
            font-size: 11px;
            color: #86868b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          .download-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.15s ease;
          }
          
          .download-item:hover .download-actions {
            opacity: 1;
          }
          
          .action-btn {
            width: 26px;
            height: 26px;
            border: 1px solid #c7c7cc;
            border-radius: 6px;
            background: #ffffff;
            color: #007aff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            transition: all 0.15s ease;
          }
          
          .action-btn:hover {
            background: #f2f2f7;
            border-color: #a1a1a6;
          }
          
          .action-btn.secondary {
            color: #86868b;
          }
          
          .action-btn.secondary:hover {
            color: #6d6d70;
            background: #f2f2f7;
          }
          
          .sidebar-footer {
            padding: 12px;
            border-top: 1px solid #d1d1d6;
            background: #fafafa;
          }
          
          .footer-btn {
            width: 100%;
            padding: 10px 16px;
            border: 1px solid #c7c7cc;
            border-radius: 8px;
            background: #ffffff;
            color: #1d1d1f;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          }
          
          .footer-btn:hover {
            background: #f2f2f7;
            border-color: #a1a1a6;
          }
          
          /* Custom scrollbar for macOS style */
          ::-webkit-scrollbar {
            width: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          
          ::-webkit-scrollbar-thumb {
            background: #d1d1d6;
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: #b7b7bb;
          }
          
          /* Handle escape key */
          body {
            outline: none;
          }
        </style>
      </head>
      <body tabindex="0">
        <div class="sidebar">
          <div class="sidebar-header">
            <h1 class="sidebar-title">Downloads</h1>
            <button class="close-btn" onclick="closeDialog()">×</button>
          </div>
          
          <div class="sidebar-content">
            <div class="empty-state" id="empty-state">
              <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
              <div class="empty-text">No downloads</div>
            </div>
            <div id="downloads-list"></div>
          </div>
          
          <div class="sidebar-footer">
            <button class="footer-btn" onclick="clearAll()">Clear All Downloads</button>
          </div>
        </div>
        
        <script>
          // Handle escape key
          document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
              // Escape key pressed - handled via IPC
              closeDialog();
            }
          });
          
          function closeDialog() {
            // Attempting to close dialog - handled via IPC
            if (window.electron?.ipcRenderer) {
              window.electron.ipcRenderer.invoke('dialog:close', 'downloads')
                .then((result) => {
                  // Close result received - handled via IPC
                })
                .catch((error) => {
                  // Close error - handled via IPC
                });
            } else {
              // No electron IPC available error - critical issue
            }
          }
          
          function clearAll() {
            if (window.vibe?.downloads?.clearHistory) {
              window.vibe.downloads.clearHistory();
              displayDownloads([]);
            }
          }
          
          // Load downloads on ready
          document.addEventListener('DOMContentLoaded', async () => {
            try {
              if (window.vibe?.downloads?.getHistory) {
                const downloads = await window.vibe.downloads.getHistory();
                displayDownloads(downloads);
              }
            } catch (error) {
              // Failed to load downloads - error handled via IPC
            }
          });
          
          // HTML sanitization function to prevent XSS attacks
          function sanitizeHtml(str) {
            if (!str) return '';
            return str.toString()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#x27;')
              .split('/').join('&#x2F;');
          }

          function displayDownloads(downloads) {
            const emptyState = document.getElementById('empty-state');
            const downloadsList = document.getElementById('downloads-list');
            
            if (!downloads || downloads.length === 0) {
              emptyState.style.display = 'flex';
              downloadsList.innerHTML = '';
              return;
            }
            
            emptyState.style.display = 'none';
            
            const html = downloads.map(item => {
              const extension = item.fileName.split('.').pop()?.toLowerCase();
              const iconContent = getFileIcon(extension);
              const safeFileName = sanitizeHtml(item.fileName);
              const safeFilePath = sanitizeHtml(item.filePath);
              
              return \`
                <div class="download-item" onclick="openFile('\${safeFilePath}')">
                  <div class="download-icon">\${iconContent}</div>
                  <div class="download-info">
                    <div class="download-name" title="\${safeFileName}">\${safeFileName}</div>
                    <div class="download-date">\${formatDate(item.createdAt)}</div>
                  </div>
                  <div class="download-actions">
                    <button class="action-btn" onclick="event.stopPropagation(); openFile('\${safeFilePath}')" title="Open">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/>
                      </svg>
                    </button>
                    <button class="action-btn secondary" onclick="event.stopPropagation(); showInFolder('\${safeFilePath}')" title="Show in Finder">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              \`;
            }).join('');
            
            downloadsList.innerHTML = html;
          }
          
          function getFileIcon(extension) {
            const iconMap = {
              'pdf': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'doc': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'docx': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'xls': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3,2V22L21,12"/></svg>',
              'xlsx': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3,2V22L21,12"/></svg>',
              'zip': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2L13,8L12,14L11,8L12,2M6,10V12H8V14H6V16H8V18H10V16H8V14H10V12H8V10H6M16,10V12H14V14H16V16H14V18H12V16H14V14H12V12H14V10H16Z"/></svg>',
              'jpg': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'jpeg': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'png': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'mp4': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/></svg>',
              'mp3': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12Z"/></svg>'
            };
            return iconMap[extension] || '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>';
          }
          
          function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) {
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (days === 1) {
              return 'Yesterday';
            } else if (days < 7) {
              return \`\${days} days ago\`;
            } else {
              return date.toLocaleDateString();
            }
          }
          
          async function openFile(filePath) {
            try {
              await window.vibe?.downloads?.openFile(filePath);
            } catch (error) {
              // Failed to open file - error handled via IPC
            }
          }
          
          async function showInFolder(filePath) {
            try {
              await window.vibe?.downloads?.showFileInFolder(filePath);
            } catch (error) {
              // Failed to show file in folder - error handled via IPC
            }
          }
        </script>
      </body>
      </html>
    `;
  }

  // Settings dialog now uses React app instead of HTML template

  /**
   * Extract passwords from a specific Chrome profile
   */
  private async extractChromePasswordsFromProfile(profile: any): Promise<{
    success: boolean;
    passwords?: any[];
    error?: string;
  }> {
    const INCREMENT = 0.05;
    const INTERVAL_DELAY = 120; // ms
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info(
        `Starting Chrome credential extraction from profile: ${profile.name}`,
      );

      // Step 1: Initial progress
      this.updateProgress(0.02);

      // Step 2: Start extraction immediately
      this.updateProgress(0.05);

      // Step 3: Start progress animation
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.95) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      // Step 4: Get Chrome encryption key
      logger.info("Retrieving Chrome encryption key...");
      const key = await this.getChromeEncryptionKey(profile);
      if (!key) {
        logger.error("Failed to retrieve Chrome encryption key");
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        this.clearProgress();
        return {
          success: false,
          error: "Failed to retrieve Chrome encryption key",
        };
      }
      logger.info("Successfully retrieved Chrome encryption key");

      // Step 5: Extract passwords from the profile
      logger.info("Extracting and decrypting passwords...");
      const passwords = await this.getAllPasswords(profile, key);

      // Step 6: Complete progress
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0); // Complete

      // Hold at 100% for a moment, then clear
      setTimeout(() => {
        this.clearProgress();
      }, 1500);

      logger.info(
        `Successfully extracted ${passwords.length} Chrome credentials from ${profile.name}`,
      );
      return {
        success: true,
        passwords: passwords.map((pwd, index) => ({
          id: `chrome_${index}`,
          url: pwd.originUrl,
          username: pwd.username,
          password: pwd.password,
          source: "chrome",
          dateCreated: pwd.dateCreated,
        })),
      };
    } catch (error) {
      // Cleanup progress on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      this.clearProgress();

      logger.error(
        "Chrome credential extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract passwords from Chrome browser using SQLite database with progress tracking
   */
  private async extractChromePasswords(): Promise<{
    success: boolean;
    passwords?: any[];
    error?: string;
  }> {
    const INCREMENT = 0.05;
    const INTERVAL_DELAY = 120; // ms
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info(
        "Starting Chrome credential extraction with progress tracking",
      );

      // Step 1: Initial progress
      this.updateProgress(0.02);

      // Find Chrome profiles
      const browserProfiles = this.findBrowserProfiles();
      const chromeProfiles = browserProfiles.filter(
        profile => profile.browser === "chrome",
      );

      if (chromeProfiles.length === 0) {
        this.clearProgress();
        return {
          success: false,
          error: "No Chrome profiles found. Please ensure Chrome is installed.",
        };
      }

      // Log all available Chrome profiles
      logger.info(`Found ${chromeProfiles.length} Chrome profiles:`);
      chromeProfiles.forEach((prof, index) => {
        logger.info(
          `  ${index}: ${prof.name} at ${prof.path} (last modified: ${prof.lastModified})`,
        );
      });

      // Find the profile with the most passwords
      const profile = await this.selectBestChromeProfile(chromeProfiles);
      logger.info(`Selected profile: ${profile.name} at ${profile.path}`);

      // Step 2: Start extraction immediately
      this.updateProgress(0.05);

      // Step 3: Start progress animation
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.95) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      // Step 4: Get Chrome encryption key
      logger.info("Retrieving Chrome encryption key...");
      const key = await this.getChromeEncryptionKey(profile);
      if (!key) {
        logger.error("Failed to retrieve Chrome encryption key");
        if (progressInterval) {
          clearInterval(progressInterval);
        }
        this.clearProgress();
        return {
          success: false,
          error: "Failed to retrieve Chrome encryption key",
        };
      }
      logger.info("Successfully retrieved Chrome encryption key");

      // Step 5: Extract passwords from the profile
      logger.info("Extracting and decrypting passwords...");
      const passwords = await this.getAllPasswords(profile, key);

      // Step 6: Complete progress
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0); // Complete

      // Hold at 100% for a moment, then clear
      setTimeout(() => {
        this.clearProgress();
      }, 1500);

      logger.info(
        `Successfully extracted ${passwords.length} Chrome credentials`,
      );
      return {
        success: true,
        passwords: passwords.map((pwd, index) => ({
          id: `chrome_${index}`,
          url: pwd.originUrl,
          username: pwd.username,
          password: pwd.password,
          source: "chrome",
          dateCreated: pwd.dateCreated,
        })),
      };
    } catch (error) {
      // Cleanup progress on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      this.clearProgress();

      logger.error(
        "Chrome credential extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // Note: Enhanced getAllPasswords method is implemented below with @napi-rs/keyring support

  /**
   * Extract bookmarks from Chrome browser with progress tracking
   */
  private async extractChromeBookmarks(
    browserProfile: any,
    showProgress: boolean = false,
  ): Promise<{
    success: boolean;
    bookmarks?: any[];
    error?: string;
  }> {
    const INCREMENT = 0.1;
    const INTERVAL_DELAY = 100;
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info("Starting Chrome bookmarks extraction");

      if (showProgress) {
        this.updateProgress(0.05);

        // Start progress animation
        currentProgress = 0.05;
        progressInterval = setInterval(() => {
          if (currentProgress < 0.9) {
            currentProgress += INCREMENT;
            this.updateProgress(currentProgress);
          }
        }, INTERVAL_DELAY);
      }

      const bookmarksPath = this.safePath(browserProfile.path, "Bookmarks");
      if (!fsSync.existsSync(bookmarksPath)) {
        if (showProgress) {
          if (progressInterval) clearInterval(progressInterval);
          this.clearProgress();
        }
        return {
          success: false,
          error: "Bookmarks file not found in Chrome profile",
        };
      }

      const bookmarksData = JSON.parse(
        fsSync.readFileSync(bookmarksPath, "utf8"),
      );
      const bookmarks = this.parseBookmarksRecursive(bookmarksData.roots);

      if (showProgress) {
        if (progressInterval) {
          clearInterval(progressInterval);
          progressInterval = null;
        }
        this.updateProgress(1.0);
        setTimeout(() => this.clearProgress(), 1500);
      }

      logger.info(
        `Successfully extracted ${bookmarks.length} Chrome bookmarks`,
      );
      return {
        success: true,
        bookmarks: bookmarks.map((bookmark, index) => ({
          ...bookmark,
          id: bookmark.id || `chrome_bookmark_${index}`,
          source: "chrome",
        })),
      };
    } catch (error) {
      if (showProgress) {
        if (progressInterval) clearInterval(progressInterval);
        this.clearProgress();
      }

      logger.error(
        "Chrome bookmarks extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract Chrome history with progress tracking
   */
  private async extractChromeHistoryWithProgress(browserProfile: any): Promise<{
    success: boolean;
    history?: any[];
    error?: string;
  }> {
    const INCREMENT = 0.08;
    const INTERVAL_DELAY = 120;
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info("Starting Chrome history extraction with progress");
      this.updateProgress(0.05);

      // Start progress animation
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.9) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      const result = await this.extractChromeHistory(browserProfile);

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0);
      setTimeout(() => this.clearProgress(), 1500);

      return result;
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      this.clearProgress();
      throw error;
    }
  }

  /**
   * Extract Chrome autofill with progress tracking
   */
  private async extractChromeAutofillWithProgress(
    browserProfile: any,
  ): Promise<{
    success: boolean;
    autofill?: { entries: any[]; profiles: any[] };
    error?: string;
  }> {
    const INCREMENT = 0.08;
    const INTERVAL_DELAY = 120;
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info("Starting Chrome autofill extraction with progress");
      this.updateProgress(0.05);

      // Start progress animation
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.9) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      const result = await this.extractChromeAutofill(browserProfile);

      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0);
      setTimeout(() => this.clearProgress(), 1500);

      return result;
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      this.clearProgress();
      throw error;
    }
  }

  /**
   * Parse Chrome bookmarks recursively
   */
  private parseBookmarksRecursive(root: any, parentId?: string): any[] {
    const bookmarks: any[] = [];

    for (const [key, folder] of Object.entries(root as Record<string, any>)) {
      if (folder && typeof folder === "object") {
        if (folder.type === "folder") {
          const folderEntry = {
            id: folder.id,
            name: folder.name,
            type: "folder",
            dateAdded: folder.date_added
              ? parseInt(folder.date_added) / 1000
              : Date.now(),
            dateModified: folder.date_modified
              ? parseInt(folder.date_modified) / 1000
              : undefined,
            parentId,
            children: [],
          };

          bookmarks.push(folderEntry);

          if (folder.children && Array.isArray(folder.children)) {
            const childBookmarks = folder.children.map((child: any) => ({
              id: child.id,
              name: child.name,
              url: child.url,
              type: child.type,
              dateAdded: child.date_added
                ? parseInt(child.date_added) / 1000
                : Date.now(),
              parentId: folder.id,
            }));
            bookmarks.push(...childBookmarks);
          }
        } else if (folder.children && Array.isArray(folder.children)) {
          const childBookmarks = this.parseBookmarksRecursive(
            { [key]: folder },
            parentId,
          );
          bookmarks.push(...childBookmarks);
        }
      }
    }

    return bookmarks;
  }

  /**
   * Extract browsing history from Chrome browser
   */
  private async extractChromeHistory(browserProfile: any): Promise<{
    success: boolean;
    history?: any[];
    error?: string;
  }> {
    try {
      logger.info("Starting Chrome history extraction");

      const historyPath = this.safePath(browserProfile.path, "History");
      const tempDbPath = this.safePath(browserProfile.path, "History.temp");

      if (!fsSync.existsSync(historyPath)) {
        return {
          success: false,
          error: "History database not found in Chrome profile",
        };
      }

      // Create temporary database copy
      fsSync.copyFileSync(historyPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 500));

      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(
          tempDbPath,
          sqlite3.OPEN_READONLY,
          (err: any) => {
            if (err) {
              reject(
                new Error(`Failed to open History database: ${err.message}`),
              );
              return;
            }

            const query = `
            SELECT 
              u.url,
              u.title,
              u.visit_count,
              u.last_visit_time,
              v.visit_time,
              v.transition,
              v.visit_duration
            FROM urls u
            LEFT JOIN visits v ON u.id = v.url
            WHERE u.hidden = 0 AND u.url NOT LIKE 'chrome://%' AND u.url NOT LIKE 'chrome-extension://%'
            ORDER BY u.last_visit_time DESC
            LIMIT 5000
          `;

            db.all(query, (err: any, rows: any[]) => {
              if (err) {
                reject(err);
                return;
              }

              const history = rows.map(row => ({
                url: row.url,
                title: row.title || "",
                timestamp: row.visit_time || row.last_visit_time,
                visitCount: row.visit_count || 1,
                lastVisit: row.last_visit_time,
                transitionType: this.getTransitionType(row.transition),
                visitDuration: row.visit_duration,
                source: "chrome",
              }));

              db.close();
              try {
                fsSync.unlinkSync(tempDbPath);
              } catch (cleanupError) {
                logger.warn(
                  "Failed to cleanup history temp file:",
                  cleanupError,
                );
              }

              logger.info(
                `Successfully extracted ${history.length} Chrome history entries`,
              );
              resolve({ success: true, history });
            });
          },
        );
      });
    } catch (error) {
      logger.error(
        "Chrome history extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get transition type from Chrome transition number
   */
  private getTransitionType(transition: number): string {
    const types: Record<number, string> = {
      0: "link",
      1: "typed",
      2: "auto_bookmark",
      3: "auto_subframe",
      4: "manual_subframe",
      5: "generated",
      6: "auto_toplevel",
      7: "form_submit",
      8: "reload",
      9: "keyword",
      10: "keyword_generated",
    };
    return types[transition] || "unknown";
  }

  /**
   * Extract autofill data from Chrome browser
   */
  private async extractChromeAutofill(browserProfile: any): Promise<{
    success: boolean;
    autofill?: { entries: any[]; profiles: any[] };
    error?: string;
  }> {
    try {
      logger.info("Starting Chrome autofill extraction");

      const webDataPath = this.safePath(browserProfile.path, "Web Data");
      const tempDbPath = this.safePath(browserProfile.path, "Web Data.temp");

      if (!fsSync.existsSync(webDataPath)) {
        return {
          success: false,
          error: "Web Data database not found in Chrome profile",
        };
      }

      // Create temporary database copy
      fsSync.copyFileSync(webDataPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 500));

      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(
          tempDbPath,
          sqlite3.OPEN_READONLY,
          (err: any) => {
            if (err) {
              reject(
                new Error(`Failed to open Web Data database: ${err.message}`),
              );
              return;
            }

            // Get autofill entries
            db.all(
              "SELECT name, value, count, date_created, date_last_used FROM autofill",
              (err: any, autofillRows: any[]) => {
                if (err) {
                  reject(err);
                  return;
                }

                // Get autofill profiles
                db.all(
                  `
              SELECT 
                guid, company_name, street_address, city, state, zipcode, country_code,
                date_modified, use_count, use_date
              FROM autofill_profiles
            `,
                  (err: any, profileRows: any[]) => {
                    if (err) {
                      reject(err);
                      return;
                    }

                    const autofillEntries = autofillRows.map(row => ({
                      id: `autofill_${Date.now()}_${Math.random()}`,
                      name: row.name,
                      value: row.value,
                      count: row.count,
                      dateCreated: row.date_created,
                      dateLastUsed: row.date_last_used,
                      source: "chrome",
                    }));

                    const autofillProfiles = profileRows.map(row => ({
                      id: row.guid,
                      company: row.company_name,
                      addressLine1: row.street_address,
                      city: row.city,
                      state: row.state,
                      zipCode: row.zipcode,
                      country: row.country_code,
                      dateModified: row.date_modified,
                      useCount: row.use_count,
                      source: "chrome",
                    }));

                    db.close();
                    try {
                      fsSync.unlinkSync(tempDbPath);
                    } catch (cleanupError) {
                      logger.warn(
                        "Failed to cleanup autofill temp file:",
                        cleanupError,
                      );
                    }

                    logger.info(
                      `Successfully extracted ${autofillEntries.length} autofill entries and ${autofillProfiles.length} profiles`,
                    );
                    resolve({
                      success: true,
                      autofill: {
                        entries: autofillEntries,
                        profiles: autofillProfiles,
                      },
                    });
                  },
                );
              },
            );
          },
        );
      });
    } catch (error) {
      logger.error(
        "Chrome autofill extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract search engines from Chrome browser
   */
  private async extractChromeSearchEngines(browserProfile: any): Promise<{
    success: boolean;
    searchEngines?: any[];
    error?: string;
  }> {
    try {
      logger.info("Starting Chrome search engines extraction");

      const webDataPath = this.safePath(browserProfile.path, "Web Data");
      const tempDbPath = this.safePath(browserProfile.path, "Web Data.temp");

      if (!fsSync.existsSync(webDataPath)) {
        return {
          success: false,
          error: "Web Data database not found in Chrome profile",
        };
      }

      // Create temporary database copy
      fsSync.copyFileSync(webDataPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 500));

      return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(
          tempDbPath,
          sqlite3.OPEN_READONLY,
          (err: any) => {
            if (err) {
              reject(
                new Error(`Failed to open Web Data database: ${err.message}`),
              );
              return;
            }

            const query = `
            SELECT 
              id, short_name, keyword, favicon_url, url, 
              date_created, usage_count, last_modified
            FROM keywords
            WHERE url IS NOT NULL AND url != ''
            ORDER BY usage_count DESC, last_modified DESC
          `;

            db.all(query, (err: any, rows: any[]) => {
              if (err) {
                reject(err);
                return;
              }

              const searchEngines = rows.map(row => ({
                id: `search_engine_${row.id}`,
                name: row.short_name,
                keyword: row.keyword,
                searchUrl: row.url,
                favIconUrl: row.favicon_url,
                isDefault: false, // Chrome doesn't store this in keywords table
                dateCreated: row.date_created,
                usageCount: row.usage_count,
                source: "chrome",
              }));

              db.close();
              try {
                fsSync.unlinkSync(tempDbPath);
              } catch (cleanupError) {
                logger.warn(
                  "Failed to cleanup search engines temp file:",
                  cleanupError,
                );
              }

              logger.info(
                `Successfully extracted ${searchEngines.length} Chrome search engines`,
              );
              resolve({ success: true, searchEngines });
            });
          },
        );
      });
    } catch (error) {
      logger.error(
        "Chrome search engines extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Comprehensive Chrome profile import with progress tracking
   */
  private async extractAllChromeData(browserProfile?: any): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    const INCREMENT = 0.03;
    const INTERVAL_DELAY = 100; // ms
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info(
        "Starting comprehensive Chrome profile extraction with progress tracking",
      );

      // Find Chrome profiles if not provided
      let profile = browserProfile;
      if (!profile) {
        const browserProfiles = this.findBrowserProfiles();
        const chromeProfiles = browserProfiles.filter(
          p => p.browser === "chrome",
        );

        if (chromeProfiles.length === 0) {
          return {
            success: false,
            error:
              "No Chrome profiles found. Please ensure Chrome is installed.",
          };
        }

        // Log all available Chrome profiles
        logger.info(`Found ${chromeProfiles.length} Chrome profiles:`);
        chromeProfiles.forEach((prof, index) => {
          logger.info(
            `  ${index}: ${prof.name} at ${prof.path} (last modified: ${prof.lastModified})`,
          );
        });

        // Find the profile with the most passwords
        profile = await this.selectBestChromeProfile(chromeProfiles);
        logger.info(`Selected profile: ${profile.name} at ${profile.path}`);
      }

      // Step 1: Start progress immediately (skip slow counting for better UX)
      this.updateProgress(0.05);

      // Step 2: Start progress animation for import process
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.95) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      // Step 3: Extract all data types with progress tracking
      logger.info("Extracting Chrome data with progress tracking...");

      const results = await Promise.allSettled([
        this.extractChromePasswordsFromProfile(profile),
        this.extractChromeBookmarks(profile),
        this.extractChromeHistory(profile),
        this.extractChromeAutofill(profile),
        this.extractChromeSearchEngines(profile),
      ]);

      const [
        passwordResult,
        bookmarkResult,
        historyResult,
        autofillResult,
        searchEngineResult,
      ] = results;

      // Step 4: Process results and build comprehensive data
      const comprehensiveData: any = {
        source: "chrome",
        timestamp: Date.now(),
        totalItems: 0,
      };

      // Process password results
      if (
        passwordResult.status === "fulfilled" &&
        passwordResult.value.success
      ) {
        comprehensiveData.passwords = {
          passwords: passwordResult.value.passwords || [],
          timestamp: Date.now(),
          source: "chrome",
          count: (passwordResult.value.passwords || []).length,
        };
        comprehensiveData.totalItems += comprehensiveData.passwords.count;
        logger.info(
          `Password extraction result: ${comprehensiveData.passwords.count} passwords found`,
        );
      } else {
        logger.warn(
          `Password extraction failed or returned no results`,
          passwordResult,
        );
      }

      // Process bookmark results
      if (
        bookmarkResult.status === "fulfilled" &&
        bookmarkResult.value.success
      ) {
        comprehensiveData.bookmarks = {
          bookmarks: bookmarkResult.value.bookmarks || [],
          timestamp: Date.now(),
          source: "chrome",
          count: (bookmarkResult.value.bookmarks || []).length,
        };
        comprehensiveData.totalItems += comprehensiveData.bookmarks.count;
      }

      // Process history results
      if (historyResult.status === "fulfilled" && historyResult.value.success) {
        comprehensiveData.history = {
          entries: historyResult.value.history || [],
          timestamp: Date.now(),
          source: "chrome",
          count: (historyResult.value.history || []).length,
        };
        comprehensiveData.totalItems += comprehensiveData.history.count;
      }

      // Process autofill results
      if (
        autofillResult.status === "fulfilled" &&
        autofillResult.value.success
      ) {
        const autofillData = autofillResult.value.autofill || {
          entries: [],
          profiles: [],
        };
        comprehensiveData.autofill = {
          entries: autofillData.entries,
          profiles: autofillData.profiles,
          timestamp: Date.now(),
          source: "chrome",
          count: autofillData.entries.length + autofillData.profiles.length,
        };
        comprehensiveData.totalItems += comprehensiveData.autofill.count;
      }

      // Process search engine results
      if (
        searchEngineResult.status === "fulfilled" &&
        searchEngineResult.value.success
      ) {
        comprehensiveData.searchEngines = {
          engines: searchEngineResult.value.searchEngines || [],
          timestamp: Date.now(),
          source: "chrome",
          count: (searchEngineResult.value.searchEngines || []).length,
        };
        comprehensiveData.totalItems += comprehensiveData.searchEngines.count;
      }

      // Step 5: Complete progress and cleanup
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0); // Complete

      // Hold at 100% for a moment, then clear
      setTimeout(() => {
        this.clearProgress();
      }, 2000);

      logger.info(
        `Successfully extracted comprehensive Chrome data with ${comprehensiveData.totalItems}/${comprehensiveData.expectedItems} items`,
      );
      return {
        success: true,
        data: comprehensiveData,
      };
    } catch (error) {
      // Cleanup progress on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      this.clearProgress();

      logger.error(
        "Comprehensive Chrome extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract data from all Chrome profiles and merge them
   */
  private async extractAllChromeProfiles(): Promise<{
    success: boolean;
    data?: any;
    error?: string;
  }> {
    const INCREMENT = 0.02;
    const INTERVAL_DELAY = 150; // ms
    let progressInterval: NodeJS.Timeout | null = null;
    let currentProgress = 0;

    try {
      logger.info("Starting extraction from all Chrome profiles");

      // Find all Chrome profiles
      const browserProfiles = this.findBrowserProfiles();
      const chromeProfiles = browserProfiles.filter(
        p => p.browser === "chrome",
      );

      if (chromeProfiles.length === 0) {
        return {
          success: false,
          error: "No Chrome profiles found. Please ensure Chrome is installed.",
        };
      }

      logger.info(`Found ${chromeProfiles.length} Chrome profiles to process`);
      chromeProfiles.forEach((prof, index) => {
        logger.info(`  ${index}: ${prof.name} at ${prof.path}`);
      });

      // Start progress
      this.updateProgress(0.05);

      // Start progress animation
      currentProgress = 0.05;
      progressInterval = setInterval(() => {
        if (currentProgress < 0.95) {
          currentProgress += INCREMENT;
          this.updateProgress(currentProgress);
        }
      }, INTERVAL_DELAY);

      // Initialize merged data
      const mergedData = {
        passwords: [] as any[],
        bookmarks: [] as any[],
        history: [] as any[],
        autofill: { entries: [] as any[], profiles: [] as any[] },
        searchEngines: [] as any[],
        source: "chrome-all-profiles",
        timestamp: Date.now(),
        totalItems: 0,
        profilesProcessed: 0,
      };

      // Process each profile
      for (const [index, profile] of chromeProfiles.entries()) {
        try {
          logger.info(
            `Processing profile ${index + 1}/${chromeProfiles.length}: ${profile.name}`,
          );

          // Extract data from this profile
          const results = await Promise.allSettled([
            this.extractChromePasswordsFromProfile(profile),
            this.extractChromeBookmarks(profile),
            this.extractChromeHistory(profile),
            this.extractChromeAutofill(profile),
            this.extractChromeSearchEngines(profile),
          ]);

          const [
            passwordResult,
            bookmarkResult,
            historyResult,
            autofillResult,
            searchEngineResult,
          ] = results;

          let profileItemCount = 0;

          // Merge passwords
          if (
            passwordResult.status === "fulfilled" &&
            passwordResult.value.success
          ) {
            const passwords = passwordResult.value.passwords || [];
            mergedData.passwords.push(
              ...passwords.map(pwd => ({
                ...pwd,
                id: `${profile.name}_${pwd.id}`,
                sourceProfile: profile.name,
              })),
            );
            profileItemCount += passwords.length;
            logger.info(
              `  Added ${passwords.length} passwords from ${profile.name}`,
            );
          }

          // Merge bookmarks
          if (
            bookmarkResult.status === "fulfilled" &&
            bookmarkResult.value.success
          ) {
            const bookmarks = bookmarkResult.value.bookmarks || [];
            mergedData.bookmarks.push(
              ...bookmarks.map(bm => ({
                ...bm,
                id: `${profile.name}_${bm.id}`,
                sourceProfile: profile.name,
              })),
            );
            profileItemCount += bookmarks.length;
            logger.info(
              `  Added ${bookmarks.length} bookmarks from ${profile.name}`,
            );
          }

          // Merge history
          if (
            historyResult.status === "fulfilled" &&
            historyResult.value.success
          ) {
            const history = historyResult.value.history || [];
            mergedData.history.push(
              ...history.map(h => ({
                ...h,
                id: `${profile.name}_${h.url}_${h.timestamp}`,
                sourceProfile: profile.name,
              })),
            );
            profileItemCount += history.length;
            logger.info(
              `  Added ${history.length} history entries from ${profile.name}`,
            );
          }

          // Merge autofill
          if (
            autofillResult.status === "fulfilled" &&
            autofillResult.value.success
          ) {
            const autofill = autofillResult.value.autofill || {
              entries: [],
              profiles: [],
            };
            mergedData.autofill.entries.push(
              ...autofill.entries.map(entry => ({
                ...entry,
                id: `${profile.name}_${entry.id}`,
                sourceProfile: profile.name,
              })),
            );
            mergedData.autofill.profiles.push(
              ...autofill.profiles.map(prof => ({
                ...prof,
                id: `${profile.name}_${prof.id}`,
                sourceProfile: profile.name,
              })),
            );
            const autofillCount =
              autofill.entries.length + autofill.profiles.length;
            profileItemCount += autofillCount;
            logger.info(
              `  Added ${autofillCount} autofill items from ${profile.name}`,
            );
          }

          // Merge search engines
          if (
            searchEngineResult.status === "fulfilled" &&
            searchEngineResult.value.success
          ) {
            const searchEngines = searchEngineResult.value.searchEngines || [];
            mergedData.searchEngines.push(
              ...searchEngines.map(se => ({
                ...se,
                id: `${profile.name}_${se.id}`,
                sourceProfile: profile.name,
              })),
            );
            profileItemCount += searchEngines.length;
            logger.info(
              `  Added ${searchEngines.length} search engines from ${profile.name}`,
            );
          }

          mergedData.totalItems += profileItemCount;
          mergedData.profilesProcessed++;
          logger.info(
            `  Profile ${profile.name} processed: ${profileItemCount} total items`,
          );
        } catch (error) {
          logger.warn(`Failed to process profile ${profile.name}:`, error);
        }
      }

      // Remove duplicates
      mergedData.passwords = this.removeDuplicatePasswords(
        mergedData.passwords,
      );
      mergedData.bookmarks = this.removeDuplicateBookmarks(
        mergedData.bookmarks,
      );
      mergedData.history = this.removeDuplicateHistory(mergedData.history);
      mergedData.searchEngines = this.removeDuplicateSearchEngines(
        mergedData.searchEngines,
      );

      // Complete progress
      if (progressInterval) {
        clearInterval(progressInterval);
        progressInterval = null;
      }

      this.updateProgress(1.0);

      // Hold at 100% for a moment, then clear
      setTimeout(() => {
        this.clearProgress();
      }, 2000);

      logger.info(
        `Successfully extracted and merged Chrome data from ${mergedData.profilesProcessed} profiles: ` +
          `${mergedData.passwords.length} passwords, ${mergedData.bookmarks.length} bookmarks, ` +
          `${mergedData.history.length} history entries, ${mergedData.autofill.entries.length + mergedData.autofill.profiles.length} autofill items, ` +
          `${mergedData.searchEngines.length} search engines`,
      );

      return {
        success: true,
        data: mergedData,
      };
    } catch (error) {
      // Cleanup progress on error
      if (progressInterval) {
        clearInterval(progressInterval);
      }
      this.clearProgress();

      logger.error(
        "All Chrome profiles extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Remove duplicate passwords based on URL and username
   */
  private removeDuplicatePasswords(passwords: any[]): any[] {
    const seen = new Set<string>();
    return passwords.filter(password => {
      const key = `${password.url}:${password.username}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicate bookmarks based on URL
   */
  private removeDuplicateBookmarks(bookmarks: any[]): any[] {
    const seen = new Set<string>();
    return bookmarks.filter(bookmark => {
      const key = bookmark.url || bookmark.name;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicate history entries based on URL
   */
  private removeDuplicateHistory(history: any[]): any[] {
    const seen = new Set<string>();
    return history.filter(entry => {
      const key = `${entry.url}:${entry.timestamp}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Remove duplicate search engines based on URL
   */
  private removeDuplicateSearchEngines(searchEngines: any[]): any[] {
    const seen = new Set<string>();
    return searchEngines.filter(engine => {
      const key = engine.searchUrl || engine.name;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  // Removed unused _countChromeProfileItems method

  // Removed unused countBookmarksRecursive method

  /**
   * Update progress bar for main window
   */
  private updateProgress(progress: number): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(progress);
        logger.debug(`Progress updated to: ${(progress * 100).toFixed(1)}%`);
      }
    } catch (error) {
      logger.warn("Failed to update progress bar:", error);
    }
  }

  /**
   * Clear progress bar
   */
  private clearProgress(): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(-1); // Clear progress bar
        logger.debug("Progress bar cleared");
      }
    } catch (error) {
      logger.warn("Failed to clear progress bar:", error);
    }
  }

  /**
   * Select the Chrome profile with the most passwords
   */
  private async selectBestChromeProfile(chromeProfiles: any[]): Promise<any> {
    if (chromeProfiles.length === 1) {
      return chromeProfiles[0];
    }

    let bestProfile = chromeProfiles[0];
    let maxPasswordCount = 0;

    for (const profile of chromeProfiles) {
      try {
        const passwordCount = await this.countPasswordsInProfile(profile);
        logger.info(`Profile ${profile.name}: ${passwordCount} passwords`);

        if (passwordCount > maxPasswordCount) {
          maxPasswordCount = passwordCount;
          bestProfile = profile;
        }
      } catch (error) {
        logger.warn(
          `Failed to count passwords in profile ${profile.name}:`,
          error,
        );
      }
    }

    logger.info(
      `Selected profile ${bestProfile.name} with ${maxPasswordCount} passwords`,
    );
    return bestProfile;
  }

  /**
   * Count passwords in a specific Chrome profile
   */
  private async countPasswordsInProfile(browserProfile: any): Promise<number> {
    const loginDataPath = this.safePath(browserProfile.path, "Login Data");

    if (!fsSync.existsSync(loginDataPath)) {
      return 0;
    }

    const tempDbPath = this.safePath(
      browserProfile.path,
      "Login Data.temp.count",
    );

    try {
      // Create temporary database copy
      fsSync.copyFileSync(loginDataPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 100));

      return new Promise(resolve => {
        const db = new sqlite3.Database(
          tempDbPath,
          sqlite3.OPEN_READONLY,
          err => {
            if (err) {
              logger.warn(
                `Failed to open database for counting: ${err.message}`,
              );
              resolve(0);
              return;
            }

            db.get(
              "SELECT COUNT(*) as count FROM logins WHERE password_value IS NOT NULL AND password_value != ''",
              (err: any, row: any) => {
                if (err) {
                  logger.warn(`Failed to count passwords: ${err.message}`);
                  resolve(0);
                } else {
                  resolve(row?.count || 0);
                }

                db.close();
                try {
                  fsSync.unlinkSync(tempDbPath);
                } catch (cleanupError) {
                  logger.warn(
                    "Failed to cleanup temp count file:",
                    cleanupError,
                  );
                }
              },
            );
          },
        );
      });
    } catch (error) {
      logger.warn(
        `Error counting passwords in profile ${browserProfile.name}:`,
        error,
      );
      try {
        if (fsSync.existsSync(tempDbPath)) {
          fsSync.unlinkSync(tempDbPath);
        }
      } catch {
        // Ignore cleanup errors
      }
      return 0;
    }
  }

  /**
   * Read browser profiles from the system
   */
  private readBrowserProfiles(browserPath: string, browserType: string): any[] {
    const browserProfiles: any[] = [];
    try {
      if (!fsSync.existsSync(browserPath)) {
        return browserProfiles;
      }

      // Check if this is a test profile (single profile directory)
      if (
        process.env.VIBE_TEST_CHROME_PROFILE &&
        browserPath === process.env.VIBE_TEST_CHROME_PROFILE
      ) {
        const localStatePath = this.safePath(browserPath, "Local State");
        if (fsSync.existsSync(localStatePath)) {
          browserProfiles.push({
            name: "Test Profile",
            path: browserPath,
            lastModified: fsSync.statSync(browserPath).mtime,
            browser: browserType,
          });
        }
        return browserProfiles;
      }

      const localStatePath = this.safePath(browserPath, "Local State");
      if (fsSync.existsSync(localStatePath)) {
        const localState = JSON.parse(
          fsSync.readFileSync(localStatePath, "utf8"),
        );
        const profilesInfo = localState.profile?.info_cache || {};

        const defaultProfilePath = this.safePath(browserPath, "Default");
        if (fsSync.existsSync(defaultProfilePath)) {
          browserProfiles.push({
            name: "Default",
            path: defaultProfilePath,
            lastModified: fsSync.statSync(defaultProfilePath).mtime,
            browser: browserType,
          });
        }

        Object.entries(profilesInfo).forEach(
          ([profileDir, info]: [string, any]) => {
            if (profileDir !== "Default") {
              const profilePath = this.safePath(browserPath, profileDir);
              if (fsSync.existsSync(profilePath)) {
                browserProfiles.push({
                  name: info.name || profileDir,
                  path: profilePath,
                  lastModified: fsSync.statSync(profilePath).mtime,
                  browser: browserType,
                });
              }
            }
          },
        );
      }
    } catch (error) {
      logger.error(`Error reading ${browserType} profiles:`, error);
    }
    return browserProfiles;
  }

  /**
   * Find all browser profiles on the system
   */
  private findBrowserProfiles(): any[] {
    let chromePath = "";
    let arcPath = "";
    let safariPath = "";

    // Check for test Chrome profile environment variable
    if (process.env.VIBE_TEST_CHROME_PROFILE) {
      chromePath = process.env.VIBE_TEST_CHROME_PROFILE;
      logger.info(`Using test Chrome profile: ${chromePath}`);
    } else {
      switch (process.platform) {
        case "win32":
          chromePath = path.join(
            process.env.LOCALAPPDATA || "",
            "Google/Chrome/User Data",
          );
          arcPath = path.join(process.env.LOCALAPPDATA || "", "Arc/User Data");
          break;
        case "darwin":
          chromePath = path.join(
            os.homedir(),
            "Library/Application Support/Google/Chrome",
          );
          arcPath = path.join(
            os.homedir(),
            "Library/Application Support/Arc/User Data",
          );
          safariPath = path.join(os.homedir(), "Library/Safari");
          break;
        case "linux":
          chromePath = path.join(os.homedir(), ".config/google-chrome");
          arcPath = path.join(os.homedir(), ".config/arc");
          break;
        default:
          logger.info("Unsupported operating system");
      }
    }

    const allProfiles = [
      ...this.readBrowserProfiles(chromePath, "chrome"),
      ...this.readBrowserProfiles(arcPath, "arc"),
    ];

    if (process.platform === "darwin" && fsSync.existsSync(safariPath)) {
      allProfiles.push({
        name: "Safari Data",
        path: safariPath,
        lastModified: fsSync.statSync(safariPath).mtime,
        browser: "safari",
      });
    }

    return allProfiles.sort((a, b) => {
      if (a.browser < b.browser) return -1;
      if (a.browser > b.browser) return 1;
      return b.lastModified.getTime() - a.lastModified.getTime();
    });
  }

  /**
   * Get Chrome encryption key from Local State
   */
  private async getChromeEncryptionKey(
    browserProfile: any,
  ): Promise<Buffer | null> {
    try {
      // Try MacKeyStrategy first for better keyring access
      if (process.platform === "darwin") {
        try {
          return await this.getMacKeyStrategy(browserProfile);
        } catch (error) {
          logger.debug("MacKeyStrategy failed, falling back to Local State:", error);
        }
      }

      const localStatePath = this.safePath(
        path.dirname(browserProfile.path),
        "Local State",
      );
      if (!fsSync.existsSync(localStatePath)) {
        logger.error("Local State file not found");
        return null;
      }

      const localState = JSON.parse(
        fsSync.readFileSync(localStatePath, "utf8"),
      );
      const encryptedKey = localState.os_crypt?.encrypted_key;

      if (!encryptedKey) {
        logger.warn("Encrypted key not found in Local State, trying keyring fallback");
        return await this.deriveChromeMasterKey();
      }

      // Decode base64 and remove DPAPI prefix
      const decodedKey = Buffer.from(encryptedKey, "base64");
      const keyWithoutPrefix = decodedKey.subarray(5); // Remove "DPAPI" prefix

      // Enhanced key derivation strategy for all platforms
      return await this.deriveChromeMasterKey(keyWithoutPrefix);
    } catch (error) {
      logger.error("Error getting Chrome encryption key:", error);
      return null;
    }
  }

  /**
   * Enhanced Chrome master key derivation using the robust strategy
   */
  private async deriveChromeMasterKey(
    keyWithoutPrefix?: Buffer,
  ): Promise<Buffer | null> {
    const salt = "saltysalt";
    const iterations = 1003;
    const keyLength = 16;

    try {
      // First, try to get the password from system keyring
      const keychainPassword = await this.getChromeSafeStorageKeyFromKeychain();
      if (keychainPassword) {
        logger.info(
          "Using keychain-derived key for Chrome password decryption",
        );
        return keychainPassword;
      }

      // Fallback strategy: try to derive from keyring password
      try {
        const keyring = new Keyring("Chrome Safe Storage", "Chrome");
        const result = await keyring.getPassword();

        if (result) {
          const derivedKey = await pbkdf2Async(
            result.toString(),
            salt,
            iterations,
            keyLength,
            "sha1",
          );
          logger.info("Successfully derived key from keyring password");
          return derivedKey;
        }
      } catch {
        logger.debug("Could not retrieve from keyring, trying fallback");
      }

      // Final fallback: use Chrome's default "peanuts" password
      logger.info("Using Chrome default password fallback for key derivation");
      const derivedKey = await pbkdf2Async(
        "peanuts",
        salt,
        iterations,
        keyLength,
        "sha1",
      );
      return derivedKey;
    } catch (error) {
      logger.error("Error in key derivation:", error);

      // Last resort: return the original key without prefix (for Windows DPAPI)
      if (keyWithoutPrefix && process.platform === "win32") {
        logger.info("Using Windows DPAPI key as last resort");
        return keyWithoutPrefix;
      }

      return null;
    }
  }

  /**
   * Get Chrome Safe Storage key from system keyring using @napi-rs/keyring
   */
  private async getChromeSafeStorageKeyFromKeychain(): Promise<Buffer | null> {
    try {
      // Try using @napi-rs/keyring first for cross-platform support
      try {
        const keyring = new Keyring("Chrome Safe Storage", "Chrome");
        const password = await keyring.getPassword();

        if (password) {
          logger.info(
            "Successfully retrieved Chrome Safe Storage key from system keyring",
          );

          // Chrome uses PBKDF2 to derive the actual key from the keyring password
          const salt = Buffer.from("saltysalt");
          const iterations = 1003;
          const keyLength = 16;

          const key = await pbkdf2Async(
            password,
            salt,
            iterations,
            keyLength,
            "sha1",
          );

          logger.debug(
            "Successfully derived encryption key from keyring password",
          );
          return key;
        }
      } catch (keyringError: any) {
        logger.debug(
          "Chrome Safe Storage not found in system keyring:",
          keyringError.message,
        );
      }

      // Fallback to macOS security command if keyring fails
      if (process.platform === "darwin") {
        try {
          const command = `security find-generic-password -s "Chrome Safe Storage" -w`;
          const { stdout } = await execAsync(command);
          const password = stdout.trim();

          if (password) {
            // Chrome uses PBKDF2 to derive the actual key from the Keychain password
            const salt = Buffer.from("saltysalt");
            const iterations = 1003;
            const keyLength = 16;

            const key = await pbkdf2Async(
              password,
              salt,
              iterations,
              keyLength,
              "sha1",
            );

            logger.debug(
              "Successfully derived encryption key from Keychain password (fallback)",
            );
            return key;
          }
        } catch (error: any) {
          logger.debug(
            "Chrome Safe Storage not found in Keychain (fallback):",
            error.message,
          );
        }
      }

      return null;
    } catch (error) {
      logger.error("Error accessing system keyring:", error);
      return null;
    }
  }

  /**
   * Mac Key Strategy for direct keyring access (similar to overlay-vibe implementation)
   */
  private async getMacKeyStrategy(browserProfile: any): Promise<Buffer | null> {
    const iterations = 1003;
    const keyLength = 16;
    
    let name = "";
    let accountName = "";
    
    if (browserProfile.browser === "chrome") {
      name = "Chrome Safe Storage";
      accountName = "Chrome";
    } else if (browserProfile.browser === "arc") {
      name = "Arc Safe Storage";
      accountName = "Arc";
    } else {
      throw new Error(`Unsupported browser: ${browserProfile.browser}`);
    }

    try {
      const keyring = new Keyring(name, accountName);
      const password = await keyring.getPassword();
      
      if (!password) {
        throw new Error(`Failed to retrieve ${browserProfile.browser} Safe Storage password`);
      }

      const salt = "saltysalt";
      const derivedKey = await pbkdf2Async(password, salt, iterations, keyLength, "sha1");
      
      logger.info(`Successfully derived key using MacKeyStrategy for ${browserProfile.browser}`);
      return derivedKey;
    } catch (error) {
      logger.error(`MacKeyStrategy failed for ${browserProfile.browser}:`, error);
      throw error;
    }
  }

  /**
   * Securely clear sensitive data from memory
   */
  private secureMemoryClear(sensitiveData: any): void {
    if (typeof sensitiveData === "string") {
      // For strings, create a new string and overwrite the reference
      const length = sensitiveData.length;
      sensitiveData = "\0".repeat(length);
    } else if (Buffer.isBuffer(sensitiveData)) {
      // For buffers, overwrite with zeros
      sensitiveData.fill(0);
    } else if (Array.isArray(sensitiveData)) {
      // For arrays, clear all elements
      for (let i = 0; i < sensitiveData.length; i++) {
        if (typeof sensitiveData[i] === "string") {
          sensitiveData[i] = "\0".repeat(sensitiveData[i].length);
        }
        sensitiveData[i] = null;
      }
      sensitiveData.length = 0;
    }
  }

  /**
   * Enhanced Chrome password decryption following the robust strategy
   */
  private async decryptPassword(
    encryptedPassword: Buffer,
    key: Buffer,
    _browserProfile?: any,
  ): Promise<string> {
    try {
      if (!encryptedPassword || encryptedPassword.length < 3) {
        return "";
      }

      const prefix = encryptedPassword.slice(0, 3).toString();
      logger.debug(`Password encryption version: ${prefix}`);

      if (prefix !== "v10" && prefix !== "v11" && prefix !== "v20") {
        logger.warn(`Unsupported credential encryption format: ${prefix}`);
        return "";
      }

      if (process.platform === "win32") {
        // Windows decryption with AES-256-GCM
        const nonce = encryptedPassword.slice(3, 15);
        const ciphertext = encryptedPassword.slice(15, -16);
        const tag = encryptedPassword.slice(-16);

        const decipher = createDecipheriv("aes-256-gcm", key, nonce);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(ciphertext),
          decipher.final(),
        ]);

        return decrypted.toString("utf8");
      } else {
        // macOS/Linux decryption with AES-128-CBC
        const iv = Buffer.alloc(16, " "); // 16 bytes of spaces
        const decipher = createDecipheriv("aes-128-cbc", key, iv);

        const decrypted = Buffer.concat([
          decipher.update(encryptedPassword.slice(3)),
          decipher.final(),
        ]);

        return decrypted.toString("utf8");
      }
    } catch (error) {
      logger.error("Error decrypting password:", error);
      return "";
    }
  }

  /**
   * Enhanced function to get all passwords from a Chrome profile
   */
  private async getAllPasswords(
    browserProfile: any,
    key: Buffer,
  ): Promise<any[]> {
    logger.info(
      `[DEBUG] Starting getAllPasswords for profile: ${browserProfile.name}`,
    );

    const loginDataPath = path.join(browserProfile.path, "Login Data");
    logger.debug(`[DEBUG] Login data path: ${loginDataPath}`);

    const tempDbPath = path.join(browserProfile.path, "Login Data.temp");

    try {
      logger.debug("[DEBUG] Creating temporary database copy");
      fsSync.copyFileSync(loginDataPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!fsSync.existsSync(tempDbPath)) {
        throw new Error("Temporary database file was not created successfully");
      }
      logger.debug("[DEBUG] Temporary database copy created successfully");
    } catch (error) {
      logger.error("Error copying Login Data file:", error);
      throw error;
    }

    return new Promise((resolve, reject) => {
      logger.debug("[DEBUG] Opening database connection");
      let db: sqlite3.Database | null = null;

      const database = new sqlite3.Database(
        tempDbPath,
        sqlite3.OPEN_READONLY,
        err => {
          if (err) {
            reject(new Error(`Failed to open database: ${err.message}`));
            return;
          }

          db = database;
          logger.debug("[DEBUG] Database connection established successfully");

          // Execute query
          db.all(
            `SELECT origin_url, username_value, password_value, date_created 
           FROM logins`,
            (err, rows: any[]) => {
              if (err) {
                logger.error("[DEBUG] Database query failed:", err);
                reject(err);
                return;
              }

              logger.debug(`[DEBUG] Query results count: ${rows?.length}`);
              logger.debug("[DEBUG] Starting password decryption");

              // Process passwords asynchronously
              const processPasswords = async () => {
                try {
                  const processedLogins = await Promise.all(
                    rows.map(async (row: any) => {
                      const decryptedPassword = await this.decryptPassword(
                        row.password_value,
                        key,
                        browserProfile,
                      );

                      if (decryptedPassword) {
                        logger.debug(
                          `[DEBUG] Successfully decrypted password for: ${row.origin_url}`,
                        );
                      }

                      return {
                        originUrl: row.origin_url,
                        username: row.username_value,
                        password: decryptedPassword,
                        dateCreated: new Date(row.date_created / 1000),
                      };
                    }),
                  );

                  const filteredLogins = processedLogins.filter(
                    login => login.password !== "",
                  );
                  logger.info(
                    `[DEBUG] Finished processing all passwords. Valid passwords: ${filteredLogins.length}`,
                  );
                  resolve(filteredLogins);
                } catch (error) {
                  logger.error("[DEBUG] Error processing passwords:", error);
                  reject(error);
                } finally {
                  // Cleanup
                  if (db) {
                    db.close(err => {
                      if (err) {
                        logger.error("Error closing database:", err);
                      }
                    });
                  }

                  try {
                    logger.debug("[DEBUG] Cleaning up temporary database file");
                    fsSync.unlinkSync(tempDbPath);
                    logger.debug(
                      "[DEBUG] Temporary database file cleaned up successfully",
                    );
                  } catch (error) {
                    logger.error(
                      "Error cleaning up temporary database:",
                      error,
                    );
                  }
                }
              };

              // Start async processing
              processPasswords();
            },
          );
        },
      );
    });
  }

  /**
   * Enhanced function to read Chrome browser profiles
   */
  private readBrowserProfiles(browserPath: string, browserType: string): any[] {
    const browserProfiles: any[] = [];

    try {
      if (!fsSync.existsSync(browserPath)) {
        return browserProfiles;
      }

      const localStatePath = path.join(browserPath, "Local State");
      if (fsSync.existsSync(localStatePath)) {
        const localState = JSON.parse(
          fsSync.readFileSync(localStatePath, "utf8"),
        );
        const profilesInfo = localState.profile?.info_cache || {};

        // Add default profile
        const defaultProfilePath = path.join(browserPath, "Default");
        if (fsSync.existsSync(defaultProfilePath)) {
          browserProfiles.push({
            name: "Default",
            path: defaultProfilePath,
            lastModified: fsSync.statSync(defaultProfilePath).mtime,
            browser: browserType,
          });
        }

        // Add other profiles
        Object.entries(profilesInfo).forEach(
          ([profileDir, info]: [string, any]) => {
            if (profileDir !== "Default") {
              const profilePath = path.join(browserPath, profileDir);
              if (fsSync.existsSync(profilePath)) {
                browserProfiles.push({
                  name: info.name || profileDir,
                  path: profilePath,
                  lastModified: fsSync.statSync(profilePath).mtime,
                  browser: browserType,
                });
              }
            }
          },
        );
      }
    } catch (error) {
      logger.error(`Error reading ${browserType} profiles:`, error);
    }

    return browserProfiles;
  }

  public destroy(): void {
    logger.debug("Destroying DialogManager");

    try {
      // Remove this instance from the static map
      DialogManager.instances.delete(this.parentWindow.id);

      // Close all dialogs first
      this.closeAllDialogs();

      // Cancel any pending operations
      this.pendingOperations.clear();

      // Clean up all loading timeouts
      for (const [dialogType, timeout] of this.loadingTimeouts.entries()) {
        try {
          clearTimeout(timeout);
        } catch (error) {
          logger.error(
            `Error clearing timeout for ${dialogType} during destroy:`,
            error,
          );
        }
      }
      this.loadingTimeouts.clear();

      // Security: Force garbage collection to clear sensitive data
      if (typeof global !== "undefined" && global.gc) {
        global.gc?.();
      }

      // Note: We don't remove IPC handlers here since they're global
      // and might still be needed by other windows. They'll be cleaned up
      // automatically when the app closes.

      // Remove all listeners
      this.removeAllListeners();

      logger.debug("DialogManager destroyed successfully");
    } catch (error) {
      logger.error("Error during DialogManager destruction:", error);
    }
  }
}
