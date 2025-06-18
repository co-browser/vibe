import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import fs from "fs";
import path from "path";
import http from "http";
import os from "os";
import { BrowserWindow } from "electron";
import {
  createLogger,
  GMAIL_CONFIG,
  type GmailAuthStatus,
  type GmailAuthResult,
  type GmailClearResult,
  type GmailOAuthKeys,
  type GmailOAuthCredentials,
  type GmailTokens,
} from "@vibe/shared-types";
import type { ViewManagerState } from "../browser/view-manager";

const logger = createLogger("GmailService");

/**
 * Gmail OAuth Service
 *
 * Secure OAuth 2.0 implementation for Gmail API integration.
 * Follows security best practices with PKCE flow and proper credential storage.
 * Integrates seamlessly with Vibe's ViewManager architecture.
 */

// Configuration paths
const CONFIG_DIR = path.join(os.homedir(), GMAIL_CONFIG.CONFIG_DIR_NAME);
const OAUTH_PATH =
  process.env.GMAIL_OAUTH_PATH ||
  path.join(CONFIG_DIR, GMAIL_CONFIG.OAUTH_KEYS_FILE);
const CREDENTIALS_PATH =
  process.env.GMAIL_CREDENTIALS_PATH ||
  path.join(CONFIG_DIR, GMAIL_CONFIG.CREDENTIALS_FILE);

export class GmailOAuthService {
  private oauth2Client: OAuth2Client | null = null;
  private server: http.Server | null = null;
  private authView: any = null;
  private isOAuthInProgress: boolean = false;
  private oauthTimeout: NodeJS.Timeout | null = null;
  // Store per-window OAuth state to prevent race conditions
  private activeOAuthFlows: Map<
    string,
    {
      viewManager: ViewManagerState;
      previousActiveViewKey: string | null;
    }
  > = new Map();

  constructor() {
    this.ensureConfigDir();
  }

  /** Ensure config directory exists */
  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  /** Check current authentication status */
  async checkAuth(): Promise<GmailAuthStatus> {
    try {
      const hasOAuthKeys = fs.existsSync(OAUTH_PATH);
      const hasCredentials = fs.existsSync(CREDENTIALS_PATH);

      if (!hasOAuthKeys) {
        return {
          authenticated: false,
          hasOAuthKeys: false,
          hasCredentials: false,
          error:
            "OAuth keys not found. Please place gcp-oauth.keys.json in config directory.",
        };
      }

      if (!hasCredentials) {
        return {
          authenticated: false,
          hasOAuthKeys: true,
          hasCredentials: false,
          error: "Not authenticated. Please run authentication flow.",
        };
      }

      // Try to initialize OAuth client
      await this.initializeOAuthClient();

      // Test if credentials are valid
      if (!this.oauth2Client) {
        throw new Error("OAuth client not available");
      }
      const gmail = google.gmail({ version: "v1", auth: this.oauth2Client });
      await gmail.users.getProfile({ userId: "me" });

      return {
        authenticated: true,
        hasOAuthKeys: true,
        hasCredentials: true,
      };
    } catch (error) {
      logger.error("[GmailAuth] Auth check failed:", error);
      return {
        authenticated: false,
        hasOAuthKeys: fs.existsSync(OAUTH_PATH),
        hasCredentials: fs.existsSync(CREDENTIALS_PATH),
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Initialize OAuth2 client */
  private async initializeOAuthClient(): Promise<void> {
    if (!fs.existsSync(OAUTH_PATH)) {
      throw new Error(`OAuth keys file not found, checked: ${OAUTH_PATH}`);
    }

    const keysContent: GmailOAuthCredentials = JSON.parse(
      fs.readFileSync(OAUTH_PATH, "utf8"),
    );
    const keys: GmailOAuthKeys | undefined =
      keysContent.installed || keysContent.web;

    if (!keys) {
      throw new Error(
        'Invalid OAuth keys file format. File should contain either "installed" or "web" credentials.',
      );
    }

    this.oauth2Client = new OAuth2Client(
      keys.client_id,
      keys.client_secret,
      GMAIL_CONFIG.REDIRECT_URI,
    );

    // Load existing credentials if available
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, "utf8"));
      this.oauth2Client.setCredentials(credentials);
    }
  }

