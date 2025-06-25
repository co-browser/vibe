import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import { getOnboardingService } from "../../services/onboarding-service";
import { getProfileService } from "../../services/profile-service";
import { importFromChrome } from "./password-import";

const logger = createLogger("OnboardingIPC");

export function setupOnboardingIPC(): void {
  // Initialize onboarding and check if it's needed
  ipcMain.handle("onboarding:initialize", async () => {
    try {
      const onboardingService = getOnboardingService();
      const result = await onboardingService.initialize();

      logger.info("Onboarding initialization result:", result);
      return result;
    } catch (error) {
      logger.error("Error initializing onboarding:", error);
      throw error;
    }
  });

  // Start Chrome password import
  ipcMain.handle("onboarding:import-chrome-passwords", async event => {
    try {
      logger.info("Starting Chrome password import for onboarding");

      // Use the existing password import functionality
      const result = await importFromChrome(event.sender);

      logger.info("Chrome password import completed:", result);
      return result;
    } catch (error) {
      logger.error("Error importing Chrome passwords:", error);
      throw error;
    }
  });

  // Complete onboarding process
  ipcMain.handle("onboarding:complete", async () => {
    try {
      const onboardingService = getOnboardingService();
      await onboardingService.completeOnboarding();

      logger.info("Onboarding completed successfully");
      return { success: true };
    } catch (error) {
      logger.error("Error completing onboarding:", error);
      throw error;
    }
  });

  // Get onboarding status
  ipcMain.handle("onboarding:get-status", () => {
    try {
      const onboardingService = getOnboardingService();
      return onboardingService.getStatus();
    } catch (error) {
      logger.error("Error getting onboarding status:", error);
      throw error;
    }
  });

  // Get current profile information
  ipcMain.handle("onboarding:get-profile", () => {
    try {
      const profileService = getProfileService();
      const profile = profileService.getCurrentProfile();
      return profile;
    } catch (error) {
      logger.error("Error getting profile:", error);
      throw error;
    }
  });

  // Update profile during onboarding
  ipcMain.handle("onboarding:update-profile", async (_, updates: any) => {
    try {
      const profileService = getProfileService();
      const currentProfile = profileService.getCurrentProfile();

      if (!currentProfile) {
        throw new Error("No current profile available");
      }

      const updatedProfile = await profileService.updateProfile(
        currentProfile.id,
        updates,
      );
      return updatedProfile;
    } catch (error) {
      logger.error("Error updating profile:", error);
      throw error;
    }
  });
}
