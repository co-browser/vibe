import { app } from "electron";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { createLogger } from "@vibe/shared-types";
import { getProfileService } from "./profile-service";
import { UserDataRecover, getSecureItem } from "../store/desktop-store";

const logger = createLogger("OnboardingService");

export class OnboardingService {
  private hasRunBeforeFile: string;
  private initialized = false;

  constructor() {
    // Create path to the "has run before" file in app support directory
    const appSupportDir = app.getPath("userData");
    this.hasRunBeforeFile = join(appSupportDir, ".has_run_before");
  }

  /**
   * Check if this is the first time the app has been run
   */
  public isFirstRun(): boolean {
    return !existsSync(this.hasRunBeforeFile);
  }

  /**
   * Mark that the app has been run before
   */
  public markAsRunBefore(): void {
    try {
      writeFileSync(this.hasRunBeforeFile, Date.now().toString());
      logger.info("Marked app as having run before");
    } catch (error) {
      logger.error("Failed to mark app as having run before:", error);
    }
  }

  /**
   * Initialize onboarding - check if first run and handle accordingly
   */
  public async initialize(): Promise<{
    isFirstRun: boolean;
    needsOnboarding: boolean;
    profileCreated: boolean;
  }> {
    if (this.initialized) {
      logger.warn("OnboardingService already initialized");
      return {
        isFirstRun: false,
        needsOnboarding: false,
        profileCreated: false,
      };
    }

    const isFirstRun = this.isFirstRun();
    let needsOnboarding = false;
    let profileCreated = false;

    try {
      if (isFirstRun) {
        logger.info("First time running the app - starting onboarding flow");
        needsOnboarding = true;

        // Create initial profile with Touch ID authentication
        const profileService = getProfileService();
        await profileService.initialize();

        // Create a default profile - using the correct interface
        const profile = await profileService.createProfile(
          "Default Profile",
          "",
          {
            theme: "system",
            language: "en",
            defaultSearchEngine: "google",
            autoSavePasswords: true,
            syncBrowsingHistory: true,
            enableAutocomplete: true,
            privacyMode: false,
          },
        );

        if (profile) {
          profileCreated = true;
          logger.info("Default profile created during onboarding");
        }
      } else {
        logger.info(
          "App has been run before - attempting to recover profile data",
        );

        // Try to recover existing profile data
        const recovered = await UserDataRecover();
        if (recovered) {
          const profileId = getSecureItem("profile_id");
          if (profileId) {
            logger.info("Successfully recovered profile data");
            const profileService = getProfileService();
            await profileService.initialize();
          } else {
            logger.warn("No profile ID found in recovered data");
            needsOnboarding = true;
          }
        } else {
          logger.warn(
            "Failed to recover profile data - may need re-onboarding",
          );
          needsOnboarding = true;
        }
      }

      this.initialized = true;
      return { isFirstRun, needsOnboarding, profileCreated };
    } catch (error) {
      logger.error("Error during onboarding initialization:", error);
      needsOnboarding = true;
      return { isFirstRun, needsOnboarding, profileCreated: false };
    }
  }

  /**
   * Complete the onboarding process
   */
  public async completeOnboarding(): Promise<void> {
    try {
      this.markAsRunBefore();
      logger.info("Onboarding completed successfully");
    } catch (error) {
      logger.error("Error completing onboarding:", error);
      throw error;
    }
  }

  /**
   * Get onboarding status
   */
  public getStatus(): { initialized: boolean; hasRunBefore: boolean } {
    return {
      initialized: this.initialized,
      hasRunBefore: !this.isFirstRun(),
    };
  }
}

// Singleton instance
let onboardingServiceInstance: OnboardingService | null = null;

/**
 * Get the singleton OnboardingService instance
 */
export function getOnboardingService(): OnboardingService {
  if (!onboardingServiceInstance) {
    onboardingServiceInstance = new OnboardingService();
  }
  return onboardingServiceInstance;
}