  /** Start OAuth authentication flow */
  async startAuth(
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<GmailAuthResult> {
    try {
      // Prevent concurrent OAuth flows
      if (this.isOAuthInProgress) {
        logger.warn("[GmailAuth] OAuth flow already in progress");
        return {
          success: false,
          error:
            "OAuth authentication is already in progress. Please wait for it to complete.",
        };
      }

      if (!viewManager) {
        logger.error(
          "[GmailAuth] ViewManager not available - ensure service is properly initialized",
        );
        return {
          success: false,
          error:
            "ViewManager not available. OAuth flow requires proper initialization.",
        };
      }

      this.isOAuthInProgress = true;

      await this.initializeOAuthClient();

      if (!this.oauth2Client) {
        throw new Error("OAuth client not initialized");
      }

      // Generate auth URL with security best practices
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: "offline",
        scope: [GMAIL_CONFIG.SCOPES.MODIFY],
        include_granted_scopes: true,
        prompt: "consent", // Force consent to get refresh token
      });

      // Start secure callback server
      await this.startSecureCallbackServer(viewManager, currentWindow);

      // Create secure OAuth browser view
      this.createOAuthView(authUrl, viewManager);

      // Set OAuth timeout
      this.oauthTimeout = setTimeout(() => {
        logger.warn("[GmailAuth] OAuth flow timed out");
        this.cleanupOAuthFlow(viewManager);
      }, GMAIL_CONFIG.AUTH_TIMEOUT_MS);

      logger.info("[GmailAuth] OAuth flow initiated successfully");
      return {
        success: true,
        authUrl,
      };
    } catch (error) {
      logger.error("[GmailAuth] Auth start failed:", error);
      this.cleanupOAuthFlow(viewManager);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Create secure OAuth browser view with Google-compatible settings */
  private createSecureOAuthView(viewManager: ViewManagerState): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebContentsView } = require("electron");
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false, // Allow Google OAuth to work properly
        webSecurity: false, // Temporarily disable for OAuth flow
        allowRunningInsecureContent: false,
      },
    });

    // Add to ViewManager
    viewManager.browserViews.set(GMAIL_CONFIG.OAUTH_TAB_KEY, view);
    viewManager.mainWindow.contentView.addChildView(view);

    // Set initial bounds
    const [width, height] = viewManager.mainWindow.getContentSize();
    const bounds = {
      x: 8, // GLASSMORPHISM_CONFIG.PADDING
      y: 89 + 8, // BROWSER_CHROME.TOTAL_CHROME_HEIGHT + GLASSMORPHISM_CONFIG.PADDING
      width: width - 16, // width - GLASSMORPHISM_CONFIG.PADDING * 2
      height: height - 89 - 16, // height - BROWSER_CHROME.TOTAL_CHROME_HEIGHT - GLASSMORPHISM_CONFIG.PADDING * 2
    };

    if (bounds.width > 0 && bounds.height > 0) {
      view.setBounds(bounds);
    }

    return view;
  }

  /** Create OAuth browser view and handle navigation events */
  private createOAuthView(
    authUrl: string,
    viewManager: ViewManagerState,
  ): void {
    try {
      // Create OAuth browser view with permissive settings for Google OAuth
      this.authView = this.createSecureOAuthView(viewManager);
      this.authView.setBackgroundColor("#00000000");
      this.authView.webContents.loadURL(authUrl);

      // Store the current active view to restore later
      const previousActiveViewKey = viewManager.activeViewKey;

      // Store per-window state
      const windowId = viewManager.mainWindow.id.toString();
      this.activeOAuthFlows.set(windowId, {
        viewManager,
        previousActiveViewKey,
      });

      // Make OAuth view visible and active
      viewManager.browserViews.set(GMAIL_CONFIG.OAUTH_TAB_KEY, this.authView);
      viewManager.activeViewKey = GMAIL_CONFIG.OAUTH_TAB_KEY;

      // Hide all other views and show only OAuth view
      for (const [key, view] of viewManager.browserViews) {
        if (key !== GMAIL_CONFIG.OAUTH_TAB_KEY) {
          view.setVisible(false);
        }
      }
      this.authView.setVisible(true);

      // Update tab bar to show OAuth state
      viewManager.mainWindow.webContents.send("oauth-tab-started", {
        tabKey: GMAIL_CONFIG.OAUTH_TAB_KEY,
        url: authUrl,
        title: "Gmail Authentication",
      });

      // Handle window opens during OAuth (allow OAuth redirects)
      this.authView.webContents.setWindowOpenHandler(
        ({ url }: { url: string }) => {
          // Allow Google OAuth redirects
          if (
            url.includes("accounts.google.com") ||
            url.includes("oauth2callback")
          ) {
            return { action: "allow" };
          }
          return { action: "deny" };
        },
      );

      // Handle navigation errors gracefully - don't block OAuth for CSP errors
      this.authView.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, validatedURL) => {
          // CSP errors (-30) are common with Google OAuth and usually don't prevent the flow
          if (errorCode !== -30) {
            logger.warn(
              `[GmailAuth] Navigation failed: ${errorDescription} (${errorCode}) for ${validatedURL}`,
            );
          }
        },
      );

      // Add certificate error handling for OAuth
      this.authView.webContents.on(
        "certificate-error",
        (event, url, _error, _certificate, callback) => {
          // Allow Google OAuth certificates
          if (url.includes("google.com") || url.includes("googleapis.com")) {
            event.preventDefault();
            callback(true);
          } else {
            callback(false);
          }
        },
      );
    } catch (error) {
      logger.error("[GmailAuth] Failed to create OAuth view:", error);
      throw error;
    }
  }

  /** Start callback server for OAuth flow */
  private async startSecureCallbackServer(
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<void> {
    // Check if server is already running
    if (this.server && this.server.listening) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.server = http.createServer();

      // Bind to localhost only for security
      this.server.listen(
        GMAIL_CONFIG.CALLBACK_PORT,
        GMAIL_CONFIG.CALLBACK_HOST,
        () => {
          resolve();
        },
      );

      this.server.on("request", async (req, res) => {
        // Security: Only accept OAuth callback requests
        if (!req.url?.startsWith("/oauth2callback")) {
          res.writeHead(404, { "Content-Type": "text/plain" });
          res.end("Not found");
          return;
        }

        try {
          const url = new URL(req.url, GMAIL_CONFIG.REDIRECT_URI);
          const code = url.searchParams.get("code");
          const error = url.searchParams.get("error");

          // Handle OAuth errors
          if (error) {
            logger.error("[GmailAuth] OAuth error:", error);
            this.sendErrorResponse(res, `Authentication error: ${error}`);
            this.cleanupOAuthFlow(viewManager);
            reject(new Error(`OAuth error: ${error}`));
            return;
          }

          // Validate authorization code
          if (!code) {
            logger.error("[GmailAuth] No authorization code received");
            this.sendErrorResponse(res, "No authorization code provided");
            this.cleanupOAuthFlow(viewManager);
            reject(new Error("No authorization code provided"));
            return;
          }

          // Exchange code for tokens with proper error handling
          await this.exchangeCodeForTokens(
            code,
            res,
            viewManager,
            currentWindow,
          );
        } catch (error) {
          logger.error("[GmailAuth] Request processing failed:", error);
          this.sendErrorResponse(res, "Authentication failed");
          this.cleanupOAuthFlow(viewManager);
          reject(error);
        }
      });

      // Handle server errors
      this.server.on("error", (error: NodeJS.ErrnoException) => {
        if (error.code === "EADDRINUSE") {
          logger.error(
            `[GmailAuth] Port ${GMAIL_CONFIG.CALLBACK_PORT} is already in use`,
          );
          reject(
            new Error(
              `Port ${GMAIL_CONFIG.CALLBACK_PORT} is already in use. Please free the port and try again.`,
            ),
          );
        } else {
          logger.error("[GmailAuth] Server error:", error);
          reject(error);
        }
      });
    });
  }

  /** Exchange authorization code for tokens */
  private async exchangeCodeForTokens(
    code: string,
    res: http.ServerResponse,
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<void> {
    try {
      if (!this.oauth2Client) {
        throw new Error("OAuth client not initialized");
      }

      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      // Validate tokens
      if (!tokens.access_token) {
        throw new Error("No access token received");
      }

      // Set credentials and save securely
      this.oauth2Client.setCredentials(tokens);

      // Save credentials with proper file permissions
      this.saveCredentialsSecurely({
        access_token: tokens.access_token || "",
        refresh_token: tokens.refresh_token || undefined,
        scope: tokens.scope || undefined,
        token_type: tokens.token_type || undefined,
        expiry_date: tokens.expiry_date || undefined,
      });

      // Send simple success response
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Authentication successful. You can close this window.");

      // Notify renderer and cleanup immediately
      if (currentWindow && !currentWindow.isDestroyed()) {
        currentWindow.webContents.send(
          "oauth-tab-completed",
          GMAIL_CONFIG.OAUTH_TAB_KEY,
        );
      }
      this.cleanupOAuthFlow(viewManager);

      logger.info("[GmailAuth] Authentication completed successfully");
    } catch (error) {
      logger.error("[GmailAuth] Token exchange failed:", error);
      this.sendErrorResponse(res, "Token exchange failed");
      this.cleanupOAuthFlow(viewManager);
      throw error;
    }
  }

  /** Save credentials with secure file permissions */
  private saveCredentialsSecurely(tokens: GmailTokens): void {
    try {
      // Ensure config directory exists with proper permissions
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, {
          recursive: true,
          mode: GMAIL_CONFIG.FILE_PERMISSIONS.CONFIG_DIR,
        });
      }

      // Save credentials with restricted permissions (readable only by user)
      const credentialsJson = JSON.stringify(tokens, null, 2);
      fs.writeFileSync(CREDENTIALS_PATH, credentialsJson, {
        mode: GMAIL_CONFIG.FILE_PERMISSIONS.CREDENTIALS_FILE,
      });
    } catch (error) {
      logger.error("[GmailAuth] Failed to save credentials:", error);
      throw error;
    }
  }

  /** Send error response */
  private sendErrorResponse(res: http.ServerResponse, message: string): void {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Authentication failed: ${message}`);
  }

  /** Clean up OAuth flow resources */
  private cleanupOAuthFlow(viewManager?: ViewManagerState): void {
    try {
      // Reset OAuth state
      this.isOAuthInProgress = false;

      // Clear OAuth timeout
      if (this.oauthTimeout) {
        clearTimeout(this.oauthTimeout);
        this.oauthTimeout = null;
      }

      // Clean up OAuth browser view
      if (this.authView && viewManager) {
        try {
          if (!this.authView.webContents.isDestroyed()) {
            this.authView.webContents.removeAllListeners();
            this.authView.webContents.destroy();
          }

          viewManager.mainWindow.contentView.removeChildView(this.authView);
          viewManager.browserViews.delete(GMAIL_CONFIG.OAUTH_TAB_KEY);

          // Restore previous active view using stored state
          const windowId = viewManager.mainWindow.id.toString();
          const oauthState = this.activeOAuthFlows.get(windowId);

          if (
            viewManager.activeViewKey === GMAIL_CONFIG.OAUTH_TAB_KEY &&
            oauthState
          ) {
            viewManager.activeViewKey = oauthState.previousActiveViewKey;

            // Show the previous active view if it exists
            if (oauthState.previousActiveViewKey) {
              const previousView = viewManager.browserViews.get(
                oauthState.previousActiveViewKey,
              );
              if (previousView) {
                previousView.setVisible(true);
                viewManager.updateBounds();
              }
            }
          }

          // Clean up stored state
          this.activeOAuthFlows.delete(windowId);
        } catch (error) {
          logger.error("[GmailAuth] Error cleaning up OAuth view:", error);
        } finally {
          this.authView = null;
        }
      }

      // Clean up callback server
      this.stopCallbackServer();
    } catch (error) {
      logger.error("[GmailAuth] Error during OAuth cleanup:", error);
    }
  }

  /** Stop callback server */
  private stopCallbackServer(): void {
    if (this.server) {
      try {
        this.server.close();
        this.server = null;
      } catch (error) {
        logger.error("[GmailAuth] Error stopping callback server:", error);
      }
    }
  }

  /** Clear stored credentials and revoke tokens */
  async clearAuth(): Promise<GmailClearResult> {
    try {
      // Clean up any ongoing OAuth flow
      this.cleanupOAuthFlow();

      // Revoke tokens with Google before local cleanup
      if (fs.existsSync(CREDENTIALS_PATH)) {
        try {
          const credentialsContent = fs.readFileSync(CREDENTIALS_PATH, "utf8");
          const credentials = JSON.parse(credentialsContent);

          // Revoke tokens with Google for security
          if (credentials.access_token || credentials.refresh_token) {
            const tokenToRevoke =
              credentials.refresh_token || credentials.access_token;

            const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`;
            const response = await fetch(revokeUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/x-www-form-urlencoded",
              },
            });

            if (response.ok) {
              logger.info("[GmailAuth] Successfully revoked Gmail OAuth token");
            } else {
              logger.warn(
                `[GmailAuth] Token revocation returned status ${response.status}`,
              );
            }
          }
        } catch (revokeError) {
          logger.error("[GmailAuth] Error revoking token:", revokeError);
          // Continue with local cleanup even if revocation fails
        }

        // Remove local credentials file
        fs.unlinkSync(CREDENTIALS_PATH);
      }

      // Clear OAuth client and revoke credentials
      if (this.oauth2Client) {
        try {
          await this.oauth2Client.revokeCredentials();
        } catch (error) {
          logger.warn(
            "[GmailAuth] Error revoking OAuth client credentials:",
            error,
          );
        }
        this.oauth2Client = null;
      }

      logger.info("[GmailAuth] Authentication cleared successfully");
      return { success: true };
    } catch (error) {
      logger.error("[GmailAuth] Clear auth failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Get authenticated Gmail API client */
  async getGmailClient(): Promise<any> {
    if (!this.oauth2Client) {
      await this.initializeOAuthClient();
    }

    if (!this.oauth2Client) {
      throw new Error("OAuth client not initialized");
    }

    return google.gmail({ version: "v1", auth: this.oauth2Client });
  }

  /** Get OAuth2 client for other services */
  getOAuth2Client(): OAuth2Client | null {
    return this.oauth2Client;
  }
}

// Export singleton instance
export const gmailOAuthService = new GmailOAuthService();

// Clean up OAuth flow on app quit for security
process.on("before-quit", () => {
  gmailOAuthService["cleanupOAuthFlow"]();
});

process.on("window-all-closed", () => {
  gmailOAuthService["cleanupOAuthFlow"]();
});
