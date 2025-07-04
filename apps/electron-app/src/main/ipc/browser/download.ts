import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { shell, ipcMain } from "electron";
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

  init() {
    // Download handling will be implemented later
    logger.info(
      "Downloads service initialized - download handling not yet implemented",
    );

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
