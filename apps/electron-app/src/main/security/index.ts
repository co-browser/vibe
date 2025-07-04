import { app, session, protocol, shell } from "electron";
import { createLogger } from "@vibe/shared-types";
import { applyContentSecurityPolicy, setupCSPViolationReporting } from "./csp";

const logger = createLogger("Security");

// Security configuration interface
interface SecurityConfig {
  enableStrictCSP: boolean;
  allowDevTools: boolean;
  enforceCodeSigning: boolean;
}

// Default security configuration
const getSecurityConfig = (): SecurityConfig => ({
  enableStrictCSP: true,
  allowDevTools: !app.isPackaged, // Only in development
  enforceCodeSigning: app.isPackaged, // Only in production
});

// Initialize all security measures
export const initializeSecurity = (): void => {
  const config = getSecurityConfig();
  logger.info("Initializing security measures", config);

  // 1. Disable navigation to external protocols
  app.on("web-contents-created", (_, contents) => {
    // Prevent navigation to external URLs
    contents.on("will-navigate", (event, url) => {
      const parsedUrl = new URL(url);
      if (parsedUrl.origin !== "file://") {
        logger.warn("Blocked navigation to external URL", { url });
        event.preventDefault();
      }
    });

    // Prevent new window creation
    contents.setWindowOpenHandler(({ url }) => {
      // Only allow opening URLs in external browser
      if (url.startsWith("http://") || url.startsWith("https://")) {
        shell.openExternal(url);
      }
      return { action: "deny" };
    });

    // Disable or restrict DevTools based on config
    if (!config.allowDevTools) {
      contents.on("devtools-opened", () => {
        logger.warn("DevTools opened in production mode");
        contents.closeDevTools();
      });
    }
  });

  // 2. Register secure protocol schemes
  protocol.registerSchemesAsPrivileged([
    {
      scheme: "app",
      privileges: {
        secure: true,
        standard: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);

  // 3. Apply CSP to default session
  const defaultSession = session.defaultSession;
  
  if (config.enableStrictCSP) {
    applyContentSecurityPolicy(defaultSession, !app.isPackaged);
    setupCSPViolationReporting(defaultSession);
  }

  // 4. Clear sensitive data on exit
  app.on("will-quit", async (event) => {
    event.preventDefault();
    try {
      await clearSensitiveData();
      app.exit(0);
    } catch (error) {
      logger.error("Failed to clear sensitive data", { error });
      app.exit(1);
    }
  });

  // 5. Disable remote module (deprecated but ensure it's off)
  app.commandLine.appendSwitch("disable-remote-module");

  // 6. Enable context isolation for all webContents
  app.on("web-contents-created", (_, contents) => {
    contents.on("did-attach-webview", (_, webContents) => {
      webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    });
  });

  // 7. Set secure headers for all requests
  defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders["DNT"] = "1";
    details.requestHeaders["Sec-Fetch-Site"] = "same-origin";
    callback({ requestHeaders: details.requestHeaders });
  });

  // 8. Implement permission request handler
  defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const deniedPermissions = [
      "media",
      "geolocation",
      "notifications",
      "camera",
      "microphone",
      "clipboard-read",
      "clipboard-write",
    ];

    if (deniedPermissions.includes(permission)) {
      logger.warn("Permission request denied", { 
        permission,
        url: webContents.getURL() 
      });
      callback(false);
    } else {
      callback(true);
    }
  });

  logger.info("Security measures initialized successfully");
};

// Clear sensitive data from session
const clearSensitiveData = async (): Promise<void> => {
  const defaultSession = session.defaultSession;
  
  try {
    // Clear all storage data
    await defaultSession.clearStorageData({
      storages: ["cookies", "localstorage", "websql", "indexdb", "cachestorage", "serviceworkers"],
    });
    
    // Clear cache
    await defaultSession.clearCache();
    
    // Clear auth cache
    await defaultSession.clearAuthCache();
    
    logger.info("Sensitive data cleared successfully");
  } catch (error) {
    logger.error("Failed to clear sensitive data", { error });
    throw error;
  }
};

// Export security utilities
export { applyContentSecurityPolicy, setupCSPViolationReporting } from "./csp";
export { clearSensitiveData };