import { createLogger } from "@vibe/shared-types";
import { getProfileService } from "../profile-service";
import {
  BrowserDetectorService,
  BrowserProfile,
} from "./browser-detector.service";
import { ChromePasswordDecryptorService } from "./chrome-password-decryptor.service";

const logger = createLogger("password-import-service");

export interface PasswordImportProgress {
  browser: string;
  stage: "scanning" | "importing" | "complete";
  message: string;
  passwordCount?: number;
}

export interface PasswordImportResult {
  browser: string;
  success: boolean;
  passwordCount?: number;
  error?: string;
}

export class PasswordImportService {
  /**
   * Import passwords from Chrome/Arc/Brave
   */
  static async importFromChrome(
    profileId: string,
    browserProfile: BrowserProfile,
    onProgress?: (progress: PasswordImportProgress) => void,
  ): Promise<PasswordImportResult> {
    try {
      logger.info(
        `Starting Chrome password import from ${browserProfile.name}`,
      );

      // Progress: Scanning
      onProgress?.({
        browser: browserProfile.browser,
        stage: "scanning",
        message: `Reading password database from ${browserProfile.name}...`,
      });

      // Get all passwords
      const passwords =
        await ChromePasswordDecryptorService.getAllPasswords(browserProfile);

      if (passwords.length === 0) {
        return {
          browser: browserProfile.browser,
          success: true,
          passwordCount: 0,
        };
      }

      // Progress: Importing
      onProgress?.({
        browser: browserProfile.browser,
        stage: "importing",
        message: `Importing ${passwords.length} passwords...`,
        passwordCount: passwords.length,
      });

      // Import to profile
      const profileService = getProfileService();
      const importData = passwords.map(password => ({
        url: password.originUrl,
        username: password.username,
        password: password.password,
        title: new URL(password.originUrl).hostname,
        source: "chrome" as const,
        lastUsed: password.dateCreated,
      }));

      await profileService.importPasswords(profileId, importData);

      // Progress: Complete
      onProgress?.({
        browser: browserProfile.browser,
        stage: "complete",
        message: `Successfully imported ${passwords.length} passwords`,
        passwordCount: passwords.length,
      });

      logger.info(`Successfully imported ${passwords.length} passwords`);
      return {
        browser: browserProfile.browser,
        success: true,
        passwordCount: passwords.length,
      };
    } catch (error) {
      logger.error("Chrome import failed:", error);
      return {
        browser: browserProfile.browser,
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Get available Chrome profiles
   */
  static getChromeProfiles(): BrowserProfile[] {
    return BrowserDetectorService.getChromeProfiles();
  }

  /**
   * Get all browser profiles
   */
  static getAllBrowserProfiles(): BrowserProfile[] {
    return BrowserDetectorService.findBrowserProfiles();
  }

  /**
   * Get password count for a browser profile
   */
  static async getPasswordCount(
    browserProfile: BrowserProfile,
  ): Promise<number> {
    if (["chrome", "arc", "brave"].includes(browserProfile.browser)) {
      return ChromePasswordDecryptorService.getPasswordCount(browserProfile);
    }
    return 0;
  }
}
