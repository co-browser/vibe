/**
 * Centralized user agent configuration for the application.
 * Makes Electron appear as a regular Chrome browser to ensure compatibility with web services.
 */

/**
 * Default browser user agent string that mimics Chrome on macOS.
 * This helps avoid detection/blocking by services that restrict Electron apps.
 */
export const DEFAULT_USER_AGENT = 
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/**
 * Gets a user agent string with a specific Chrome version.
 * Useful for services that require specific browser versions.
 * 
 * @param chromeVersion - The Chrome version to use (e.g., "126.0.0.0")
 * @returns Formatted user agent string
 */
export function getUserAgent(chromeVersion: string = "126.0.0.0"): string {
  return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVersion} Safari/537.36`;
}

/**
 * Replaces "Electron" with "Chrome" in a user agent string.
 * Used for WebAuthn and other services that specifically check for Electron.
 * 
 * @param userAgent - The original user agent string
 * @returns Modified user agent string with Electron replaced by Chrome
 */
export function maskElectronUserAgent(userAgent: string): string {
  // Replace Electron/x.y.z with Chrome/126.0.0.0
  return userAgent.replace(/Electron\/[\d.]+/g, "Chrome/126.0.0.0");
}