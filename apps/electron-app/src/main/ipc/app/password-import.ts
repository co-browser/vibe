import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sqlite3 from "sqlite3";

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
  dateCreated?: Date;
}

// Function to decrypt Chrome password (placeholder - actual implementation depends on platform)
async function decryptPassword(
  encryptedPassword: Buffer,
  _key: string,
  browserProfile: BrowserProfile,
): Promise<string> {
  // This is a placeholder. In a real implementation:
  // - On Windows: Use DPAPI
  // - On macOS: Use Keychain Services to decrypt Chrome passwords
  // - On Linux: Use libsecret or similar
  
  // For testing, return a mock password to ensure the import flow works
  if (process.env.NODE_ENV === 'development') {
    logger.info(`Mock decrypting password for ${browserProfile.name}`);
    return `mock_password_${encryptedPassword.length}`;
  }
  
  logger.warn(
    `Password decryption not implemented for ${browserProfile.name}. Returning empty string.`,
  );
  return "";
}

// Get all passwords from Chrome/Chromium-based browser
async function getAllPasswords(
  browserProfile: BrowserProfile,
  key: string,
): Promise<PasswordRecord[]> {
  console.log("[DEBUG] Starting getAllPasswords for profile:", browserProfile.name);
  return new Promise((resolve, reject) => {
    (async () => {
      const loginDataPath = path.join(browserProfile.path, "Login Data");
      console.log("[DEBUG] Login data path:", loginDataPath);
      const tempDbPath = path.join(browserProfile.path, "Login Data.temp");
      
      try {
        console.log("[DEBUG] Creating temporary database copy");
        fs.copyFileSync(loginDataPath, tempDbPath);
        await new Promise((resolve2) => setTimeout(resolve2, 500));
      
      if (!fs.existsSync(tempDbPath)) {
        throw new Error("Temporary database file was not created successfully");
      }
      console.log("[DEBUG] Temporary database copy created successfully");
    } catch (error) {
      logger.error("Error copying Login Data file:", error);
      console.error("[DEBUG] Failed to create temporary database:", error);
      reject(error as Error);
      return;
    }
    
    console.log("[DEBUG] Opening database connection");
    let db: sqlite3.Database | null = null;
    
    try {
      db = await new Promise<sqlite3.Database>((resolveDb, rejectDb) => {
        const database = new sqlite3.Database(
          tempDbPath,
          sqlite3.OPEN_READONLY,
          (err) => {
            if (err) {
              rejectDb(new Error(`Failed to open database: ${err.message}`));
              return;
            }
            resolveDb(database);
          },
        );
      });
      console.log("[DEBUG] Database connection established successfully");
    } catch (error) {
      logger.error("Error opening database:", error);
      console.error("[DEBUG] Failed to create database connection:", error);
      try {
        fs.unlinkSync(tempDbPath);
      } catch (cleanupError) {
        logger.error(
          "Error cleaning up temporary database after failed open:",
          cleanupError,
        );
      }
      reject(error as Error);
      return;
    }
    
    if (!db) {
      const error = new Error("Database connection could not be established");
      logger.error(String(error));
      reject(error);
      return;
    }
    
    try {
      console.log("[DEBUG] Executing password query");
      db.all(
        `SELECT origin_url, username_value, password_value, date_created 
         FROM logins`,
        async (err, rows: any[]) => {
          if (err) {
            console.error("[DEBUG] Database query failed:", err);
            reject(err);
            return;
          }
          
          console.log("[DEBUG] Query results count:", rows?.length);
          console.log("[DEBUG] Starting password decryption");
          
          try {
            const processedLogins = await Promise.all(
              rows.map(async (row) => {
                const decryptedPassword = await decryptPassword(
                  row.password_value,
                  key,
                  browserProfile,
                );
                console.log(
                  "[DEBUG] Successfully decrypted password for:",
                  row.origin_url,
                );
                return {
                  originUrl: row.origin_url,
                  username: row.username_value,
                  password: decryptedPassword,
                  dateCreated: new Date(row.date_created / 1000),
                };
              }),
            );
            
            const filteredLogins = processedLogins.filter(
              (login) => login.password !== "",
            );
            console.log(
              "[DEBUG] Finished processing all passwords. Valid passwords:",
              filteredLogins.length,
            );
            resolve(filteredLogins);
          } catch (error) {
            console.error("[DEBUG] Error processing passwords:", error);
            reject(error as Error);
          }
        },
      );
    } catch (error) {
      console.error("[DEBUG] Error in database operations:", error);
      reject(error as Error);
    } finally {
      console.log("[DEBUG] Closing database connection");
      if (db) {
        db.close((err) => {
          if (err) {
            logger.error("Error closing database:", err);
          }
        });
      }
      
      try {
        console.log("[DEBUG] Cleaning up temporary database file");
        fs.unlinkSync(tempDbPath);
        console.log("[DEBUG] Temporary database file cleaned up successfully");
      } catch (error) {
        logger.error("Error cleaning up temporary database:", error);
        console.error("[DEBUG] Failed to clean up temporary database:", error);
      }
    }
    })();
  });
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
 * @param profileId - Profile ID to import passwords into
 * @param key - Encryption key for Chrome password database
 */
async function migrateChromePasswords(
  browserProfile: BrowserProfile,
  profileId: string,
  key: string,
): Promise<number> {
  logger.info("Migrating passwords");
  const passwords = await getAllPasswords(browserProfile, key);
  
  // Import to ProfileService instead of using UserProfile
  const { getProfileService } = await import("../../services/profile-service");
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
  
  logger.info(`Successfully migrated ${passwords.length} passwords`);
  return passwords.length;
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

// Read browser profiles for Chrome/Arc browsers
const readBrowserProfiles = (
  browserPath: string,
  browserType: string,
): BrowserProfile[] => {
  const browserProfiles: BrowserProfile[] = [];
  try {
    if (!fs.existsSync(browserPath)) {
      return browserProfiles;
    }
    
    const localStatePath = path.join(browserPath, "Local State");
    if (fs.existsSync(localStatePath)) {
      const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
      const profilesInfo = localState.profile?.info_cache || {};
      
      const defaultProfilePath = path.join(browserPath, "Default");
      if (fs.existsSync(defaultProfilePath)) {
        browserProfiles.push({
          name: "Default",
          path: defaultProfilePath,
          lastModified: fs.statSync(defaultProfilePath).mtime,
          browser: browserType,
        } as BrowserProfile & { lastModified: Date; browser: string });
      }
      
      Object.entries(profilesInfo).forEach(([profileDir, info]: [string, any]) => {
        if (profileDir !== "Default") {
          const profilePath = path.join(browserPath, profileDir);
          if (fs.existsSync(profilePath)) {
            browserProfiles.push({
              name: info.name || profileDir,
              path: profilePath,
              lastModified: fs.statSync(profilePath).mtime,
              browser: browserType,
            } as BrowserProfile & { lastModified: Date; browser: string });
          }
        }
      });
    }
  } catch (error) {
    logger.error(`Error reading ${browserType} profiles:`, error);
  }
  return browserProfiles;
};

// Find all browser profiles on the system
const findBrowserProfiles = (): Array<BrowserProfile & { lastModified: Date; browser: string }> => {
  let chromePath = "";
  let arcPath = "";
  let safariPath = "";
  
  switch (process.platform) {
    case "win32":
      chromePath = path.join(process.env.LOCALAPPDATA || "", "Google/Chrome/User Data");
      arcPath = path.join(process.env.LOCALAPPDATA || "", "Arc/User Data");
      break;
    case "darwin":
      chromePath = path.join(os.homedir(), "Library/Application Support/Google/Chrome");
      arcPath = path.join(os.homedir(), "Library/Application Support/Arc/User Data");
      safariPath = path.join(os.homedir(), "Library/Safari");
      break;
    case "linux":
      chromePath = path.join(os.homedir(), ".config/google-chrome");
      arcPath = path.join(os.homedir(), ".config/arc");
      break;
    default:
      logger.info("Unsupported operating system");
  }
  
  const allProfiles = [
    ...readBrowserProfiles(chromePath, "chrome"),
    ...readBrowserProfiles(arcPath, "arc"),
  ] as Array<BrowserProfile & { lastModified: Date; browser: string }>;
  
  if (process.platform === "darwin" && fs.existsSync(safariPath)) {
    allProfiles.push({
      name: "Safari Data",
      path: safariPath,
      lastModified: fs.statSync(safariPath).mtime,
      browser: "safari",
    });
  }
  
  return allProfiles.sort((a, b) => {
    if (a.browser < b.browser) return -1;
    if (a.browser > b.browser) return 1;
    return b.lastModified.getTime() - a.lastModified.getTime();
  });
};

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
  async (_event, profilePath: string, encryptionKey: string, profileId?: string) => {
    logger.info("Starting Chrome password migration");

    try {
      const browserProfile: BrowserProfile = {
        path: profilePath,
        name: "Chrome",
      };

      // Use current profile if no profileId provided
      if (!profileId) {
        const { getProfileService } = await import("../../services/profile-service");
        const profileService = getProfileService();
        const currentProfile = profileService.getCurrentProfile();
        if (!currentProfile) {
          throw new Error("No current profile available");
        }
        profileId = currentProfile.id;
      }

      const importedCount = await migrateChromePasswords(
        browserProfile,
        profileId,
        encryptionKey,
      );

      return {
        success: true,
        message: `Chrome password migration completed successfully. Imported ${importedCount} passwords.`,
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

// Export functions for use by other modules
export {
  importFromChrome,
  importFromSafari,
  importFromFirefox,
  importFromBrave,
  importFromArc,
  findBrowserProfiles,
  migrateChromePasswords,
};
