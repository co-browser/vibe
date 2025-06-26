import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("browser-detector");

export interface BrowserProfile {
  name: string;
  path: string;
  browser: string;
  lastModified: Date;
}

export class BrowserDetectorService {
  /**
   * Get browser profiles for Chrome/Arc/Brave browsers
   */
  private static readBrowserProfiles(
    browserPath: string,
    browserType: string,
  ): BrowserProfile[] {
    const browserProfiles: BrowserProfile[] = [];

    try {
      if (!fs.existsSync(browserPath)) {
        return browserProfiles;
      }

      const localStatePath = path.join(browserPath, "Local State");
      if (fs.existsSync(localStatePath)) {
        const localState = JSON.parse(fs.readFileSync(localStatePath, "utf8"));
        const profilesInfo = localState.profile?.info_cache || {};

        // Check default profile
        const defaultProfilePath = path.join(browserPath, "Default");
        if (fs.existsSync(defaultProfilePath)) {
          browserProfiles.push({
            name: "Default",
            path: defaultProfilePath,
            lastModified: fs.statSync(defaultProfilePath).mtime,
            browser: browserType,
          });
        }

        // Check other profiles
        Object.entries(profilesInfo).forEach(
          ([profileDir, info]: [string, any]) => {
            if (profileDir !== "Default") {
              const profilePath = path.join(browserPath, profileDir);
              if (fs.existsSync(profilePath)) {
                browserProfiles.push({
                  name: info.name || profileDir,
                  path: profilePath,
                  lastModified: fs.statSync(profilePath).mtime,
                  browser: browserType,
                });
              }
            }
          },
        );
      }
    } catch (error) {
      logger.error(`Error reading ${browserType} profiles:`, error);
    }

    return browserProfiles;
  }

  /**
   * Find all browser profiles on the system
   */
  static findBrowserProfiles(): BrowserProfile[] {
    let chromePath = "";
    let arcPath = "";
    let bravePath = "";

    switch (process.platform) {
      case "win32":
        chromePath = path.join(
          process.env.LOCALAPPDATA || "",
          "Google/Chrome/User Data",
        );
        arcPath = path.join(process.env.LOCALAPPDATA || "", "Arc/User Data");
        bravePath = path.join(
          process.env.LOCALAPPDATA || "",
          "BraveSoftware/Brave-Browser/User Data",
        );
        break;
      case "darwin":
        chromePath = path.join(
          os.homedir(),
          "Library/Application Support/Google/Chrome",
        );
        arcPath = path.join(
          os.homedir(),
          "Library/Application Support/Arc/User Data",
        );
        bravePath = path.join(
          os.homedir(),
          "Library/Application Support/BraveSoftware/Brave-Browser",
        );
        break;
      case "linux":
        chromePath = path.join(os.homedir(), ".config/google-chrome");
        arcPath = path.join(os.homedir(), ".config/arc");
        bravePath = path.join(
          os.homedir(),
          ".config/BraveSoftware/Brave-Browser",
        );
        break;
      default:
        logger.info("Unsupported operating system");
    }

    const allProfiles = [
      ...this.readBrowserProfiles(chromePath, "chrome"),
      ...this.readBrowserProfiles(arcPath, "arc"),
      ...this.readBrowserProfiles(bravePath, "brave"),
    ];

    // Sort by browser and last modified date
    return allProfiles.sort((a, b) => {
      if (a.browser < b.browser) return -1;
      if (a.browser > b.browser) return 1;
      return b.lastModified.getTime() - a.lastModified.getTime();
    });
  }

  /**
   * Get Chrome profiles specifically
   */
  static getChromeProfiles(): BrowserProfile[] {
    return this.findBrowserProfiles().filter(p => p.browser === "chrome");
  }
}
