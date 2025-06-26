import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import { getOnboardingService } from "../../services/onboarding-service";
import { getProfileService } from "../../services/profile-service";
import { importFromChrome, findBrowserProfiles } from "./password-import";

const logger = createLogger("OnboardingIPC");

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
ipcMain.handle("onboarding:complete", async (_event, data: any) => {
  try {
    const profileService = getProfileService();
    const onboardingService = getOnboardingService();
    
    // Prompt for Touch ID to set up secure storage (first time only)
    const { NewUserStore, getSecureItem } = await import("../../store/desktop-store");
    const touchIdInitialized = getSecureItem("touch_id_initialized");
    
    if (!touchIdInitialized) {
      logger.info("First time setup - prompting for Touch ID");
      const touchIdSuccess = await NewUserStore("Authenticate to secure your Vibe passwords");
      
      if (!touchIdSuccess && process.platform === "darwin") {
        logger.warn("Touch ID authentication failed or was cancelled");
        // Continue anyway - we can still use encrypted storage without Touch ID
      }
    }
    
    // Create profile with onboarding data
    const profile = await profileService.createProfile(
      data.profileName,
      data.email,
      {
        theme: data.theme || "system",
        language: "en",
        defaultSearchEngine: "google",
        autoSavePasswords: data.importPasswords !== false,
        syncBrowsingHistory: data.importHistory !== false,
        enableAutocomplete: true,
        privacyMode: data.privacyMode || false,
      },
    );
    
    // The profile creation should have triggered Touch ID when initializing the encrypted store
    logger.info("Profile created with encrypted store");

    // Import Chrome passwords if profile selected
    if (data.selectedChromeProfile && data.importPasswords) {
      logger.info(`Importing passwords from Chrome profile: ${data.selectedChromeProfile}`);
      try {
        // Use the real Chrome password import
        const { migrateChromePasswords } = await import("./password-import");
        const { generateProfileEncryptionKey } = await import("../../persistent");
        
        // Create a browser profile object for the selected Chrome profile
        const browserProfile = {
          name: data.selectedChromeProfile,
          path: data.selectedChromeProfile,
          browser: "chrome"
        };
        
        // Generate encryption key for Chrome password decryption
        const chromeKey = generateProfileEncryptionKey();
        
        // Import passwords into the newly created profile
        const importedCount = await migrateChromePasswords(browserProfile, profile.id, chromeKey);
        logger.info(`Successfully imported ${importedCount} passwords from Chrome`);
      } catch (importError) {
        logger.error("Failed to import Chrome passwords:", importError);
        // Don't fail the whole onboarding if import fails
      }
    }

    // Mark onboarding as complete
    await onboardingService.completeOnboarding();

    logger.info("Onboarding completed successfully");
    return { success: true, profileId: profile.id };
  } catch (error) {
    logger.error("Error completing onboarding:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
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

// Get Chrome profiles for import
ipcMain.handle("onboarding:get-chrome-profiles", async () => {
  try {
    const allProfiles = findBrowserProfiles();
    // Filter to only Chrome profiles
    const chromeProfiles = allProfiles.filter(profile => profile.browser === "chrome");
    logger.info(`Found ${chromeProfiles.length} Chrome profiles`);
    return chromeProfiles;
  } catch (error) {
    logger.error("Error getting Chrome profiles:", error);
    throw error;
  }
});

// Legacy function for backward compatibility (no longer needed)
export function setupOnboardingIPC(): void {
  // Handlers are now registered directly when this module is imported
  logger.info("Onboarding IPC handlers registered");
}
