import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { shell, ipcMain, BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "../../store/user-profile-store";

const logger = createLogger("downloads");

interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
  exists: boolean;
  status?: "downloading" | "completed" | "cancelled" | "error";
  progress?: number;
  totalBytes?: number;
  receivedBytes?: number;
  startTime?: number;
}

class Downloads {
  private updateTaskbarProgress(progress: number): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(progress);
        logger.debug(
          `Download progress updated to: ${(progress * 100).toFixed(1)}%`,
        );
      }
    } catch (error) {
      logger.warn("Failed to update download progress bar:", error);
    }
  }

  private clearTaskbarProgress(): void {
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(
        win => !win.isDestroyed() && win.webContents,
      );
      if (mainWindow) {
        mainWindow.setProgressBar(-1); // Clear progress bar
        logger.debug("Download progress bar cleared");
      }
    } catch (error) {
      logger.warn("Failed to clear download progress bar:", error);
    }
  }

  private updateTaskbarProgressFromOldestDownload(): void {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) return;

      const downloads = userProfileStore.getDownloadHistory(activeProfile.id);
      const downloadingItems = downloads.filter(
        d => d.status === "downloading",
      );

      if (downloadingItems.length === 0) {
        this.clearTaskbarProgress();
        return;
      }

      // Find the oldest downloading item
      const oldestDownloading = downloadingItems.sort(
        (a, b) => a.createdAt - b.createdAt,
      )[0];

      if (oldestDownloading && oldestDownloading.progress !== undefined) {
        const progress = oldestDownloading.progress / 100; // Convert percentage to 0-1 range
        this.updateTaskbarProgress(progress);
      }
    } catch (error) {
      logger.warn(
        "Failed to update taskbar progress from oldest download:",
        error,
      );
    }
  }

  addDownloadHistoryItem(downloadData: Omit<DownloadItem, "id">) {
    logger.debug(
      "[Download Debug] addDownloadHistoryItem called:",
      downloadData,
    );

    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    logger.debug("[Download Debug] Active profile check:", {
      hasActiveProfile: !!activeProfile,
      profileId: activeProfile?.id,
      profileName: activeProfile?.name,
    });

    if (!activeProfile) {
      logger.error("No active profile found for download history");
      logger.debug("[Download Debug] No active profile - download not tracked");
      return null;
    }

    const item = {
      id: randomUUID(),
      ...downloadData,
    };

    logger.debug("[Download Debug] Adding download to profile:", {
      profileId: activeProfile.id,
      downloadId: item.id,
    });

    // Add to user profile store
    userProfileStore.addDownloadEntry(activeProfile.id, downloadData);

    logger.debug("[Download Debug] Download successfully added to profile");
    return item;
  }

  private setupGlobalDownloadTracking() {
    logger.info("[Download Debug] Setting up global download tracking");

    // Define the download handler
    const downloadHandler = (_event: any, item: any, _webContents: any) => {
      const fileName = item.getFilename();
      const savePath = item.getSavePath();

      logger.debug("[Download Debug] will-download event fired:", {
        fileName,
        savePath,
        totalBytes: item.getTotalBytes(),
        receivedBytes: item.getReceivedBytes(),
      });

      logger.info(`Download started: ${fileName} -> ${savePath}`);

      // Add to download history immediately when download starts
      const downloadEntry = this.addDownloadHistoryItem({
        fileName,
        filePath: savePath,
        createdAt: Date.now(),
        exists: false, // Will be updated when download completes
        status: "downloading",
        progress: 0,
        totalBytes: item.getTotalBytes(),
        receivedBytes: 0,
        startTime: Date.now(),
      });

      // Track when download completes
      item.on("done", (_event, state) => {
        logger.debug("[Download Debug] Download done event:", {
          fileName,
          state,
          savePath,
        });

        if (state === "completed") {
          logger.info(`Download completed: ${fileName}`);

          // Update the existing download entry
          if (downloadEntry) {
            const userProfileStore = useUserProfileStore.getState();
            const activeProfile = userProfileStore.getActiveProfile();

            if (activeProfile) {
              userProfileStore.updateDownloadStatus(
                activeProfile.id,
                downloadEntry.id,
                "completed",
                fs.existsSync(savePath),
              );
            }
          }

          // Update taskbar progress (will clear if no more downloads)
          this.updateTaskbarProgressFromOldestDownload();
        } else {
          logger.warn(`Download ${state}: ${fileName}`);

          // Update the download status to cancelled or error
          if (downloadEntry) {
            const userProfileStore = useUserProfileStore.getState();
            const activeProfile = userProfileStore.getActiveProfile();

            if (activeProfile) {
              const status = state === "cancelled" ? "cancelled" : "error";
              userProfileStore.updateDownloadStatus(
                activeProfile.id,
                downloadEntry.id,
                status,
                false,
              );
            }
          }

          // Update taskbar progress even for failed/cancelled downloads
          this.updateTaskbarProgressFromOldestDownload();
        }
      });

      // Track download progress
      item.on("updated", (_event, state) => {
        if (state === "progressing") {
          if (item.isPaused()) {
            logger.debug(`Download paused: ${fileName}`);
          } else {
            const receivedBytes = item.getReceivedBytes();
            const totalBytes = item.getTotalBytes();
            const progress = Math.round((receivedBytes / totalBytes) * 100);

            logger.debug(`Download progress: ${fileName} - ${progress}%`);

            // Update progress in user profile store if we have the download entry
            if (downloadEntry) {
              const userProfileStore = useUserProfileStore.getState();
              const activeProfile = userProfileStore.getActiveProfile();

              if (activeProfile) {
                userProfileStore.updateDownloadProgress(
                  activeProfile.id,
                  downloadEntry.id,
                  progress,
                  receivedBytes,
                  totalBytes,
                );

                // Update taskbar progress based on oldest downloading item
                this.updateTaskbarProgressFromOldestDownload();
              }
            }
          }
        }
      });
    }; // End of downloadHandler

    // Apply download handler to all existing profile sessions
    const userProfileStore = useUserProfileStore.getState();
    const allSessions = userProfileStore.getAllSessions();

    logger.info(
      `[Download Debug] Applying download handler to ${allSessions.size} existing profile sessions`,
    );

    for (const [profileId, profileSession] of allSessions) {
      profileSession.on("will-download", downloadHandler);
      logger.debug(
        `[Download Debug] Applied download handler to profile ${profileId}`,
      );
    }

    // Register callback for new sessions
    userProfileStore.onSessionCreated((profileId, profileSession) => {
      profileSession.on("will-download", downloadHandler);
      logger.info(
        `[Download Debug] Applied download handler to new profile session ${profileId}`,
      );
    });

    logger.info(
      "[Download Debug] Global download tracking setup complete via UserProfileStore",
    );
  }

  init() {
    logger.info("[Download Debug] Downloads service init() called");

    // Set up global download tracking
    this.setupGlobalDownloadTracking();

    logger.info("Downloads service initialized with global download tracking");

    // Handle download history requests
    ipcMain.handle("downloads.getHistory", () => {
      logger.debug("[Download Debug] downloads.getHistory IPC handler called");

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      logger.debug("[Download Debug] IPC handler - Active profile check:", {
        hasActiveProfile: !!activeProfile,
        profileId: activeProfile?.id,
        profileName: activeProfile?.name,
        isStoreReady: userProfileStore.isStoreReady(),
      });

      if (!activeProfile) {
        logger.error("No active profile found for download history");
        logger.debug(
          "[Download Debug] IPC handler - No active profile, returning empty array",
        );
        return [];
      }

      const history = userProfileStore.getDownloadHistory(activeProfile.id);
      logger.debug("[Download Debug] IPC handler - Returning history:", {
        profileId: activeProfile.id,
        historyLength: history.length,
        historyItems: history.map(item => ({
          id: item.id,
          fileName: item.fileName,
          status: item.status,
          progress: item.progress,
        })),
      });

      return history;
    });

    ipcMain.handle("downloads.openFile", async (_event, filePath) => {
      try {
        const error = await shell.openPath(filePath);
        return {
          error: error
            ? fs.existsSync(filePath)
              ? error
              : "File does not exist"
            : null,
        };
      } catch (error) {
        logger.error("Error opening file:", error);
        return { error: "Failed to open file" };
      }
    });

    ipcMain.handle("downloads.showFileInFolder", (_event, filePath) => {
      try {
        if (!fs.existsSync(filePath)) {
          return {
            error: "File does not exist",
          };
        }

        shell.showItemInFolder(filePath);
        return { error: null };
      } catch (error) {
        logger.error("Error showing file in folder:", error);
        return { error: "Failed to show file in folder" };
      }
    });

    ipcMain.handle("downloads.removeFromHistory", (_event, itemId) => {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        logger.error("No active profile found for download history");
        return { success: false, error: "No active profile" };
      }

      userProfileStore.removeDownloadEntry(activeProfile.id, itemId);
      return { success: true };
    });

    ipcMain.handle("downloads.clearHistory", () => {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        logger.error("No active profile found for download history");
        return { success: false, error: "No active profile" };
      }

      userProfileStore.clearDownloadHistory(activeProfile.id);
      return { success: true };
    });

    logger.info("[Download Debug] Downloads service init() completed");
  }
}

export const downloads = new Downloads();
