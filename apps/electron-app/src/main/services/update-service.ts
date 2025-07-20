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
      // Validate update info when received
      if (!this.isValidUpdateInfo(releaseInfo)) {
        logger.error("Received invalid update info");
      }
    });

    autoUpdater.on("update-not-available", () => {
      logger.info("No updates available");
    });

    autoUpdater.on("download-progress", progress => {
      logger.debug("Download progress:", progress);
    });

    autoUpdater.on("update-downloaded", (releaseInfo: UpdateInfo) => {
      // Validate before storing
      if (this.isValidUpdateInfo(releaseInfo)) {
        this.releaseInfo = releaseInfo;
        logger.info("update downloaded:", releaseInfo);
      } else {
        logger.error("Downloaded update has invalid info, refusing to store");
      }
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
   * Validates update info structure
   * @param info The update info to validate
   * @returns True if valid, false otherwise
   */
  private isValidUpdateInfo(info: UpdateInfo | undefined): boolean {
    if (!info) return false;

    // Check required fields
    if (!info.version || typeof info.version !== "string") {
      logger.error("Invalid update info: missing or invalid version");
      return false;
    }

    // Validate version format (basic semver check)
    const semverRegex = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?(\+[a-zA-Z0-9.-]+)?$/;
    if (!semverRegex.test(info.version)) {
      logger.error(
        `Invalid update info: invalid version format ${info.version}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Show update dialog to the user
   * @param mainWindow The window to show the dialog on
   */
  public async showUpdateDialog(mainWindow: BrowserWindow) {
    if (!this.releaseInfo) {
      logger.warn("No release info available for update dialog");
      return;
    }

    // Validate update info before processing
    if (!this.isValidUpdateInfo(this.releaseInfo)) {
      logger.error("Invalid update info, refusing to show dialog");
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
      .then(async ({ response }) => {
        if (response === 1) {
          logger.info("User clicked install, starting update installation...");

          // Set flag to indicate we're installing an update
          app.isQuitting = true;

          // The app's before-quit handler will trigger gracefulShutdown
          // which properly cleans up all resources. After that completes,
          // we'll install the update.

          // Store reference to quitAndInstall to be called after shutdown
          const performUpdate = () => {
            logger.info("Graceful shutdown complete, installing update...");
            autoUpdater.quitAndInstall(false, true);
          };

          // Listen for app ready to quit after graceful shutdown
          app.once("will-quit", event => {
            event.preventDefault();
            // Small delay to ensure all cleanup is complete
            setTimeout(performUpdate, 100);
          });

          // Trigger the shutdown sequence
          app.quit();
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
