/**
 * Chrome Data Extraction Service
 * Handles extraction of passwords, bookmarks, history, autofill, and search engines from Chrome
 * Extracted from DialogManager to follow Single Responsibility Principle
 */

import * as fsSync from "fs";
import * as os from "os";
import * as path from "path";
import { createLogger } from "@vibe/shared-types";

import * as sqlite3 from "sqlite3";
import { pbkdf2, createDecipheriv } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

const logger = createLogger("chrome-data-extraction");

export interface ChromeExtractionResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ChromeProfile {
  path: string;
  name: string;
  isDefault: boolean;
}

export interface ProgressCallback {
  (progress: number, message?: string): void;
}

export class ChromeDataExtractionService {
  private static instance: ChromeDataExtractionService;

  public static getInstance(): ChromeDataExtractionService {
    if (!ChromeDataExtractionService.instance) {
      ChromeDataExtractionService.instance = new ChromeDataExtractionService();
    }
    return ChromeDataExtractionService.instance;
  }

  private constructor() {}

  /**
   * Get available Chrome profiles
   */
  public async getChromeProfiles(): Promise<ChromeProfile[]> {
    try {
      const chromeConfigPath = this.getChromeConfigPath();
      if (!chromeConfigPath || !fsSync.existsSync(chromeConfigPath)) {
        return [];
      }

      const profiles: ChromeProfile[] = [];
      const localStatePath = path.join(chromeConfigPath, "Local State");

      if (fsSync.existsSync(localStatePath)) {
        let profilesInfo = {};
        try {
          const localStateContent = fsSync.readFileSync(localStatePath, "utf8");
          const localState = JSON.parse(localStateContent);
          profilesInfo = localState.profile?.info_cache || {};
        } catch (parseError) {
          logger.warn("Failed to parse Chrome Local State file", parseError);
          // Continue with empty profiles info
        }

        for (const [profileDir, info] of Object.entries(profilesInfo as any)) {
          const profilePath = path.join(chromeConfigPath, profileDir);
          if (fsSync.existsSync(profilePath)) {
            profiles.push({
              path: profilePath,
              name: (info as any).name || profileDir,
              isDefault: profileDir === "Default",
            });
          }
        }
      }

      // Fallback to default profile if no profiles found
      if (profiles.length === 0) {
        const defaultPath = path.join(chromeConfigPath, "Default");
        if (fsSync.existsSync(defaultPath)) {
          profiles.push({
            path: defaultPath,
            name: "Default",
            isDefault: true,
          });
        }
      }

      return profiles;
    } catch (error) {
      logger.error("Failed to get Chrome profiles:", error);
      return [];
    }
  }

