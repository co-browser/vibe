import { app } from "electron";
import { join } from "path";
import { existsSync, writeFileSync } from "fs";
import { createLogger } from "@vibe/shared-types";
import { getProfileService } from "./profile-service";

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
    // Check for DEMO_MODE environment variable
    if (process.env.DEMO_MODE === "true") {
      logger.info("DEMO_MODE enabled - treating as first run");
      return true;
    }
    return !existsSync(this.hasRunBeforeFile);
  }

  /**
   * Mark that the app has been run before
   */
  public markAsRunBefore(): void {
    // Skip marking if in DEMO_MODE
    if (process.env.DEMO_MODE === "true") {
      logger.info("DEMO_MODE enabled - skipping mark as run before");
      return;
    }

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
  }> {
    if (this.initialized) {
      logger.warn("OnboardingService already initialized");
      return {
        isFirstRun: false,
        needsOnboarding: false,
      };
    }

    const isFirstRun = this.isFirstRun();
    let needsOnboarding = false;

    // Log DEMO_MODE status
    if (process.env.DEMO_MODE === "true") {
      logger.info("DEMO_MODE is enabled - app will always run as first-time");
    }

    try {
      if (isFirstRun) {
        logger.info("First time running the app - onboarding needed");
        needsOnboarding = true;
      } else {
        logger.info("App has been run before - checking profile status");

        // Check if we have a valid profile
        const profileService = getProfileService();
        await profileService.initialize();

        const currentProfile = profileService.getCurrentProfile();
        if (!currentProfile) {
          logger.warn("No current profile found - onboarding needed");
          needsOnboarding = true;
        }
      }

      this.initialized = true;
      return { isFirstRun, needsOnboarding };
    } catch (error) {
      logger.error("Error during onboarding initialization:", error);
      needsOnboarding = true;
      return { isFirstRun, needsOnboarding };
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
  public getStatus(): {
    initialized: boolean;
    hasRunBefore: boolean;
    demoMode: boolean;
  } {
    return {
      initialized: this.initialized,
      hasRunBefore: !this.isFirstRun(),
      demoMode: process.env.DEMO_MODE === "true",
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
