import { ipcMain } from "electron";
import { getStorageService } from "@/store/storage-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("onboarding");

/**
 * Onboarding completion handler
 * Called when the user completes the first step of onboarding
 */
ipcMain.handle("onboarding:complete-first-step", async () => {
  try {
    logger.info("Completing first onboarding step");
    // Storage is auto-initialized, just mark as no longer first launch
    const storage = getStorageService();
    storage.set("_initialized", true);
    storage.set("_firstLaunchComplete", true);
    return { success: true };
  } catch (error) {
    logger.error("Failed to complete onboarding step:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
});
