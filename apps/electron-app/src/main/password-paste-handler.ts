import { clipboard } from "electron";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "@/store/user-profile-store";

const logger = createLogger("password-paste-handler");

/**
 * Paste password for a specific domain
 */
export async function pastePasswordForDomain(domain: string) {
  try {
    const userProfileStore = useUserProfileStore.getState();
    const activeProfile = userProfileStore.getActiveProfile();

    if (!activeProfile) {
      logger.error("No active profile found");
      return { success: false, error: "No active profile" };
    }

    // Get all passwords for the active profile
    const passwords = await userProfileStore.getImportedPasswords(
      activeProfile.id,
    );

    if (!passwords || passwords.length === 0) {
      logger.info("No passwords found for profile");
      return { success: false, error: "No passwords found" };
    }

    // Find matching passwords for the domain
    const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");
    const matchingPasswords = passwords.filter(p => {
      try {
        const url = new URL(p.url);
        const passwordDomain = url.hostname.toLowerCase().replace(/^www\./, "");

        return (
          passwordDomain === normalizedDomain ||
          passwordDomain.endsWith("." + normalizedDomain) ||
          normalizedDomain.endsWith("." + passwordDomain)
        );
      } catch {
        return false;
      }
    });

    if (matchingPasswords.length === 0) {
      logger.info(`No passwords found for domain: ${domain}`);
      return { success: false, error: "No password found for this domain" };
    }

    // Sort by most recent and get the first one
    matchingPasswords.sort((a, b) => {
      const dateA = new Date(a.lastModified || a.dateCreated || 0);
      const dateB = new Date(b.lastModified || b.dateCreated || 0);
      return dateB.getTime() - dateA.getTime();
    });

    const mostRecentPassword = matchingPasswords[0];

    if (mostRecentPassword) {
      logger.info(`Found password for domain ${domain}:`, {
        url: mostRecentPassword.url,
        username: mostRecentPassword.username,
        source: mostRecentPassword.source,
      });

      // Copy password to clipboard
      clipboard.writeText(mostRecentPassword.password);

      // Show notification
      try {
        const { NotificationService } = await import(
          "@/services/notification-service"
        );
        const notificationService = NotificationService.getInstance();
        if (notificationService) {
          notificationService.showLocalNotification({
            title: "Password Pasted",
            body: `Password for ${domain} copied to clipboard`,
            icon: "🔐",
          });
        }
      } catch (error) {
        logger.warn("Failed to show notification:", error);
      }

      return {
        success: true,
        password: {
          id: mostRecentPassword.id,
          url: mostRecentPassword.url,
          username: mostRecentPassword.username,
          source: mostRecentPassword.source,
        },
      };
    }

    return { success: false, error: "No password found for this domain" };
  } catch (error) {
    logger.error("Failed to paste password for domain:", error);
    return { success: false, error: "Failed to retrieve password" };
  }
}

/**
 * Paste password for the active tab
 */
export async function pastePasswordForActiveTab() {
  try {
    // Get the active tab from the browser
    const { browser } = await import("@/index");

    if (!browser) {
      logger.error("Browser instance not available");
      return { success: false, error: "Browser not available" };
    }

    const mainWindow = browser.getMainWindow();
    if (!mainWindow) {
      logger.error("Main window not available");
      return { success: false, error: "Main window not available" };
    }

    const appWindow = browser.getApplicationWindow(mainWindow.webContents.id);
    if (!appWindow) {
      logger.error("Application window not available");
      return { success: false, error: "Application window not available" };
    }

    const activeTab = appWindow.tabManager.getActiveTab();
    if (!activeTab) {
      logger.error("No active tab found");
      return { success: false, error: "No active tab found" };
    }

    const url = activeTab.url;
    if (!url) {
      logger.error("Active tab has no URL");
      return { success: false, error: "Active tab has no URL" };
    }

    // Extract domain from URL
    let domain: string;
    try {
      const urlObj = new URL(url);
      domain = urlObj.hostname;
    } catch {
      logger.error("Invalid URL in active tab");
      return { success: false, error: "Invalid URL in active tab" };
    }

    // Use the domain-specific handler
    return await pastePasswordForDomain(domain);
  } catch (error) {
    logger.error("Failed to paste password for active tab:", error);
    return { success: false, error: "Failed to get active tab" };
  }
}
