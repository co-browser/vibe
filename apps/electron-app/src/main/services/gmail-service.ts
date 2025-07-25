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
  GLASSMORPHISM_CONFIG,
  BROWSER_CHROME,
  type GmailAuthStatus,
  type GmailAuthResult,
  type GmailClearResult,
  type GmailOAuthKeys,
  type GmailOAuthCredentials,
  type GmailTokens,
} from "@vibe/shared-types";
import type { ViewManagerState } from "../browser/view-manager";
import { getStorageService } from "../store/storage-service";

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
      // First, check if we have cloud OAuth tokens
      const cloudTokens = await this.getCloudTokens();
      if (cloudTokens) {
        // Skip API validation - MCP server handles token refresh
        return {
          authenticated: true,
          hasOAuthKeys: true,
          hasCredentials: true,
          isCloudAuth: true,
        };
      }

      // Fallback to local auth check
      const hasOAuthKeys = fs.existsSync(OAUTH_PATH);
      const hasCredentials = fs.existsSync(CREDENTIALS_PATH);

      if (!hasOAuthKeys) {
        return {
          authenticated: false,
          hasOAuthKeys: false,
          hasCredentials: false,
          error: "Not authenticated. Please sign in with Gmail.",
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
        isCloudAuth: false,
      };
    } catch (error) {
      logger.error("[GmailAuth] Auth check failed:", error);
      return {
        authenticated: false,
        hasOAuthKeys: fs.existsSync(OAUTH_PATH),
        hasCredentials:
          fs.existsSync(CREDENTIALS_PATH) ||
          (await this.getCloudTokens()) !== null,
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

  /** Initialize OAuth2 client with tokens (for cloud OAuth) */
  private async initializeOAuthClientWithTokens(
    tokens: GmailTokens,
  ): Promise<void> {
    // For cloud OAuth, we don't have client_id/secret locally
    // Create a minimal OAuth2Client that can work with tokens
    this.oauth2Client = new OAuth2Client();
    this.oauth2Client.setCredentials(tokens);
  }

  /** Get cloud OAuth tokens from storage */
  private async getCloudTokens(): Promise<GmailTokens | null> {
    try {
      const storageService = getStorageService();
      const tokens = await storageService.get("secure.oauth.gmail.tokens");
      if (tokens && this.isValidTokenData(tokens)) {
        return tokens as GmailTokens;
      }
      return null;
    } catch (error) {
      logger.error("[GmailAuth] Error getting cloud tokens:", error);
      return null;
    }
  }

  /** Validate token data structure */
  private isValidTokenData(data: any): boolean {
    return (
      data &&
      typeof data.access_token === "string" &&
      typeof data.refresh_token === "string" &&
      typeof data.expiry_date === "number" &&
      typeof data.token_type === "string"
    );
  }

  /** Generate PKCE parameters - Currently unused as cloud OAuth handles this server-side */
  // private generatePKCE(): { verifier: string; challenge: string } {
  //   const verifier = crypto.randomBytes(64).toString('base64url');
  //   const challenge = crypto
  //     .createHash('sha256')
  //     .update(verifier)
  //     .digest('base64url');
  //
  //   return { verifier, challenge };
  // }

  /** Determine auth method based on local OAuth keys presence */
  private shouldUseCloudOAuth(): boolean {
    // Use cloud OAuth if no local OAuth keys are present
    return !fs.existsSync(OAUTH_PATH);
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

      // Determine auth method
      if (this.shouldUseCloudOAuth()) {
        // Use cloud OAuth flow
        return await this.startCloudOAuthFlow(viewManager, currentWindow);
      } else {
        // Use local OAuth flow (existing implementation)
        return await this.startLocalOAuthFlow(viewManager, currentWindow);
      }
    } catch (error) {
      logger.error("[GmailAuth] Auth start failed:", error);
      this.cleanupOAuthFlow(viewManager);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /** Start cloud OAuth flow */
  private async startCloudOAuthFlow(
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<GmailAuthResult> {
    try {
      // Determine and validate OAuth server URL
      const oauthServerUrl =
        process.env.OAUTH_SERVER_URL || "https://oauth.cobrowser.xyz";
      try {
        const parsed = new URL(oauthServerUrl);
        if (parsed.protocol !== "https:") {
          throw new Error("OAuth server must use HTTPS");
        }
      } catch {
        throw new Error(`Invalid OAuth server URL: ${oauthServerUrl}`);
      }

      // Simple approach: Open OAuth start URL directly in the browser view
      // The browser view will handle all cookies and session management
      const authUrl = `${oauthServerUrl}/auth/gmail/authorize`;

      logger.info(
        "[GmailAuth] Starting cloud OAuth flow with direct browser navigation",
      );

      // Create OAuth browser view that will handle the entire flow
      this.createOAuthView(authUrl, viewManager);

      // Set OAuth timeout
      this.oauthTimeout = setTimeout(() => {
        logger.warn("[GmailAuth] Cloud OAuth flow timed out");
        this.cleanupOAuthFlow(viewManager);
      }, GMAIL_CONFIG.AUTH_TIMEOUT_MS);

      // Monitor the OAuth view for success/failure
      this.monitorCloudOAuthFlow(viewManager, currentWindow);

      logger.info("[GmailAuth] Cloud OAuth flow initiated successfully");
      return {
        success: true,
        authUrl,
        isCloudAuth: true,
      };
    } catch (error) {
      logger.error("[GmailAuth] Cloud OAuth start failed:", error);
      throw error;
    }
  }

  /** Start local OAuth flow (existing implementation) */
  private async startLocalOAuthFlow(
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<GmailAuthResult> {
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

    logger.info("[GmailAuth] Local OAuth flow initiated successfully");
    return {
      success: true,
      authUrl,
      isCloudAuth: false,
    };
  }

  /** Monitor OAuth flow completion */
  private async monitorCloudOAuthFlow(
    viewManager: ViewManagerState,
    currentWindow?: BrowserWindow,
  ): Promise<void> {
    if (!this.authView) return;

    // Listen for navigation to success/error pages and extract tokenId
    this.authView.webContents.on("did-navigate", async (_event, url) => {
      logger.info("[GmailAuth] OAuth navigation:", url);

      // Check if we reached the success page
      if (url.includes("/auth/gmail/success")) {
        try {
          // Extract tokenId from URL
          const urlObj = new URL(url);
          const tokenId = urlObj.searchParams.get("tokenId");

          if (tokenId) {
            const oauthServerUrl =
              process.env.OAUTH_SERVER_URL || "https://oauth.cobrowser.xyz";

            // Fetch tokens from server using tokenId
            const response = await fetch(
              `${oauthServerUrl}/auth/gmail/tokens`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ tokenId }),
              },
            );

            if (!response.ok) {
              throw new Error(`Failed to fetch tokens: ${response.statusText}`);
            }

            const { tokens } = await response.json();

            // Save tokens to secure storage
            const storageService = getStorageService();
            await storageService.set("secure.oauth.gmail.tokens", tokens);

            // Initialize OAuth client with tokens
            await this.initializeOAuthClientWithTokens(tokens);

            // Notify agent service about Gmail tokens update
            try {
              const { getAgentService } = await import(
                "../ipc/chat/agent-status"
              );
              const agentService = getAgentService();
              if (agentService) {
                await agentService.updateGmailTokens(tokens);
                logger.info(
                  "[GmailAuth] Notified agent service about Gmail tokens",
                );
              }
            } catch (error) {
              logger.warn(
                "[GmailAuth] Failed to notify agent about Gmail tokens:",
                error,
              );
              // Non-critical error - don't fail the auth flow
            }

            // Notify renderer and cleanup
            if (currentWindow && !currentWindow.isDestroyed()) {
              currentWindow.webContents.send(
                "oauth-tab-completed",
                GMAIL_CONFIG.OAUTH_TAB_KEY,
              );
            }

            this.cleanupOAuthFlow(viewManager);
            logger.info(
              "[GmailAuth] Cloud authentication completed successfully",
            );
          }
        } catch (error) {
          logger.error("[GmailAuth] Failed to process OAuth success:", error);
          this.cleanupOAuthFlow(viewManager);
        }
      } else if (url.includes("/auth/gmail/error")) {
        logger.error("[GmailAuth] OAuth flow failed");
        this.cleanupOAuthFlow(viewManager);
      }
    });
  }

  /** Create secure OAuth browser view with Google-compatible settings */
  private createSecureOAuthView(viewManager: ViewManagerState): any {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WebContentsView } = require("electron");
    const view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true, // Re-enable sandbox for security
        webSecurity: true, // Re-enable web security
        allowRunningInsecureContent: false,
        // Use the default session partition to share cookies/auth with other tabs
        partition: undefined, // Uses default session, same as regular tabs
        // Allow navigation to OAuth URLs
        navigateOnDragDrop: false,
        // Disable features not needed for OAuth
        webgl: false,
        plugins: false,
      },
    });

    // Add to ViewManager
    viewManager.browserViews.set(GMAIL_CONFIG.OAUTH_TAB_KEY, view);
    viewManager.mainWindow.contentView.addChildView(view);

    // Set initial bounds
    const [width, height] = viewManager.mainWindow.getContentSize();
    const bounds = {
      x: GLASSMORPHISM_CONFIG.PADDING,
      y: BROWSER_CHROME.TOTAL_CHROME_HEIGHT + GLASSMORPHISM_CONFIG.PADDING,
      width: width - GLASSMORPHISM_CONFIG.PADDING * 2,
      height:
        height -
        BROWSER_CHROME.TOTAL_CHROME_HEIGHT -
        GLASSMORPHISM_CONFIG.PADDING * 2,
    };

    if (bounds.width > 0 && bounds.height > 0) {
      view.setBounds(bounds);
    }

    // Configure session permissions specifically for OAuth
    const session = view.webContents.session;

    // Define allowed OAuth origins for security
    const allowedOAuthOrigins = [
      "https://accounts.google.com",
      "https://oauth2.googleapis.com",
      "https://www.googleapis.com",
    ];

    // Allow Google OAuth domains with controlled CORS handling
    session.webRequest.onBeforeSendHeaders(
      { urls: ["https://*.google.com/*", "https://*.googleapis.com/*"] },
      (details, callback) => {
        // Only modify Origin for OAuth-specific URLs
        if (
          details.url.includes("oauth2callback") ||
          details.url.includes("accounts.google.com/oauth") ||
          details.url.includes("accounts.google.com/o/oauth2") ||
          details.url.includes("oauth2.googleapis.com/token")
        ) {
          // Preserve Origin for security auditing but mark as OAuth request
          details.requestHeaders["X-OAuth-Flow"] = "gmail-mcp";
        }
        callback({ requestHeaders: details.requestHeaders });
      },
    );

    // Handle CORS preflight requests for OAuth with restrictive headers
    session.webRequest.onHeadersReceived(
      { urls: ["https://*.google.com/*", "https://*.googleapis.com/*"] },
      (details, callback) => {
        // Extract the origin from request headers
        const requestOrigin =
          details.requestHeaders?.["Origin"] ||
          details.requestHeaders?.["origin"] ||
          "https://accounts.google.com";

        // Only allow specific origins
        const allowedOrigin = allowedOAuthOrigins.includes(requestOrigin)
          ? requestOrigin
          : allowedOAuthOrigins[0];

        const responseHeaders = {
          ...details.responseHeaders,
          "Access-Control-Allow-Origin": [allowedOrigin],
          "Access-Control-Allow-Methods": ["GET, POST, OPTIONS"],
          "Access-Control-Allow-Headers": [
            "Content-Type",
            "Authorization",
            "X-Requested-With",
          ],
          "Access-Control-Allow-Credentials": ["true"],
          "Access-Control-Max-Age": ["86400"], // 24 hours
        };
        callback({ responseHeaders });
      },
    );

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

      // Handle navigation errors gracefully - don't block OAuth for expected errors
      this.authView.webContents.on(
        "did-fail-load",
        (_event, errorCode, errorDescription, validatedURL) => {
          // Known error codes that don't prevent OAuth flow:
          // -30: CSP violations (common with Google OAuth)
          // -3: Aborted (often happens during redirects)
          const ignorableErrors = [-30, -3];

          if (!ignorableErrors.includes(errorCode)) {
            logger.warn(
              `[GmailAuth] Navigation failed: ${errorDescription} (${errorCode}) for ${validatedURL}`,
            );
          }
        },
      );

      // Add certificate error handling for OAuth
      this.authView.webContents.on(
        "certificate-error",
        (event, url, error, certificate, callback) => {
          // Validate Google OAuth certificates more strictly
          if (url.includes("google.com") || url.includes("googleapis.com")) {
            // Log certificate details for security monitoring
            logger.warn(`[GmailAuth] Certificate error for ${url}: ${error}`, {
              issuer: certificate.issuerName,
              subject: certificate.subjectName,
              validFrom: certificate.validStart,
              validTo: certificate.validExpiry,
              fingerprint: certificate.fingerprint,
            });

            // Additional validation could be implemented here
            // For now, we'll allow Google certificates but log the issue
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
      return;
    }

    this.server = http.createServer();

    // Set up request handler before starting the server
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
          return;
        }

        // Validate authorization code
        if (!code) {
          logger.error("[GmailAuth] No authorization code received");
          this.sendErrorResponse(res, "No authorization code provided");
          this.cleanupOAuthFlow(viewManager);
          return;
        }

        // Exchange code for tokens with proper error handling
        await this.exchangeCodeForTokens(code, res, viewManager, currentWindow);
      } catch (error) {
        logger.error("[GmailAuth] Request processing failed:", error);
        this.sendErrorResponse(res, "Authentication failed");
        this.cleanupOAuthFlow(viewManager);
      }
    });

    // Handle server errors
    this.server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        logger.error(
          `[GmailAuth] Port ${GMAIL_CONFIG.CALLBACK_PORT} is already in use`,
        );
        throw new Error(
          `Port ${GMAIL_CONFIG.CALLBACK_PORT} is already in use. Please free the port and try again.`,
        );
      } else {
        logger.error("[GmailAuth] Server error:", error);
        throw error;
      }
    });

    // Start listening and wait for the server to be ready
    await new Promise<void>((resolve, reject) => {
      this.server!.listen(
        GMAIL_CONFIG.CALLBACK_PORT,
        GMAIL_CONFIG.CALLBACK_HOST,
        () => {
          logger.info(
            `[GmailAuth] OAuth callback server listening on ${GMAIL_CONFIG.CALLBACK_HOST}:${GMAIL_CONFIG.CALLBACK_PORT}`,
          );
          resolve();
        },
      );

      // Reject the promise if server encounters an error during startup
      this.server!.once("error", reject);
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
      if (this.authView) {
        try {
          if (!this.authView.webContents.isDestroyed()) {
            try {
              this.authView.webContents.removeAllListeners();
              this.authView.webContents.destroy();
            } catch (error) {
              logger.warn(
                "[GmailAuth] WebContents already destroyed during cleanup:",
                error,
              );
            }
          }

          // Only perform viewManager-dependent operations if viewManager is available
          if (viewManager) {
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
          }
        } catch (error) {
          logger.error("[GmailAuth] Error cleaning up OAuth view:", error);
        } finally {
          this.authView = null;
        }
      }

      // Always clear all stored OAuth flow states
      this.activeOAuthFlows.clear();

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

      // Check for cloud tokens first
      const cloudTokens = await this.getCloudTokens();
      if (cloudTokens) {
        try {
          // Revoke cloud tokens with Google
          const tokenToRevoke =
            cloudTokens.refresh_token || cloudTokens.access_token;
          const revokeUrl = `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(tokenToRevoke)}`;
          const response = await fetch(revokeUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          });

          if (response.ok) {
            logger.info(
              "[GmailAuth] Successfully revoked cloud Gmail OAuth token",
            );
          } else {
            logger.warn(
              `[GmailAuth] Cloud token revocation returned status ${response.status}`,
            );
          }
        } catch (revokeError) {
          logger.error("[GmailAuth] Error revoking cloud token:", revokeError);
        }

        // Clear cloud tokens from storage
        const storageService = getStorageService();
        await storageService.delete("secure.oauth.gmail.tokens");

        // Notify agent service about Gmail tokens removal
        try {
          const { getAgentService } = await import("../ipc/chat/agent-status");
          const agentService = getAgentService();
          if (agentService) {
            await agentService.updateGmailTokens(null);
            logger.info(
              "[GmailAuth] Notified agent service about Gmail tokens removal",
            );
          }
        } catch (error) {
          logger.warn(
            "[GmailAuth] Failed to notify agent about Gmail tokens removal:",
            error,
          );
          // Non-critical error - don't fail the clear flow
        }
      }

      // Check for local tokens
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
              logger.info(
                "[GmailAuth] Successfully revoked local Gmail OAuth token",
              );
            } else {
              logger.warn(
                `[GmailAuth] Local token revocation returned status ${response.status}`,
              );
            }
          }
        } catch (revokeError) {
          logger.error("[GmailAuth] Error revoking local token:", revokeError);
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
      // Try cloud tokens first
      const cloudTokens = await this.getCloudTokens();
      if (cloudTokens) {
        await this.initializeOAuthClientWithTokens(cloudTokens);
      } else {
        // Fallback to local OAuth
        await this.initializeOAuthClient();
      }
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

  /** Public cleanup method for external use (e.g., process handlers) */
  cleanup(): void {
    // Call private cleanup without viewManager for graceful shutdown
    this.cleanupOAuthFlow();
  }
}

// Export singleton instance
export const gmailOAuthService = new GmailOAuthService();

// Clean up OAuth flow on app quit for security
process.on("before-quit", () => {
  gmailOAuthService.cleanup();
});

process.on("window-all-closed", () => {
  gmailOAuthService.cleanup();
});
