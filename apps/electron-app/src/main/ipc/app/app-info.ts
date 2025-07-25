import { ipcMain } from "electron";
import { AuthTokenManager } from "../../services/auth-token-manager.js";

/**
 * App info and platform handlers
 * Direct approach - no registration functions needed
 */

ipcMain.handle("app:get-info", async () => {
  return {
    name: "Vibe Browser",
    version: process.env.npm_package_version || "1.0.0",
    platform: process.platform,
  };
});

ipcMain.handle("app:set-auth-token", async (_event, token: string | null) => {
  const authManager = AuthTokenManager.getInstance();

  // Store token in the secure manager
  if (token) {
    authManager.setToken(token);
  } else {
    authManager.clearToken();
  }

  // Forward token update to agent service
  try {
    const { getAgentService } = await import("../chat/agent-status.js");
    const agentService = getAgentService();
    if (agentService) {
      await agentService.updateAuthToken(token);

      // Broadcast agent status change after auth token update
      const { browser } = await import("../../index.js");
      browser?.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send("agent:status-changed", true);
        }
      });
    }
  } catch (error) {
    console.error("Failed to update agent auth token:", error);
  }

  return { success: true };
});

// Handler for getting environment variables
ipcMain.handle("app:get-env-var", async (_event, varName: string) => {
  // Only allow specific environment variables to be accessed
  const allowedVars = [
    "USE_LOCAL_GMAIL_SERVER",
    "USE_LOCAL_GMAIL_AUTH",
    "USE_LOCAL_RAG_SERVER",
    "NODE_ENV",
  ];

  if (!allowedVars.includes(varName)) {
    return undefined;
  }

  return process.env[varName];
});

// Export getter for other modules
export function getAuthToken(): string | null {
  return AuthTokenManager.getInstance().getToken();
}
