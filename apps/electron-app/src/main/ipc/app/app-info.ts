import { ipcMain } from "electron";

/**
 * App info and platform handlers
 * Direct approach - no registration functions needed
 */

// Store auth token in memory
let authToken: string | null = null;

ipcMain.handle("app:get-info", async () => {
  return {
    name: "Vibe Browser",
    version: process.env.npm_package_version || "1.0.0",
    platform: process.platform,
  };
});

ipcMain.handle("app:set-auth-token", async (_event, token: string | null) => {
  authToken = token;
  // Make token available globally for MCP connections
  global.privyAuthToken = token;
  return { success: true };
});

// Export getter for other modules
export function getAuthToken(): string | null {
  return authToken;
}
