import { UPDATER, createLogger } from "@vibe/shared-types";
import { app, BrowserWindow, dialog } from "electron";
import { AppUpdater as _AppUpdater, autoUpdater } from "electron-updater";
import type { UpdateInfo } from "builder-util-runtime";

import icon from "../../../resources/icon.png?asset";

const logger = createLogger("AppUpdater");

/**
 * Singleton AppUpdater service for managing application updates
 */
export default class AppUpdater {
  private static instance: AppUpdater | null = null;
  autoUpdater: _AppUpdater = autoUpdater;
  private releaseInfo: UpdateInfo | undefined;
  private initialized = false;
  private isChecking = false;

  constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get or create the singleton instance
   */
  static getInstance(): AppUpdater {
    if (!AppUpdater.instance) {
      AppUpdater.instance = new AppUpdater();
    }
    return AppUpdater.instance;
  }

  /**
   * Initialize the updater (should be called once when app is ready)
   * Sets up event listeners and configuration for auto-updater
   */
  initialize(): void {
    if (this.initialized) {
      logger.warn("AppUpdater already initialized");
      return;
    }

    autoUpdater.logger = logger;
    autoUpdater.forceDevUpdateConfig = !app.isPackaged;
    autoUpdater.autoDownload = UPDATER.AUTOUPDATE;
    autoUpdater.autoInstallOnAppQuit = UPDATER.AUTOUPDATE;

    autoUpdater.on("error", error => {
      logger.error("autoupdate", {
        message: error.message,
        stack: error.stack,
        time: new Date().toISOString(),
      });
    });

    autoUpdater.on("update-available", (releaseInfo: UpdateInfo) => {
      logger.info("update ready:", releaseInfo);
    });

    autoUpdater.on("update-not-available", () => {
      logger.info("No updates available");
    });

    autoUpdater.on("download-progress", progress => {
      logger.debug("Download progress:", progress);
    });

    autoUpdater.on("update-downloaded", (releaseInfo: UpdateInfo) => {
      this.releaseInfo = releaseInfo;
      logger.info("update downloaded:", releaseInfo);
    });

    this.autoUpdater = autoUpdater;
    this.initialized = true;
  }

  /**
   * Enable or disable automatic updates
   * @param isActive Whether to enable auto-download and auto-install
   */
  public setAutoUpdate(isActive: boolean) {
    autoUpdater.autoDownload = isActive;
    autoUpdater.autoInstallOnAppQuit = isActive;
  }

  /**
   * Check for application updates
   * Prevents concurrent update checks to avoid race conditions
   */
  public async checkForUpdates() {
    // Prevent concurrent update checks
    if (this.isChecking) {
      logger.info("Update check already in progress, skipping");
      return {
        currentVersion: app.getVersion(),
        updateInfo: null,
      };
    }

    this.isChecking = true;

    try {
      const update = await this.autoUpdater.checkForUpdates();
      if (update?.isUpdateAvailable && !this.autoUpdater.autoDownload) {
        this.autoUpdater.downloadUpdate();
      }

      return {
        currentVersion: this.autoUpdater.currentVersion,
        updateInfo: update?.updateInfo,
      };
    } catch (error) {
      logger.error("Failed to check for update:", error);
      return {
        currentVersion: app.getVersion(),
        updateInfo: null,
      };
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Show update dialog to the user
   * @param mainWindow The window to show the dialog on
   */
  public async showUpdateDialog(mainWindow: BrowserWindow) {
    if (!this.releaseInfo) {
      return;
    }

    let detail = this.formatReleaseNotes(this.releaseInfo.releaseNotes);
    if (detail === "") {
      detail = "No Release Notes";
    }

    dialog
      .showMessageBox({
        type: "info",
        title: "Update",
        icon,
        message: this.releaseInfo.version,
        detail,
        buttons: ["later", "install"],
        defaultId: 1,
        cancelId: 0,
      })
      .then(({ response }) => {
        if (response === 1) {
          app.isQuitting = true;
          logger.info("User clicked install, starting update installation...");

          // Close all windows first
          // Note: Data persistence is handled by the app's gracefulShutdown mechanism
          BrowserWindow.getAllWindows().forEach(win => {
            try {
              win.close();
            } catch (e) {
              logger.error("Error closing window:", e);
            }
          });

          // Add delay to ensure windows are closed
          setTimeout(() => {
            logger.info("Calling quitAndInstall...");
            autoUpdater.quitAndInstall(false, true);
          }, 100);
        } else {
          mainWindow.webContents.send("update-downloaded-cancelled");
        }
      });
  }

  private formatReleaseNotes(
    releaseNotes: string | ReleaseNoteInfo[] | null | undefined,
  ): string {
    if (!releaseNotes) {
      return "";
    }

    let notes = "";
    if (typeof releaseNotes === "string") {
      notes = releaseNotes;
    } else {
      notes = releaseNotes.map(note => note.note || "").join("\n");
    }

    // Strip HTML tags and format for native dialog
    return (
      notes
        // Remove HTML tags
        .replace(/<[^>]*>/g, "")
        // Convert HTML entities
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, " ")
        // Format lists
        .replace(/^[\s]*[-*•]\s*/gm, "• ")
        // Remove excessive whitespace
        .replace(/\s+/g, " ")
        .replace(/\n\s*\n/g, "\n\n")
        .trim()
    );
  }
}

interface ReleaseNoteInfo {
  readonly version: string;
  readonly note: string | null;
}
