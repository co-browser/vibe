import { autoUpdater, UpdateInfo, ProgressInfo } from "electron-updater";
import { BrowserWindow, ipcMain, dialog } from "electron";
import { UpdateScheduler } from "./update-scheduler";
import { ActivityDetector } from "./activity-detector";
import { UpdateNotifier } from "./update-notifier";
import { UpdateRollback } from "./update-rollback";

export interface UpdateProgress {
  percent: number;
  speed?: number;
  transferred: number;
  total: number;
}

export interface ReleaseNotes {
  version: string;
  notes: string;
  assets?: Array<{
    name: string;
    download_count: number;
    size: number;
  }>;
  published_at: string;
  author: string;
  html_url: string;
}

export class UpdateService {
  private scheduler: UpdateScheduler;
  private activityDetector: ActivityDetector;
  private notifier: UpdateNotifier;
  private rollback: UpdateRollback;
  private isUpdateAvailable = false;
  private updateInfo: UpdateInfo | null = null;
  private _isDownloading = false;
  private _releaseNotes: ReleaseNotes | null = null;

  public get isDownloading(): boolean {
    return this._isDownloading;
  }

  private set isDownloading(value: boolean) {
    this._isDownloading = value;
  }

  public get releaseNotes(): ReleaseNotes | null {
    return this._releaseNotes;
  }

  private set releaseNotes(value: ReleaseNotes | null) {
    this._releaseNotes = value;
  }

  constructor() {
    this.scheduler = new UpdateScheduler();
    this.activityDetector = new ActivityDetector();
    this.notifier = new UpdateNotifier();
    this.rollback = new UpdateRollback();

    this.setupAutoUpdater();
    this.setupIpcHandlers();
    this.startPeriodicChecks();
  }

  private setupAutoUpdater(): void {
    // Configure autoUpdater
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = console;

    // Event handlers
    autoUpdater.on("checking-for-update", () => {
      console.log("Checking for updates...");
      this.sendToRenderer("update-checking");
    });

    autoUpdater.on("update-available", (info: UpdateInfo) => {
      console.log("Update available:", info.version);
      this.isUpdateAvailable = true;
      this.updateInfo = info;
      this.sendToRenderer("update-available", info);
      this.fetchReleaseNotes(info.version);
    });

    autoUpdater.on("update-not-available", () => {
      console.log("No updates available");
      this.sendToRenderer("update-not-available");
    });

    autoUpdater.on("error", err => {
      console.error("Update error:", err);
      this.sendToRenderer("update-error", err.message);
      this.clearProgressBar();
    });

    autoUpdater.on("download-progress", (progress: ProgressInfo) => {
      console.log("Download progress:", progress.percent);
      this.updateProgressBar(progress.percent / 100);
      this.sendToRenderer("update-progress", progress);
    });

    autoUpdater.on("update-downloaded", () => {
      console.log("Update downloaded");
      this.isDownloading = false;
      this.clearProgressBar();
      this.sendToRenderer("update-downloaded");
      this.showUpdateReadyDialog();
    });
  }

