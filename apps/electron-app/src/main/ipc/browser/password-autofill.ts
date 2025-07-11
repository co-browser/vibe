/**
 * Password autofill IPC handlers for web content integration
 * Handles finding and filling passwords for input fields
 */

import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("password-autofill");

export function registerPasswordAutofillHandlers(): void {
  /**
   * Find the most recent password for a domain and fill form fields
   */
  ipcMain.handle(
    "autofill:find-and-fill-password",
    async (_event, pageUrl: string) => {
      try {
        const userProfileStore = useUserProfileStore.getState();
        const activeProfile = userProfileStore.getActiveProfile();

        if (!activeProfile) {
          logger.warn("No active profile found for password autofill");
          return { success: false, error: "No active profile" };
        }

        // Extract domain from page URL
        let domain: string;
        try {
          const url = new URL(pageUrl);
          domain = url.hostname;
        } catch {
          logger.error("Invalid page URL for autofill:", pageUrl);
          return { success: false, error: "Invalid page URL" };
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

        if (!mostRecentPassword) {
          logger.info(`No password found for domain: ${domain}`);
          return { success: false, error: "No password found for this domain" };
        }

        logger.info(`Found password for autofill on ${domain}:`, {
          url: mostRecentPassword.url,
          username: mostRecentPassword.username,
          source: mostRecentPassword.source,
        });

        // Return the password data for filling
        return {
          success: true,
          credentials: {
            username: mostRecentPassword.username,
            password: mostRecentPassword.password,
            url: mostRecentPassword.url,
            source: mostRecentPassword.source,
          },
        };
      } catch (error) {
        logger.error("Failed to find password for autofill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  /**
   * Execute password autofill on the current page
   */
  ipcMain.handle(
    "autofill:execute-fill",
    async (
      _event,
      webContentsId: number,
      credentials: { username: string; password: string },
    ) => {
      try {
        const { webContents } = await import("electron");
        const targetWebContents = webContents.fromId(webContentsId);

        if (!targetWebContents || targetWebContents.isDestroyed()) {
          return { success: false, error: "WebContents not found" };
        }

        // JavaScript code to fill form fields with fuzzy matching
        const fillScript = `
        (() => {
          try {
            const username = ${JSON.stringify(credentials.username)};
            const password = ${JSON.stringify(credentials.password)};
            
            // Common username field selectors (fuzzy matching)
            const usernameSelectors = [
              'input[type="text"][name*="user"]',
              'input[type="text"][name*="email"]',
              'input[type="text"][name*="login"]',
              'input[type="email"]',
              'input[name="username"]',
              'input[name="email"]',
              'input[name="user"]',
              'input[name="login"]',
              'input[id*="user"]',
              'input[id*="email"]',
              'input[id*="login"]',
              'input[placeholder*="username" i]',
              'input[placeholder*="email" i]',
              'input[placeholder*="user" i]',
              'input[class*="user"]',
              'input[class*="email"]',
              'input[class*="login"]'
            ];
            
            // Common password field selectors
            const passwordSelectors = [
              'input[type="password"]',
              'input[name="password"]',
              'input[name="pass"]',
              'input[id*="password"]',
              'input[id*="pass"]',
              'input[placeholder*="password" i]',
              'input[class*="password"]',
              'input[class*="pass"]'
            ];
            
            let filled = { username: false, password: false };
            
            // Find and fill username field
            for (const selector of usernameSelectors) {
              const usernameField = document.querySelector(selector);
              if (usernameField) {
                usernameField.value = username;
                usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                filled.username = true;
                break;
              }
            }
            
            // Find and fill password field
            for (const selector of passwordSelectors) {
              const passwordField = document.querySelector(selector);
              if (passwordField) {
                passwordField.value = password;
                passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                filled.password = true;
                break;
              }
            }
            
            return filled;
          } catch (error) {
            return { error: error.message };
          }
        })();
      `;

        const result = await targetWebContents.executeJavaScript(fillScript);

        if (result.error) {
          logger.error(
            "JavaScript execution error during autofill:",
            result.error,
          );
          return { success: false, error: result.error };
        }

        logger.info("Password autofill executed:", result);
        return {
          success: true,
          filled: result,
          message: `Filled ${result.username ? "username" : "no username"} and ${result.password ? "password" : "no password"}`,
        };
      } catch (error) {
        logger.error("Failed to execute password autofill:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
  );

  logger.info("Password autofill handlers registered");
}
