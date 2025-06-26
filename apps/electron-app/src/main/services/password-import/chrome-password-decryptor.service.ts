import * as fs from "fs";
import * as path from "path";
import * as crypto from "crypto";
import * as sqlite3 from "sqlite3";
import { execSync } from "child_process";
import { createLogger } from "@vibe/shared-types";
import { BrowserProfile } from "./browser-detector.service";

const logger = createLogger("chrome-password-decryptor");

export interface PasswordRecord {
  originUrl: string;
  username: string;
  password: string;
  dateCreated?: Date;
}

export class ChromePasswordDecryptorService {
  /**
   * Get Chrome Safe Storage key from macOS Keychain
   */
  private static getChromeEncryptionKey(): string | null {
    if (process.platform !== "darwin") {
      logger.warn("Chrome key extraction only implemented for macOS");
      return null;
    }

    logger.info("Retrieving Chrome Safe Storage key from macOS Keychain");

    try {
      const result = execSync(
        'security find-generic-password -w -s "Chrome Safe Storage" -a "Chrome"',
        { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
      ).trim();

      logger.info("Successfully retrieved Chrome Safe Storage key");
      return result;
    } catch (error: any) {
      logger.error("Failed to get Chrome Safe Storage key:", error.message);

      // Try alternative account names
      const altAccounts = ["Chromium", "Google Chrome"];
      for (const account of altAccounts) {
        try {
          const result = execSync(
            `security find-generic-password -w -s "Chrome Safe Storage" -a "${account}"`,
            { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
          ).trim();

          logger.info(`Retrieved key using account: ${account}`);
          return result;
        } catch {
          // Continue trying with next account
        }
      }

      return null;
    }
  }

  /**
   * Decrypt a Chrome password
   */
  private static async decryptPassword(
    encryptedPassword: Buffer,
  ): Promise<string> {
    if (!encryptedPassword || encryptedPassword.length === 0) {
      return "";
    }

    // Chrome v80+ passwords start with 'v10' on macOS
    if (process.platform === "darwin") {
      try {
        if (encryptedPassword.toString("utf8", 0, 3) !== "v10") {
          logger.warn("Password is not v10 encrypted");
          return encryptedPassword.toString("utf8");
        }

        const keychainPassword = this.getChromeEncryptionKey();
        if (!keychainPassword) {
          logger.error("Could not retrieve Chrome encryption key");
          return "";
        }

        // Derive the key using PBKDF2
        const salt = "saltysalt";
        const iterations = 1003;
        const keyLength = 16;

        const derivedKey = crypto.pbkdf2Sync(
          keychainPassword,
          salt,
          iterations,
          keyLength,
          "sha1",
        );

        // Decrypt using AES-128-CBC
        const iv = Buffer.alloc(16, " ");
        const encryptedData = encryptedPassword.slice(3);

        const decipher = crypto.createDecipheriv("aes-128-cbc", derivedKey, iv);
        decipher.setAutoPadding(false);

        let decrypted = decipher.update(encryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Remove PKCS7 padding
        const paddingLength = decrypted[decrypted.length - 1];
        const password = decrypted
          .slice(0, decrypted.length - paddingLength)
          .toString("utf8");

        return password;
      } catch (error) {
        logger.error("Failed to decrypt Chrome password:", error);
        return "";
      }
    }

    logger.warn(
      `Password decryption not implemented for platform: ${process.platform}`,
    );
    return "";
  }

  /**
   * Get all passwords from a Chrome profile
   */
  static async getAllPasswords(
    browserProfile: BrowserProfile,
  ): Promise<PasswordRecord[]> {
    return new Promise((resolve, reject) => {
      const loginDataPath = path.join(browserProfile.path, "Login Data");
      const tempDbPath = path.join(browserProfile.path, "Login Data.temp");

      try {
        if (!fs.existsSync(loginDataPath)) {
          reject(new Error(`Login Data file not found at ${loginDataPath}`));
          return;
        }

        // Copy database to avoid locking issues
        fs.copyFileSync(loginDataPath, tempDbPath);
      } catch (error) {
        logger.error("Error copying Login Data file:", error);
        reject(error as Error);
        return;
      }

      let db: sqlite3.Database | null = null;

      try {
        db = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY, err => {
          if (err) {
            reject(new Error(`Failed to open database: ${err.message}`));
            return;
          }

          db!.all(
            `SELECT origin_url, username_value, password_value, date_created 
             FROM logins
             WHERE password_value IS NOT NULL AND password_value != ''`,
            async (err, rows: any[]) => {
              if (err) {
                reject(err);
                return;
              }

              try {
                const processedLogins = await Promise.all(
                  rows.map(async row => {
                    const decryptedPassword = await this.decryptPassword(
                      row.password_value,
                    );

                    return {
                      originUrl: row.origin_url,
                      username: row.username_value,
                      password: decryptedPassword,
                      dateCreated: new Date(row.date_created / 1000),
                    };
                  }),
                );

                const validLogins = processedLogins.filter(
                  login => login.password !== "",
                );

                resolve(validLogins);
              } catch (error) {
                reject(error as Error);
              } finally {
                if (db) {
                  db.close();
                }
                try {
                  fs.unlinkSync(tempDbPath);
                } catch (error) {
                  logger.error("Error cleaning up temp database:", error);
                }
              }
            },
          );
        });
      } catch (error) {
        if (db) {
          db.close();
        }
        try {
          fs.unlinkSync(tempDbPath);
        } catch (cleanupError) {
          logger.error("Error cleaning up temp database:", cleanupError);
        }
        reject(error as Error);
      }
    });
  }

  /**
   * Get password count for a profile without decrypting
   */
  static async getPasswordCount(
    browserProfile: BrowserProfile,
  ): Promise<number> {
    return new Promise(resolve => {
      const loginDataPath = path.join(browserProfile.path, "Login Data");

      if (!fs.existsSync(loginDataPath)) {
        resolve(0);
        return;
      }

      const db = new sqlite3.Database(
        loginDataPath,
        sqlite3.OPEN_READONLY,
        err => {
          if (err) {
            resolve(0);
            return;
          }

          db.get(
            `SELECT COUNT(*) as count FROM logins WHERE password_value IS NOT NULL AND password_value != ''`,
            (err, result: any) => {
              db.close();
              if (err) {
                resolve(0);
              } else {
                resolve(result?.count || 0);
              }
            },
          );
        },
      );
    });
  }
}
