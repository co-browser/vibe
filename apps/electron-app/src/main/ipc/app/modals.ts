/**
 * Modal IPC handlers
 * Handles modal-related IPC events
 */

import { ipcMain } from "electron";
import { createLogger } from "@vibe/shared-types";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as sqlite3 from "sqlite3";

const logger = createLogger("ipc-modals");

// Handle settings modal closed event
ipcMain.on("app:settings-modal-closed", () => {
  logger.debug("Settings modal closed");

  // Optional: You could add any cleanup logic here
  // For now, just acknowledge the event
});

// Handle downloads modal closed event
ipcMain.on("app:downloads-modal-closed", () => {
  logger.debug("Downloads modal closed");

  // Optional: You could add any cleanup logic here
  // For now, just acknowledge the event
});

// Types for Chrome password import
interface BrowserProfile {
  path: string;
  name: string;
  browser: string;
  lastModified?: Date;
}

// Note: Password decryption functionality removed for now since we're only implementing
// password counting functionality. Full password decryption would require
// platform-specific encryption key handling (DPAPI on Windows, Keychain on macOS, etc.)

// Find Chrome browser profiles on the system
function findChromeProfiles(): BrowserProfile[] {
  let chromePath = "";

  switch (process.platform) {
    case "win32":
      chromePath = path.join(
        process.env.LOCALAPPDATA || "",
        "Google/Chrome/User Data",
      );
      break;
    case "darwin":
      chromePath = path.join(
        os.homedir(),
        "Library/Application Support/Google/Chrome",
      );
      break;
    case "linux":
      chromePath = path.join(os.homedir(), ".config/google-chrome");
      break;
    default:
      logger.warn("Unsupported operating system for Chrome import");
      return [];
  }

  const profiles: BrowserProfile[] = [];

  try {
    if (!fs.existsSync(chromePath)) {
      logger.info("Chrome installation not found");
      return profiles;
    }

    const localStatePath = path.join(chromePath, "Local State");
    if (fs.existsSync(localStatePath)) {
      const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
      const profilesInfo = localState.profile?.info_cache || {};

      // Add Default profile
      const defaultProfilePath = path.join(chromePath, "Default");
      if (fs.existsSync(defaultProfilePath)) {
        profiles.push({
          name: "Default",
          path: defaultProfilePath,
          browser: "chrome",
          lastModified: fs.statSync(defaultProfilePath).mtime,
        });
      }

      // Add other profiles
      Object.entries(profilesInfo).forEach(
        ([profileDir, info]: [string, any]) => {
          if (profileDir !== "Default") {
            const profilePath = path.join(chromePath, profileDir);
            if (fs.existsSync(profilePath)) {
              profiles.push({
                name: info.name || profileDir,
                path: profilePath,
                browser: "chrome",
                lastModified: fs.statSync(profilePath).mtime,
              });
            }
          }
        },
      );
    }
  } catch (error) {
    logger.error("Error reading Chrome profiles:", error);
  }

  // Sort by last modified (most recent first)
  return profiles.sort((a, b) => {
    if (!a.lastModified || !b.lastModified) return 0;
    return b.lastModified.getTime() - a.lastModified.getTime();
  });
}

// Find the Chrome profile with the most passwords
async function findChromeProfileWithMostPasswords(): Promise<{
  profile: BrowserProfile | null;
  passwordCount: number;
}> {
  const chromeProfiles = findChromeProfiles();

  if (chromeProfiles.length === 0) {
    return { profile: null, passwordCount: 0 };
  }

  let maxPasswordCount = 0;
  let bestProfile: BrowserProfile | null = null;

  // Check each profile for password count
  for (const profile of chromeProfiles) {
    try {
      const loginDataPath = path.join(profile.path, "Login Data");
      if (!fs.existsSync(loginDataPath)) {
        continue;
      }

      // Quick count of passwords without decryption
      const tempDbPath = path.join(profile.path, "Login Data.temp.count");
      fs.copyFileSync(loginDataPath, tempDbPath);

      const db = new sqlite3.Database(tempDbPath, sqlite3.OPEN_READONLY);
      const count = await new Promise<number>((resolve, reject) => {
        db.get(
          "SELECT COUNT(*) as count FROM logins WHERE length(password_value) > 0",
          (err, row: any) => {
            if (err) {
              reject(err);
            } else {
              resolve(row.count || 0);
            }
          },
        );
      });

      db.close();
      fs.unlinkSync(tempDbPath);

      logger.info(`Profile ${profile.name} has ${count} passwords`);

      if (count > maxPasswordCount) {
        maxPasswordCount = count;
        bestProfile = profile;
      }
    } catch (error) {
      logger.error(`Error checking profile ${profile.name}:`, error);
    }
  }

  return { profile: bestProfile, passwordCount: maxPasswordCount };
}

// Handle password import request - now with Chrome support
ipcMain.handle("app:import-passwords", async () => {
  logger.info("Starting Chrome password import");

  try {
    // Find Chrome profile with most passwords
    const { profile, passwordCount } =
      await findChromeProfileWithMostPasswords();

    if (!profile) {
      return {
        success: false,
        message: "No Chrome profiles found with passwords",
        passwordCount: 0,
      };
    }

    logger.info(
      `Found Chrome profile '${profile.name}' with ${passwordCount} passwords`,
    );

    // For now, just return the count - actual import would require proper decryption
    // and integration with the user profile system
    return {
      success: true,
      message: `Found Chrome profile '${profile.name}' with ${passwordCount} passwords. Import functionality requires secure password decryption implementation.`,
      passwordCount,
      profileName: profile.name,
      profilePath: profile.path,
    };
  } catch (error) {
    logger.error("Chrome password import failed:", error);
    return {
      success: false,
      message:
        error instanceof Error ? error.message : "Unknown error occurred",
      passwordCount: 0,
    };
  }
});

logger.info("Modal IPC handlers registered");
