/**
 * Deep-link service for handling auto-login from web dashboard
 * Supports authentication tokens passed via custom protocol URLs
 */

import { app, BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";
import { updateAuthState } from "../ipc/auth/auth-verification";

const logger = createLogger("deep-link-service");

// Custom protocol for the app
const PROTOCOL_SCHEME = "vibe";
const PROTOCOL_NAME = "vibe-protocol";

interface AuthTokenPayload {
  userId: string;
  email?: string;
  accessToken: string;
  expiresAt?: number;
}

export class DeepLinkService {
  private initialized = false;

  /**
   * Initialize deep-link handling
   */
  initialize(): void {
    if (this.initialized) return;

    this.registerProtocol();
    this.setupEventHandlers();
    this.handleInitialUrl();

    this.initialized = true;
    logger.info("Deep-link service initialized");
  }

  /**
   * Register custom protocol with the OS
   */
  private registerProtocol(): void {
    try {
      if (process.defaultApp) {
        // Development mode
        if (process.argv.length >= 2) {
          app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
            process.argv[1],
          ]);
        }
      } else {
        // Production mode
        app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
      }

      logger.info(`Registered protocol: ${PROTOCOL_SCHEME}://`);
    } catch (error) {
      logger.error("Failed to register protocol:", error);
    }
  }

  /**
   * Set up event handlers for deep-links
   */
  private setupEventHandlers(): void {
    // macOS: Handle protocol when app is already running
    app.on("open-url", (event, url) => {
      event.preventDefault();
      this.handleDeepLink(url);
    });

    // Windows/Linux: Handle protocol when app creates second instance
    app.on("second-instance", (_event, commandLine, _workingDirectory) => {
      const url = commandLine.find(arg =>
        arg.startsWith(`${PROTOCOL_SCHEME}://`),
      );
      if (url) {
        this.handleDeepLink(url);
      }

      // Focus the main window
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }
    });
  }

  /**
   * Handle deep-link URL when app starts from closed state
   */
  private handleInitialUrl(): void {
    app.whenReady().then(() => {
      // Windows/Linux: Check if app was started with a protocol URL
      const url = process.argv.find(arg =>
        arg.startsWith(`${PROTOCOL_SCHEME}://`),
      );
      if (url) {
        this.handleDeepLink(url);
      }
    });
  }

  /**
   * Process deep-link URL and handle different actions
   */
  private handleDeepLink(url: string): void {
    try {
      logger.info("Processing deep-link:", url);

      const parsedUrl = new URL(url);
      const action = parsedUrl.pathname.replace("/", "");

      switch (action) {
        case "auth":
          this.handleAuthLink(parsedUrl);
          break;
        case "open":
          this.handleOpenLink(parsedUrl);
          break;
        default:
          logger.warn("Unknown deep-link action:", action);
      }
    } catch (error) {
      logger.error("Failed to process deep-link:", error);
    }
  }

  /**
   * Handle authentication deep-link
   * Format: vibe://auth?token=jwt_token&userId=user_id&email=user@example.com
   */
  private handleAuthLink(url: URL): void {
    try {
      const token = url.searchParams.get("token");
      const userId = url.searchParams.get("userId");
      const email = url.searchParams.get("email");

      if (!token || !userId) {
        logger.error("Missing required auth parameters:", {
          token: !!token,
          userId: !!userId,
        });
        return;
      }

      // Validate token format (basic JWT check)
      if (!this.isValidJWT(token)) {
        logger.error("Invalid token format");
        return;
      }

      const authPayload: AuthTokenPayload = {
        userId,
        email: email || undefined,
        accessToken: token,
        expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours
      };

      this.performAutoLogin(authPayload);
    } catch (error) {
      logger.error("Failed to handle auth link:", error);
    }
  }

  /**
   * Handle general open deep-link
   * Format: vibe://open?page=chat&tabId=abc123
   */
  private handleOpenLink(url: URL): void {
    try {
      const page = url.searchParams.get("page");
      const tabId = url.searchParams.get("tabId");

      logger.info("Opening app with parameters:", { page, tabId });

      // Focus main window and navigate to specific page
      const mainWindow = this.getMainWindow();
      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();

        // Send navigation command to renderer
        mainWindow.webContents.send("deep-link:navigate", { page, tabId });
      }
    } catch (error) {
      logger.error("Failed to handle open link:", error);
    }
  }

  /**
   * Perform automatic login with provided credentials
   */
  private performAutoLogin(authPayload: AuthTokenPayload): void {
    try {
      // Get all windows and update their auth state
      const windows = BrowserWindow.getAllWindows();

      windows.forEach(window => {
        // Update main process auth state
        updateAuthState(window.webContents.id, {
          authenticated: true,
          userId: authPayload.userId,
        });

        // Send auth token to renderer for Privy integration
        window.webContents.send("deep-link:auto-login", {
          userId: authPayload.userId,
          email: authPayload.email,
          accessToken: authPayload.accessToken,
          expiresAt: authPayload.expiresAt,
        });
      });

      logger.info("Auto-login initiated for user:", authPayload.userId);
    } catch (error) {
      logger.error("Failed to perform auto-login:", error);
    }
  }

  /**
   * Basic JWT validation
   */
  private isValidJWT(token: string): boolean {
    const parts = token.split(".");
    return parts.length === 3 && parts.every(part => part.length > 0);
  }

  /**
   * Get the main window instance
   */
  private getMainWindow(): BrowserWindow | null {
    const windows = BrowserWindow.getAllWindows();
    return windows.length > 0 ? windows[0] : null;
  }

  /**
   * Generate auth link for web dashboard
   * This is a helper method that can be used by your web app
   */
  static generateAuthLink(authPayload: AuthTokenPayload): string {
    const params = new URLSearchParams({
      token: authPayload.accessToken,
      userId: authPayload.userId,
    });

    if (authPayload.email) {
      params.set("email", authPayload.email);
    }

    return `${PROTOCOL_SCHEME}://auth?${params.toString()}`;
  }

  /**
   * Generate open link for web dashboard
   */
  static generateOpenLink(page?: string, tabId?: string): string {
    const params = new URLSearchParams();

    if (page) params.set("page", page);
    if (tabId) params.set("tabId", tabId);

    const query = params.toString();
    return `${PROTOCOL_SCHEME}://open${query ? `?${query}` : ""}`;
  }
}

// Export the protocol scheme for use in electron-builder config
export { PROTOCOL_SCHEME, PROTOCOL_NAME };
