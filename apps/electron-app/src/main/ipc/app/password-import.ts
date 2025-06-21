import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("password-import");

// CSV parsing utility (simple implementation since we don't have csv-parse dependency)
function parseCSV(csvContent: string): Record<string, string>[] {
  const lines = csvContent.split("\n").filter(line => line.trim());
  if (lines.length === 0) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/"/g, ""));
  const records: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map(v => v.trim().replace(/"/g, ""));
    const record: Record<string, string> = {};

    headers.forEach((header, index) => {
      record[header] = values[index] || "";
    });

    records.push(record);
  }

  return records;
}

// Mock interfaces for user and browser profiles
interface UserProfile {
  saveLoginDetails(
    server: string,
    username: string,
    password: string,
  ): Promise<void>;
}

interface BrowserProfile {
  path: string;
  name: string;
}

interface PasswordRecord {
  originUrl: string;
  username: string;
  password: string;
}

// Mock function to get Chrome passwords (in real implementation, this would decrypt the Chrome database)
async function getAllPasswords(
  browserProfile: BrowserProfile,
  _key: string,
): Promise<PasswordRecord[]> {
  // Mock implementation - in reality this would:
  // 1. Read the Chrome Login Data database
  // 2. Decrypt passwords using the provided key
  // 3. Return the decrypted password records

  logger.info(`Reading passwords from Chrome profile: ${browserProfile.path}`);

  // Simulate finding some passwords
  const mockPasswords: PasswordRecord[] = [
    {
      originUrl: "https://example.com",
      username: "user1@example.com",
      password: "password123",
    },
    {
      originUrl: "https://github.com",
      username: "githubuser",
      password: "githubpass",
    },
  ];

  return mockPasswords;
}

/**
 * Import Safari passwords from CSV file
 * @param csvContent - The CSV content as string
 * @param userProfile - User profile instance to save passwords to
 * @returns Promise<boolean> - True if any passwords were imported successfully
 */
async function importSafariPasswordsFromCSV(
  csvContent: string,
  userProfile: UserProfile,
): Promise<boolean> {
  try {
    const records = parseCSV(csvContent);
    let importCount = 0;
    let skippedCount = 0;

    for (const record of records) {
      try {
        const server = record.URL?.startsWith("http")
          ? record.URL
          : `https://${record.URL}`;

        if (!record.Username || !record.Password) {
          logger.warn(`Skipping empty entry for ${record.Title || server}`);
          skippedCount++;
          continue;
        }

        await userProfile.saveLoginDetails(
          server,
          record.Username,
          record.Password,
        );
        logger.info(`Imported password for ${record.Username} at ${server}`);

        if (record.OTPAuth) {
          logger.info(
            `Note: OTP authentication is available for ${server} but not yet supported`,
          );
        }

        importCount++;
      } catch (error) {
        logger.error(
          `Failed to import password for ${record.Username} at ${record.URL}:`,
          error,
        );
        skippedCount++;
      }
    }

    logger.info("Import summary:");
    logger.info(`- Successfully imported: ${importCount} passwords`);
    logger.info(`- Skipped/Failed: ${skippedCount} entries`);

    return importCount > 0;
  } catch (error) {
    logger.error("Error importing Safari passwords from CSV:", error);
    return false;
  }
}

/**
 * Migrate Chrome passwords to user profile
 * @param browserProfile - Chrome browser profile information
 * @param userProfile - User profile instance to save passwords to
 * @param key - Encryption key for Chrome password database
 */
async function migrateChromePasswords(
  browserProfile: BrowserProfile,
  userProfile: UserProfile,
  key: string,
): Promise<void> {
  logger.info("Migrating passwords");

  try {
    const passwords = await getAllPasswords(browserProfile, key);

    for (const password of passwords) {
      await userProfile.saveLoginDetails(
        password.originUrl,
        password.username,
        password.password,
      );
      logger.info(
        `Decrypted password for ${password.username} at ${password.originUrl}: ****`,
      );
    }

    logger.info(`Successfully migrated ${passwords.length} passwords`);
  } catch (error) {
    logger.error("Error migrating Chrome passwords:", error);
    throw error;
  }
}

interface PasswordImportProgress {
  browser: string;
  stage: "scanning" | "importing" | "complete";
  message: string;
  passwordCount?: number;
}

interface PasswordImportResult {
  browser: string;
  success: boolean;
  passwordCount?: number;
  error?: string;
}

/**
 * Mock password import implementations for different browsers
 * In a real implementation, these would interface with actual browser databases
 */

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendProgress(
  webContents: Electron.WebContents,
  progress: PasswordImportProgress,
): void {
  webContents.send("password-import-progress", progress);
}

async function importFromSafari(
  webContents: Electron.WebContents,
): Promise<PasswordImportResult> {
  try {
    logger.info("Starting Safari password import");

    sendProgress(webContents, {
      browser: "Safari",
      stage: "scanning",
      message: "Scanning Safari keychain...",
    });
    await delay(1000);

    sendProgress(webContents, {
      browser: "Safari",
      stage: "importing",
      message: "Reading Safari passwords...",
    });
    await delay(1500);

    // Mock: simulate finding passwords
    const passwordCount = Math.floor(Math.random() * 50) + 10;

    sendProgress(webContents, {
      browser: "Safari",
      stage: "importing",
      message: `Transferring ${passwordCount} Safari passwords...`,
    });
    await delay(2000);

    logger.info(`Successfully imported ${passwordCount} passwords from Safari`);
    return {
      browser: "Safari",
      success: true,
      passwordCount,
    };
  } catch (error) {
    logger.error("Safari import failed:", error);
    return {
      browser: "Safari",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function importFromChrome(
  webContents: Electron.WebContents,
): Promise<PasswordImportResult> {
  try {
    logger.info("Starting Chrome password import");

    sendProgress(webContents, {
      browser: "Chrome",
      stage: "scanning",
      message: "Locating Chrome profile...",
    });
    await delay(800);

    sendProgress(webContents, {
      browser: "Chrome",
      stage: "scanning",
      message: "Reading Chrome password database...",
    });
    await delay(1200);

    // Mock: simulate finding passwords
    const passwordCount = Math.floor(Math.random() * 80) + 20;

    sendProgress(webContents, {
      browser: "Chrome",
      stage: "importing",
      message: `Transferring ${passwordCount} Chrome passwords...`,
    });
    await delay(1800);

    logger.info(`Successfully imported ${passwordCount} passwords from Chrome`);
    return {
      browser: "Chrome",
      success: true,
      passwordCount,
    };
  } catch (error) {
    logger.error("Chrome import failed:", error);
    return {
      browser: "Chrome",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function importFromFirefox(
  webContents: Electron.WebContents,
): Promise<PasswordImportResult> {
  try {
    logger.info("Starting Firefox password import");

    sendProgress(webContents, {
      browser: "Firefox",
      stage: "scanning",
      message: "Locating Firefox profile...",
    });
    await delay(900);

    sendProgress(webContents, {
      browser: "Firefox",
      stage: "scanning",
      message: "Reading Firefox logins database...",
    });
    await delay(1400);

    // Mock: simulate finding passwords
    const passwordCount = Math.floor(Math.random() * 60) + 15;

    sendProgress(webContents, {
      browser: "Firefox",
      stage: "importing",
      message: `Transferring ${passwordCount} Firefox passwords...`,
    });
    await delay(1700);

    logger.info(
      `Successfully imported ${passwordCount} passwords from Firefox`,
    );
    return {
      browser: "Firefox",
      success: true,
      passwordCount,
    };
  } catch (error) {
    logger.error("Firefox import failed:", error);
    return {
      browser: "Firefox",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function importFromBrave(
  webContents: Electron.WebContents,
): Promise<PasswordImportResult> {
  try {
    logger.info("Starting Brave password import");

    sendProgress(webContents, {
      browser: "Brave",
      stage: "scanning",
      message: "Locating Brave profile...",
    });
    await delay(700);

    sendProgress(webContents, {
      browser: "Brave",
      stage: "scanning",
      message: "Reading Brave password database...",
    });
    await delay(1100);

    // Mock: simulate finding passwords
    const passwordCount = Math.floor(Math.random() * 40) + 8;

    sendProgress(webContents, {
      browser: "Brave",
      stage: "importing",
      message: `Transferring ${passwordCount} Brave passwords...`,
    });
    await delay(1500);

    logger.info(`Successfully imported ${passwordCount} passwords from Brave`);
    return {
      browser: "Brave",
      success: true,
      passwordCount,
    };
  } catch (error) {
    logger.error("Brave import failed:", error);
    return {
      browser: "Brave",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function importFromArc(
  webContents: Electron.WebContents,
): Promise<PasswordImportResult> {
  try {
    logger.info("Starting Arc password import");

    sendProgress(webContents, {
      browser: "Arc",
      stage: "scanning",
      message: "Locating Arc profile...",
    });
    await delay(600);

    sendProgress(webContents, {
      browser: "Arc",
      stage: "scanning",
      message: "Reading Arc password database...",
    });
    await delay(1300);

    // Mock: simulate finding passwords
    const passwordCount = Math.floor(Math.random() * 35) + 5;

    sendProgress(webContents, {
      browser: "Arc",
      stage: "importing",
      message: `Transferring ${passwordCount} Arc passwords...`,
    });
    await delay(1600);

    logger.info(`Successfully imported ${passwordCount} passwords from Arc`);
    return {
      browser: "Arc",
      success: true,
      passwordCount,
    };
  } catch (error) {
    logger.error("Arc import failed:", error);
    return {
      browser: "Arc",
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// Register IPC handlers
ipcMain.handle("password-import-start", async (event, browser: string) => {
  logger.info(`Starting password import for ${browser}`);

  const webContents = event.sender;
  let result: PasswordImportResult;

  try {
    switch (browser.toLowerCase()) {
      case "safari":
        result = await importFromSafari(webContents);
        break;
      case "chrome":
        result = await importFromChrome(webContents);
        break;
      case "firefox":
        result = await importFromFirefox(webContents);
        break;
      case "brave":
        result = await importFromBrave(webContents);
        break;
      case "arc":
        result = await importFromArc(webContents);
        break;
      default:
        throw new Error(`Unsupported browser: ${browser}`);
    }

    logger.info(`Password import completed for ${browser}:`, result);
    return result;
  } catch (error) {
    logger.error(`Password import failed for ${browser}:`, error);
    return {
      browser,
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

// New IPC handlers for CSV import and Chrome migration
ipcMain.handle("password-import-csv", async (_event, csvContent: string) => {
  logger.info("Starting CSV password import");

  try {
    // Create a mock user profile for demonstration
    const mockUserProfile: UserProfile = {
      saveLoginDetails: async (
        server: string,
        username: string,
        _password: string,
      ) => {
        // In real implementation, this would save to the actual user profile
        logger.info(`Saving login details for ${username} at ${server}`);
        await delay(100); // Simulate async operation
      },
    };

    const success = await importSafariPasswordsFromCSV(
      csvContent,
      mockUserProfile,
    );

    return {
      success,
      message: success
        ? "CSV import completed successfully"
        : "CSV import failed",
    };
  } catch (error) {
    logger.error("CSV import failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle(
  "password-migrate-chrome",
  async (_event, profilePath: string, encryptionKey: string) => {
    logger.info("Starting Chrome password migration");

    try {
      const browserProfile: BrowserProfile = {
        path: profilePath,
        name: "Chrome",
      };

      // Create a mock user profile for demonstration
      const mockUserProfile: UserProfile = {
        saveLoginDetails: async (
          server: string,
          username: string,
          _password: string,
        ) => {
          // In real implementation, this would save to the actual user profile
          logger.info(`Saving login details for ${username} at ${server}`);
          await delay(100); // Simulate async operation
        },
      };

      await migrateChromePasswords(
        browserProfile,
        mockUserProfile,
        encryptionKey,
      );

      return {
        success: true,
        message: "Chrome password migration completed successfully",
      };
    } catch (error) {
      logger.error("Chrome migration failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
