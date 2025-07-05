import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { shell, ipcMain, session } from "electron";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "../../store/user-profile-store";

const logger = createLogger("downloads");

interface DownloadItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
  exists: boolean;
}

class Downloads {
  addDownloadHistoryItem({
    fileName,
    filePath,
    createdAt,
    exists,
  }: Omit<DownloadItem, "id">) {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      logger.error("No active profile found for download history");
      return null;
    }

    const item = {
      id: randomUUID(),
      fileName,
      filePath,
      createdAt,
      exists,
    };

    // Add to user profile store
    userProfileStore.addDownloadEntry(activeProfile.id, {
      fileName,
      filePath,
      createdAt,
    });

    return item;
  }

  private setupGlobalDownloadTracking() {
    // Listen for downloads in the default session
    session.defaultSession.on("will-download", (_event, item, _webContents) => {
      const fileName = item.getFilename();
      const savePath = item.getSavePath();

      logger.info(`Download started: ${fileName} -> ${savePath}`);

      // Track when download completes
      item.on("done", (_event, state) => {
        if (state === "completed") {
          logger.info(`Download completed: ${fileName}`);

          // Add to download history
          this.addDownloadHistoryItem({
            fileName,
            filePath: savePath,
            createdAt: Date.now(),
            exists: fs.existsSync(savePath),
          });
        } else {
          logger.warn(`Download ${state}: ${fileName}`);
        }
      });

      // Track download progress (optional)
      item.on("updated", (_event, state) => {
        if (state === "progressing") {
          if (item.isPaused()) {
            logger.debug(`Download paused: ${fileName}`);
          } else {
            const progress = Math.round(
              (item.getReceivedBytes() / item.getTotalBytes()) * 100,
            );
            logger.debug(`Download progress: ${fileName} - ${progress}%`);
          }
        }
      });
    });
  }

  init() {
    // Set up global download tracking
    this.setupGlobalDownloadTracking();

    logger.info("Downloads service initialized with global download tracking");

    // Handle download history requests
    ipcMain.handle("downloads.getHistory", () => {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        logger.error("No active profile found for download history");
        return [];
      }

      return userProfileStore.getDownloadHistory(activeProfile.id);
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

    logger.info("Downloads service initialized");
  }
}

export const downloads = new Downloads();
