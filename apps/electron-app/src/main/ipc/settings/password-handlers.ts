/**
 * Password management IPC handlers for settings dialog
 * Maps settings dialog expectations to profile store functionality
 */

import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("password-handlers");

export function registerPasswordHandlers(): void {
  /**
   * Get all passwords for the active profile
   */
  ipcMain.handle("passwords:get-all", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, passwords: [] };
      }

      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );

      return {
        success: true,
        passwords: passwords.map(p => ({
          id: p.id,
          url: p.url,
          username: p.username,
          password: "••••••••", // Never send actual passwords to renderer
          source: p.source || "manual",
          dateCreated: p.dateCreated,
          lastModified: p.lastModified,
        })),
      };
    } catch (error) {
      logger.error("Failed to get passwords:", error);
      return { success: false, passwords: [] };
    }
  });

  /**
   * Get password import sources
   */
  ipcMain.handle("passwords:get-sources", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, sources: [] };
      }

      const sources = await userProfileStore.getPasswordImportSources(
        activeProfile.id,
      );
      return { success: true, sources };
    } catch (error) {
      logger.error("Failed to get password sources:", error);
      return { success: false, sources: [] };
    }
  });

  /**
   * Find the most recent password for a domain (fuzzy matching)
   */
  ipcMain.handle(
    "passwords:find-for-domain",
    async (_event, domain: string) => {
      try {
        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          return { success: false, password: null };
        }

        const passwords = await userProfileStore.getImportedPasswords(
          activeProfile.id,
        );

        // Fuzzy match domain against stored URLs
        const normalizedDomain = domain.toLowerCase().replace(/^www\./, "");

        const matchingPasswords = passwords.filter(p => {
          try {
            const url = new URL(p.url);
            const passwordDomain = url.hostname
              .toLowerCase()
              .replace(/^www\./, "");

            // Exact domain match or subdomain match
            return (
              passwordDomain === normalizedDomain ||
              passwordDomain.endsWith("." + normalizedDomain) ||
              normalizedDomain.endsWith("." + passwordDomain)
            );
          } catch {
            // If URL parsing fails, try simple string matching
            return p.url.toLowerCase().includes(normalizedDomain);
          }
        });

        // Sort by most recently modified first
        matchingPasswords.sort((a, b) => {
          const dateA = a.lastModified || a.dateCreated || new Date(0);
          const dateB = b.lastModified || b.dateCreated || new Date(0);
          return new Date(dateB).getTime() - new Date(dateA).getTime();
        });

        const mostRecentPassword = matchingPasswords[0];

        if (mostRecentPassword) {
          logger.info(`Found password for domain ${domain}:`, {
            url: mostRecentPassword.url,
            username: mostRecentPassword.username,
            source: mostRecentPassword.source,
          });

          return {
            success: true,
            password: {
              id: mostRecentPassword.id,
              url: mostRecentPassword.url,
              username: mostRecentPassword.username,
              password: "••••••••", // Never send actual passwords to renderer
              source: mostRecentPassword.source,
            },
          };
        }

        return { success: false, password: null };
      } catch (error) {
        logger.error("Failed to find password for domain:", error);
        return { success: false, password: null };
      }
    },
  );

  /**
   * Decrypt a password - requires additional security verification
   */
  ipcMain.handle("passwords:decrypt", async (event, passwordId: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, error: "No active profile" };
      }

      // Verify the request is coming from a trusted source
      const webContents = event.sender;
      const url = webContents.getURL();

      // Only allow decryption from the main app window
      if (!url.startsWith("file://") && !url.includes("localhost")) {
        logger.error(
          "Password decryption attempted from untrusted source:",
          url,
        );
        return { success: false, error: "Unauthorized request" };
      }

      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );
      const password = passwords.find(p => p.id === passwordId);

      if (!password) {
        return { success: false, error: "Password not found" };
      }

      // Log password access for security auditing
      logger.info(`Password accessed for ${password.url} by user action`);

      return {
        success: true,
        decryptedPassword: password.password,
      };
    } catch (error) {
      logger.error("Failed to decrypt password:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  /**
   * Delete a specific password
   */
  ipcMain.handle("passwords:delete", async (_event, passwordId: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, error: "No active profile" };
      }

      // Get all passwords and filter out the one to delete
      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );
      const filteredPasswords = passwords.filter(p => p.id !== passwordId);

      // Clear all and re-store the filtered list
      // Note: This is a workaround until proper delete method is implemented
      await userProfileStore.storeImportedPasswords(
        activeProfile.id,
        "filtered",
        filteredPasswords,
      );

      return { success: true };
    } catch (error) {
      logger.error("Failed to delete password:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  /**
   * Clear all passwords
   */
  ipcMain.handle("passwords:clear-all", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, error: "No active profile" };
      }

      // Clear all passwords by storing an empty array
      // Note: This is a workaround until proper clear method is implemented
      await userProfileStore.storeImportedPasswords(
        activeProfile.id,
        "cleared",
        [],
      );
      return { success: true };
    } catch (error) {
      logger.error("Failed to clear all passwords:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  /**
   * Remove passwords from a specific source
   */
  ipcMain.handle("passwords:remove-source", async (_event, source: string) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, error: "No active profile" };
      }

      // Get all passwords and filter out ones from the specified source
      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );
      const filteredPasswords = passwords.filter(p => p.source !== source);

      // Clear all and re-store the filtered list
      // Note: This is a workaround until proper removeBySource method is implemented
      await userProfileStore.storeImportedPasswords(
        activeProfile.id,
        "filtered",
        filteredPasswords,
      );

      return { success: true };
    } catch (error) {
      logger.error("Failed to remove password source:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  /**
   * Export passwords to CSV
   */
  ipcMain.handle("passwords:export", async () => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, error: "No active profile" };
      }

      const passwords = await userProfileStore.getImportedPasswords(
        activeProfile.id,
      );

      // Create CSV content
      const csvHeader =
        "url,username,password,source,date_created,last_modified\\n";
      const csvRows = passwords
        .map(p => {
          const url = p.url.replace(/"/g, '""');
          const username = p.username.replace(/"/g, '""');
          const password = "••••••••"; // Never export actual passwords in plain text
          const source = (p.source || "manual").replace(/"/g, '""');
          const dateCreated = p.dateCreated
            ? new Date(p.dateCreated).toISOString()
            : "";
          const lastModified = p.lastModified
            ? new Date(p.lastModified).toISOString()
            : "";

          return `"${url}","${username}","${password}","${source}","${dateCreated}","${lastModified}"`;
        })
        .join("\\n");

      const csvContent = csvHeader + csvRows;

      // Use Electron's dialog to save file
      const { dialog } = await import("electron");
      const { filePath } = await dialog.showSaveDialog({
        defaultPath: `passwords_export_${new Date().toISOString().split("T")[0]}.csv`,
        filters: [
          { name: "CSV Files", extensions: ["csv"] },
          { name: "All Files", extensions: ["*"] },
        ],
      });

      if (filePath) {
        const { writeFileSync } = await import("fs");
        writeFileSync(filePath, csvContent, "utf8");
        return { success: true };
      }

      return { success: false, error: "Export cancelled" };
    } catch (error) {
      logger.error("Failed to export passwords:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  });

  // Note: passwords:import-chrome is already handled by DialogManager
  // which has the actual Chrome extraction logic
}
