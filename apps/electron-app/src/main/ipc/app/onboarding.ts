import { ipcMain } from "electron";
import { completeStoreInitialization } from "@/store/desktop-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("onboarding");

/**
 * Onboarding completion handler
 * Called when the user completes the first step of onboarding
 */
ipcMain.handle("onboarding:complete-first-step", async () => {
  try {
    logger.info("Completing first onboarding step, initializing store");
    const result = await completeStoreInitialization();
    return { success: result };
  } catch (error) {
    logger.error("Failed to complete onboarding step:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
});