  private setupIpcHandlers(): void {
    ipcMain.handle("check-for-updates", async () => {
      try {
        await autoUpdater.checkForUpdates();
        return { success: true };
      } catch (error) {
        console.error("Failed to check for updates:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("download-update", async () => {
      if (!this.isUpdateAvailable) {
        return { success: false, error: "No update available" };
      }

      try {
        this.isDownloading = true;
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        this.isDownloading = false;
        console.error("Failed to download update:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("install-update", () => {
      autoUpdater.quitAndInstall();
    });

    ipcMain.handle("schedule-update", async (_event, time: string) => {
      try {
        await this.scheduler.scheduleUpdate(time);
        return { success: true };
      } catch (error) {
        console.error("Failed to schedule update:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("get-scheduled-updates", async () => {
      try {
        return await this.scheduler.getScheduledUpdates();
      } catch (error) {
        console.error("Failed to get scheduled updates:", error);
        return [];
      }
    });

    ipcMain.handle("cancel-scheduled-update", async (_event, id: string) => {
      try {
        await this.scheduler.cancelUpdate(id);
        return { success: true };
      } catch (error) {
        console.error("Failed to cancel scheduled update:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    ipcMain.handle("get-suggested-update-times", async () => {
      try {
        const activity = await this.activityDetector.getActivityPattern();
        return this.activityDetector.getSuggestedUpdateTimes(activity);
      } catch (error) {
        console.error("Failed to get suggested update times:", error);
        return [];
      }
    });

    ipcMain.handle("get-rollback-versions", async () => {
      try {
        return await this.rollback.getAvailableVersions();
      } catch (error) {
        console.error("Failed to get rollback versions:", error);
        return [];
      }
    });

    ipcMain.handle("rollback-to-version", async (_event, version: string) => {
      try {
        await this.rollback.rollbackToVersion(version);
        return { success: true };
      } catch (error) {
        console.error("Failed to rollback:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });
  }

  private async fetchReleaseNotes(version: string): Promise<void> {
    try {
      // Try to fetch from GitHub API first
      const response = await fetch(
        `https://api.github.com/repos/your-org/your-repo/releases/tags/v${version}`,
      );
      if (response.ok) {
        const release = await response.json();
        this.releaseNotes = {
          version: release.tag_name,
          notes: release.body || "No release notes available",
          assets: release.assets?.map((asset: any) => ({
            name: asset.name,
            download_count: asset.download_count,
            size: asset.size,
          })),
          published_at: release.published_at,
          author: release.author?.login || "Unknown",
          html_url: release.html_url,
        };
      }
    } catch (error) {
      console.error("Failed to fetch release notes from GitHub:", error);

      // Fallback to electron-updater release notes
      if (this.updateInfo?.releaseNotes) {
        const notes = Array.isArray(this.updateInfo.releaseNotes)
          ? this.updateInfo.releaseNotes.map(note => note.note).join("\n")
          : this.updateInfo.releaseNotes;

        this.releaseNotes = {
          version: this.updateInfo.version,
          notes: notes || "No release notes available",
          published_at: new Date().toISOString(),
          author: "Unknown",
          html_url: "",
        };
      }
    }
  }

  private async showUpdateReadyDialog(): Promise<void> {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) return;

    const result = await dialog.showMessageBox(focusedWindow, {
      type: "info",
      title: "Update Ready",
      message: "A new version is ready to install",
      detail: `Version ${this.updateInfo?.version} has been downloaded and is ready to install. The app will restart to complete the installation.`,
      buttons: ["Install Now", "Install Later", "Let the Agent decide"],
      defaultId: 0,
      cancelId: 1,
    });

    switch (result.response) {
      case 0: // Install Now
        autoUpdater.quitAndInstall();
        break;
      case 1: // Install Later
        // Do nothing, user will be reminded later
        break;
      case 2: // Let the Agent decide
        await this.scheduleUpdateForInactiveTime();
        break;
    }
  }

  private async scheduleUpdateForInactiveTime(): Promise<void> {
    try {
      const activity = await this.activityDetector.getActivityPattern();
      const suggestedTimes =
        this.activityDetector.getSuggestedUpdateTimes(activity);

      if (suggestedTimes.length > 0) {
        const bestTime = suggestedTimes[0];
        await this.scheduler.scheduleUpdate(bestTime.time);

        const focusedWindow = BrowserWindow.getFocusedWindow();
        if (focusedWindow) {
          dialog.showMessageBox(focusedWindow, {
            type: "info",
            title: "Update Scheduled",
            message: "Update scheduled for optimal time",
            detail: `The update has been scheduled for ${bestTime.time} when you're likely to be inactive.`,
            buttons: ["OK"],
          });
        }
      }
    } catch (error) {
      console.error("Failed to schedule update:", error);
    }
  }

  private updateProgressBar(progress: number): void {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.setProgressBar(progress);
    }
  }

  private clearProgressBar(): void {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow) {
      focusedWindow.setProgressBar(-1);
    }
  }

  private sendToRenderer(channel: string, data?: any): void {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && !focusedWindow.webContents.isDestroyed()) {
      focusedWindow.webContents.send(`update:${channel}`, data);
    }
  }

  private startPeriodicChecks(): void {
    // Check for updates every 4 hours
    setInterval(
      async () => {
        try {
          await autoUpdater.checkForUpdates();
        } catch (error) {
          console.error("Periodic update check failed:", error);
        }
      },
      4 * 60 * 60 * 1000,
    );

    // Check scheduled updates every minute
    setInterval(async () => {
      try {
        const scheduledUpdates = await this.scheduler.getScheduledUpdates();
        const now = new Date();

        for (const scheduledUpdate of scheduledUpdates) {
          const scheduledTime = new Date(scheduledUpdate.scheduledTime);
          if (scheduledTime <= now) {
            await this.handleScheduledUpdate(scheduledUpdate);
          }
        }
      } catch (error) {
        console.error("Scheduled update check failed:", error);
      }
    }, 60 * 1000);
  }

  private async handleScheduledUpdate(scheduledUpdate: any): Promise<void> {
    try {
      // Check if user is inactive
      const isInactive = await this.activityDetector.isUserInactive();

      if (isInactive) {
        // User is inactive, proceed with update
        if (this.isUpdateAvailable) {
          await autoUpdater.downloadUpdate();
        }
      } else {
        // User is active, reschedule for later
        const newTime = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes later
        await this.scheduler.scheduleUpdate(newTime.toISOString());
      }

      // Remove the original scheduled update
      await this.scheduler.cancelUpdate(scheduledUpdate.id);
    } catch (error) {
      console.error("Failed to handle scheduled update:", error);
    }
  }

  public async initialize(): Promise<void> {
    try {
      await this.scheduler.initialize();
      await this.activityDetector.initialize();
      await this.notifier.initialize();
      await this.rollback.initialize();

      console.log("UpdateService initialized successfully");
    } catch (error) {
      console.error("Failed to initialize UpdateService:", error);
      throw error;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      await this.scheduler.cleanup();
      await this.activityDetector.cleanup();
      await this.notifier.cleanup();
      await this.rollback.cleanup();

      console.log("UpdateService cleaned up successfully");
    } catch (error) {
      console.error("Failed to cleanup UpdateService:", error);
    }
  }
}