  /**
   * Extract passwords from Chrome with progress tracking
   */
  public async extractPasswords(
    profile?: ChromeProfile,
    onProgress?: ProgressCallback,
  ): Promise<ChromeExtractionResult<any[]>> {
    try {
      onProgress?.(0.1, "Locating Chrome profile...");

      const chromeProfile = profile || (await this.getDefaultProfile());
      if (!chromeProfile) {
        return { success: false, error: "No Chrome profile found" };
      }

      onProgress?.(0.3, "Reading password database...");

      const passwords = await this.extractPasswordsFromProfile(chromeProfile);

      onProgress?.(1.0, "Password extraction complete");

      return {
        success: true,
        data: passwords,
      };
    } catch (error) {
      logger.error("Password extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract bookmarks from Chrome with progress tracking
   */
  public async extractBookmarks(
    profile?: ChromeProfile,
    onProgress?: ProgressCallback,
  ): Promise<ChromeExtractionResult<any[]>> {
    try {
      onProgress?.(0.1, "Locating Chrome profile...");

      const chromeProfile = profile || (await this.getDefaultProfile());
      if (!chromeProfile) {
        return { success: false, error: "No Chrome profile found" };
      }

      onProgress?.(0.3, "Reading bookmarks file...");

      const bookmarksPath = path.join(chromeProfile.path, "Bookmarks");
      if (!fsSync.existsSync(bookmarksPath)) {
        return { success: false, error: "Bookmarks file not found" };
      }

      let bookmarksData;
      try {
        const bookmarksContent = fsSync.readFileSync(bookmarksPath, "utf8");
        bookmarksData = JSON.parse(bookmarksContent);
      } catch (parseError) {
        logger.error("Failed to parse Chrome bookmarks file", parseError);
        return {
          success: false,
          error: "Failed to parse bookmarks file",
        };
      }
      const bookmarks = this.parseBookmarksRecursive(bookmarksData.roots);

      onProgress?.(1.0, "Bookmarks extraction complete");

      return {
        success: true,
        data: bookmarks.map((bookmark, index) => ({
          ...bookmark,
          id: bookmark.id || `chrome_bookmark_${index}`,
          source: "chrome",
        })),
      };
    } catch (error) {
      logger.error("Bookmarks extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract browsing history from Chrome
   */
  public async extractHistory(
    profile?: ChromeProfile,
    onProgress?: ProgressCallback,
  ): Promise<ChromeExtractionResult<any[]>> {
    try {
      onProgress?.(0.1, "Locating Chrome profile...");

      const chromeProfile = profile || (await this.getDefaultProfile());
      if (!chromeProfile) {
        return { success: false, error: "No Chrome profile found" };
      }

      onProgress?.(0.3, "Reading history database...");

      const historyPath = path.join(chromeProfile.path, "History");
      if (!fsSync.existsSync(historyPath)) {
        return { success: false, error: "History database not found" };
      }

      const history = await this.extractHistoryFromDatabase(historyPath);

      onProgress?.(1.0, "History extraction complete");

      return {
        success: true,
        data: history,
      };
    } catch (error) {
      logger.error("History extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Extract all Chrome data from a profile
   */
  public async extractAllData(
    profile?: ChromeProfile,
    onProgress?: ProgressCallback,
  ): Promise<
    ChromeExtractionResult<{
      passwords: any[];
      bookmarks: any[];
      history: any[];
      autofill: any[];
      searchEngines: any[];
    }>
  > {
    try {
      const chromeProfile = profile || (await this.getDefaultProfile());
      if (!chromeProfile) {
        return { success: false, error: "No Chrome profile found" };
      }

      onProgress?.(0.1, "Starting comprehensive data extraction...");

      const [passwordsResult, bookmarksResult, historyResult] =
        await Promise.allSettled([
          this.extractPasswords(chromeProfile, p =>
            onProgress?.(0.1 + p * 0.3, "Extracting passwords..."),
          ),
          this.extractBookmarks(chromeProfile, p =>
            onProgress?.(0.4 + p * 0.3, "Extracting bookmarks..."),
          ),
          this.extractHistory(chromeProfile, p =>
            onProgress?.(0.7 + p * 0.3, "Extracting history..."),
          ),
        ]);

      onProgress?.(1.0, "Data extraction complete");

      const result = {
        passwords:
          passwordsResult.status === "fulfilled" &&
          passwordsResult.value.success
            ? passwordsResult.value.data || []
            : [],
        bookmarks:
          bookmarksResult.status === "fulfilled" &&
          bookmarksResult.value.success
            ? bookmarksResult.value.data || []
            : [],
        history:
          historyResult.status === "fulfilled" && historyResult.value.success
            ? historyResult.value.data || []
            : [],
        autofill: [], // TODO: Implement autofill extraction
        searchEngines: [], // TODO: Implement search engines extraction
      };

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      logger.error("Comprehensive data extraction failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // PRIVATE HELPER METHODS

  private getChromeConfigPath(): string | null {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
      case "darwin": // macOS
        return path.join(
          homeDir,
          "Library",
          "Application Support",
          "Google",
          "Chrome",
        );
      case "win32": // Windows
        return path.join(
          homeDir,
          "AppData",
          "Local",
          "Google",
          "Chrome",
          "User Data",
        );
      case "linux": // Linux
        return path.join(homeDir, ".config", "google-chrome");
      default:
        return null;
    }
  }

  private async getDefaultProfile(): Promise<ChromeProfile | null> {
    const profiles = await this.getChromeProfiles();
    return profiles.find(p => p.isDefault) || profiles[0] || null;
  }

  private async extractPasswordsFromProfile(
    profile: ChromeProfile,
  ): Promise<any[]> {
    const loginDataPath = path.join(profile.path, "Login Data");
    if (!fsSync.existsSync(loginDataPath)) {
      throw new Error("Login Data file not found");
    }

    // Create a temporary copy of the database (Chrome locks the original)
    const tempPath = path.join(
      os.tmpdir(),
      `chrome_login_data_${Date.now()}.db`,
    );
    try {
      fsSync.copyFileSync(loginDataPath, tempPath);

      // Get the encryption key
      const encryptionKey = await this.getChromeEncryptionKey();
      if (!encryptionKey) {
        throw new Error("Failed to retrieve Chrome encryption key");
      }

      // Query the SQLite database
      const passwords = await new Promise<any[]>((resolve, reject) => {
        const db = new sqlite3.Database(tempPath, sqlite3.OPEN_READONLY);
        const results: any[] = [];
        let totalRows = 0;
        let decryptedCount = 0;

        db.serialize(() => {
          db.each(
            `SELECT origin_url, username_value, password_value, date_created, date_last_used 
             FROM logins 
             WHERE blacklisted_by_user = 0`,
            (err, row: any) => {
              totalRows++;
              if (err) {
                logger.error("Error reading password row:", err);
                return;
              }

              try {
                // Decrypt the password
                const decryptedPassword = this.decryptChromePassword(
                  row.password_value,
                  encryptionKey,
                );

                if (decryptedPassword) {
                  decryptedCount++;
                  results.push({
                    id: `chrome_${profile.name}_${results.length}`,
                    url: row.origin_url,
                    username: row.username_value,
                    password: decryptedPassword,
                    source: "chrome",
                    dateCreated: new Date(
                      row.date_created / 1000 - 11644473600000,
                    ), // Chrome epoch to JS epoch
                    lastModified: row.date_last_used
                      ? new Date(row.date_last_used / 1000 - 11644473600000)
                      : undefined,
                  });
                } else if (decryptedPassword === "") {
                  logger.debug(
                    `Empty password for ${row.origin_url}, skipping`,
                  );
                } else {
                  logger.warn(
                    `Failed to decrypt password for ${row.origin_url}`,
                  );
                }
              } catch (decryptError) {
                logger.warn(
                  `Failed to decrypt password for ${row.origin_url}:`,
                  decryptError,
                );
              }
            },
            err => {
              db.close();
              logger.info(
                `Chrome password extraction completed for ${profile.name}: ${decryptedCount}/${totalRows} passwords decrypted`,
              );
              if (err) {
                reject(err);
              } else {
                resolve(results);
              }
            },
          );
        });

        db.on("error", err => {
          logger.error("Database error:", err);
          reject(err);
        });
      });

      return passwords;
    } finally {
      // Clean up temp file
      try {
        fsSync.unlinkSync(tempPath);
      } catch (e) {
        logger.warn("Failed to clean up temp file:", e);
      }
    }
  }

  private async getChromeEncryptionKey(): Promise<Buffer | null> {
    const platform = os.platform();

    if (platform === "darwin") {
      // macOS: Get key from Keychain using security command
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);

        const { stdout } = await execAsync(
          'security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"',
        );

        const password = stdout.trim();

        if (!password) {
          logger.error("Chrome Safe Storage password not found in Keychain");
          return null;
        }

        // Derive key using PBKDF2
        const salt = Buffer.from("saltysalt");
        const iterations = 1003;
        const keyLength = 16;

        return await pbkdf2Async(password, salt, iterations, keyLength, "sha1");
      } catch (error) {
        logger.error(
          "Failed to get Chrome encryption key from Keychain:",
          error,
        );
        return null;
      }
    } else if (platform === "win32") {
      // Windows: Key is stored in Local State file
      try {
        const localStatePath = path.join(
          os.homedir(),
          "AppData",
          "Local",
          "Google",
          "Chrome",
          "User Data",
          "Local State",
        );

        if (!fsSync.existsSync(localStatePath)) {
          return null;
        }

        let localState;
        try {
          const localStateContent = fsSync.readFileSync(localStatePath, "utf8");
          localState = JSON.parse(localStateContent);
        } catch (parseError) {
          logger.error(
            "Failed to parse Chrome Local State file for encryption key",
            parseError,
          );
          return null;
        }
        const encryptedKey = localState.os_crypt?.encrypted_key;

        if (!encryptedKey) {
          return null;
        }

        // Decode base64 and remove DPAPI prefix
        // const encryptedKeyBuf = Buffer.from(encryptedKey, "base64");
        // const encryptedKeyData = encryptedKeyBuf.slice(5); // Remove "DPAPI" prefix

        // Use Windows DPAPI to decrypt (would need native module)
        // For now, return null - would need win32-dpapi or similar
        logger.warn("Windows DPAPI decryption not implemented");
        return null;
      } catch (error) {
        logger.error(
          "Failed to get Chrome encryption key from Local State:",
          error,
        );
        return null;
      }
    } else if (platform === "linux") {
      // Linux: Use hardcoded key or from gnome-keyring
      const salt = Buffer.from("saltysalt");
      const iterations = 1;
      const keyLength = 16;
      const password = "peanuts"; // Default Chrome password on Linux

      return await pbkdf2Async(password, salt, iterations, keyLength, "sha1");
    }

    return null;
  }

  private decryptChromePassword(
    encryptedPassword: Buffer,
    key: Buffer,
  ): string | null {
    try {
      // Chrome password format: "v10" prefix + encrypted data on macOS
      const passwordBuffer = Buffer.isBuffer(encryptedPassword)
        ? encryptedPassword
        : Buffer.from(encryptedPassword);

      if (!passwordBuffer || passwordBuffer.length === 0) {
        return "";
      }

      // Check for v10 prefix (Chrome 80+ on macOS)
      if (passwordBuffer.slice(0, 3).toString("utf8") === "v10") {
        // AES-128-CBC decryption (not GCM!)
        const iv = Buffer.alloc(16, " "); // Fixed IV of spaces
        const encryptedData = passwordBuffer.slice(3); // Skip "v10" prefix

        const decipher = createDecipheriv("aes-128-cbc", key, iv);
        decipher.setAutoPadding(false); // We'll handle padding manually

        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Remove PKCS7 padding
        const paddingLength = decrypted[decrypted.length - 1];
        if (paddingLength > 0 && paddingLength <= 16) {
          const unpadded = decrypted.slice(0, decrypted.length - paddingLength);
          return unpadded.toString("utf8");
        }

        return decrypted.toString("utf8");
      } else {
        // Non-encrypted or older format
        logger.warn("Password is not v10 encrypted, returning as-is");
        return passwordBuffer.toString("utf8");
      }
    } catch (error) {
      logger.error("Password decryption failed:", error);
      return null;
    }
  }

  private parseBookmarksRecursive(root: any): any[] {
    const bookmarks: any[] = [];

    for (const [key, folder] of Object.entries(root as Record<string, any>)) {
      if (folder.type === "folder" && folder.children) {
        bookmarks.push(
          ...this.parseBookmarksRecursive({ [key]: folder.children }),
        );
      } else if (folder.children) {
        for (const child of folder.children) {
          if (child.type === "url") {
            bookmarks.push({
              id: child.id,
              name: child.name,
              url: child.url,
              folder: key,
              dateAdded: child.date_added
                ? new Date(parseInt(child.date_added) / 1000)
                : new Date(),
            });
          } else if (child.type === "folder") {
            bookmarks.push(
              ...this.parseBookmarksRecursive({ [child.name]: child }),
            );
          }
        }
      }
    }

    return bookmarks;
  }

  private async extractHistoryFromDatabase(
    historyPath: string,
  ): Promise<any[]> {
    // Create a temporary copy of the database (Chrome locks the original)
    const tempPath = path.join(os.tmpdir(), `chrome_history_${Date.now()}.db`);
    try {
      fsSync.copyFileSync(historyPath, tempPath);

      const history = await new Promise<any[]>((resolve, reject) => {
        const db = new sqlite3.Database(tempPath, sqlite3.OPEN_READONLY);
        const results: any[] = [];

        db.serialize(() => {
          db.each(
            `SELECT url, title, visit_count, last_visit_time 
             FROM urls 
             ORDER BY last_visit_time DESC 
             LIMIT 1000`,
            (err, row: any) => {
              if (err) {
                logger.error("Error reading history row:", err);
                return;
              }

              results.push({
                id: `chrome_history_${results.length}`,
                url: row.url,
                title: row.title || row.url,
                visitCount: row.visit_count,
                lastVisit: new Date(
                  row.last_visit_time / 1000 - 11644473600000,
                ), // Chrome epoch to JS epoch
                source: "chrome",
              });
            },
            err => {
              db.close();
              if (err) {
                reject(err);
              } else {
                resolve(results);
              }
            },
          );
        });

        db.on("error", err => {
          logger.error("Database error:", err);
          reject(err);
        });
      });

      return history;
    } finally {
      // Clean up temp file
      try {
        fsSync.unlinkSync(tempPath);
      } catch (e) {
        logger.warn("Failed to clean up temp file:", e);
      }
    }
  }
}

export const chromeDataExtraction = ChromeDataExtractionService.getInstance();
