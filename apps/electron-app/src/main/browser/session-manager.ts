/**
 * Session Manager - Centralizes session management and ensures feature parity across all sessions
 */

import { app, session } from "electron";
import { EventEmitter } from "events";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "@/store/user-profile-store";

const logger = createLogger("SessionManager");

interface SessionConfig {
  cspPolicy: string;
  bluetoothHandler?: (details: any, callback: (response: any) => void) => void;
  downloadHandler?: (event: any, item: any, webContents: any) => void;
}

export class SessionManager extends EventEmitter {
  private static instance: SessionManager | null = null;
  private sessions: Map<string, Electron.Session> = new Map();
  private config: SessionConfig;

  private constructor() {
    super();

    // Define the configuration that should apply to all sessions
    const isDev = process.env.NODE_ENV === "development";
    this.config = {
      cspPolicy: isDev
        ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://localhost:5173 ws://localhost:5173 http://127.0.0.1:8000 ws://127.0.0.1:8000 https:; object-src 'none';"
        : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self' http://127.0.0.1:8000 ws://127.0.0.1:8000 https:;",
    };

    this.setupSessionHandlers();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  static getInstanceIfReady(): SessionManager | null {
    return SessionManager.instance;
  }

  /**
   * Set up handlers to track all sessions
   */
  private setupSessionHandlers(): void {
    // Apply policies to default session
    this.applyPoliciesToSession(session.defaultSession, "default");

    // Listen for new sessions created by the system
    app.on("session-created", newSession => {
      logger.info(`New session created, applying policies`);
      this.applyPoliciesToSession(newSession, "dynamic");
    });

    // Register callback with UserProfileStore for profile sessions
    const userProfileStore = useUserProfileStore.getState();
    userProfileStore.onSessionCreated((profileId, profileSession) => {
      logger.info(`Applying policies to profile session: ${profileId}`);
      this.applyPoliciesToSession(profileSession, `profile:${profileId}`);
    });

    // Apply policies to existing profile sessions
    const allSessions = userProfileStore.getAllSessions();
    for (const [profileId, profileSession] of allSessions) {
      this.applyPoliciesToSession(profileSession, `profile:${profileId}`);
    }
  }

  /**
   * Apply all policies to a session
   */
  private applyPoliciesToSession(
    targetSession: Electron.Session,
    identifier: string,
  ): void {
    logger.info(`Applying policies to session: ${identifier}`);

    // Track the session
    this.sessions.set(identifier, targetSession);

    // Apply CSP
    this.applyCsp(targetSession, identifier);

    // Apply download handler if configured
    this.applyDownloadHandler(targetSession, identifier);

    // Apply Bluetooth handler if configured
    this.applyBluetoothHandler(targetSession, identifier);

    // Emit event for other services to hook into
    this.emit("session-registered", {
      partition: identifier,
      session: targetSession,
    });
  }

  /**
   * Apply CSP to a session
   */
  private applyCsp(targetSession: Electron.Session, partition: string): void {
    logger.debug(`Applying CSP to session: ${partition}`);

    targetSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [this.config.cspPolicy],
        },
      });
    });
  }

  /**
   * Apply download handler to a session
   */
  private applyDownloadHandler(
    targetSession: Electron.Session,
    partition: string,
  ): void {
    if (!this.config.downloadHandler) return;

    logger.debug(`Applying download handler to session: ${partition}`);
    targetSession.on("will-download", this.config.downloadHandler);
  }

  /**
   * Apply Bluetooth handler to a session
   */
  private applyBluetoothHandler(
    targetSession: Electron.Session,
    partition: string,
  ): void {
    if (!this.config.bluetoothHandler) return;

    logger.debug(`Applying Bluetooth handler to session: ${partition}`);
    targetSession.setBluetoothPairingHandler(this.config.bluetoothHandler);
  }

  /**
   * Set download handler for all sessions
   */
  setDownloadHandler(
    handler: (event: any, item: any, webContents: any) => void,
  ): void {
    this.config.downloadHandler = handler;

    // Apply to all existing sessions
    this.sessions.forEach((targetSession, partition) => {
      this.applyDownloadHandler(targetSession, partition);
    });
  }

  /**
   * Set Bluetooth handler for all sessions
   */
  setBluetoothHandler(
    handler: (details: any, callback: (response: any) => void) => void,
  ): void {
    this.config.bluetoothHandler = handler;

    // Apply to all existing sessions
    this.sessions.forEach((targetSession, partition) => {
      this.applyBluetoothHandler(targetSession, partition);
    });
  }

  /**
   * Get session by partition
   */
  getSession(partition: string): Electron.Session | null {
    return this.sessions.get(partition) || null;
  }

  /**
   * Get all registered sessions
   */
  getAllSessions(): Map<string, Electron.Session> {
    return new Map(this.sessions);
  }
}

// Export singleton getter - instance created only when first accessed
export const getSessionManager = () => SessionManager.getInstance();

// For backward compatibility, but this should be migrated to use getSessionManager()
export let sessionManager: SessionManager | null = null;

// Initialize after app is ready
export function initializeSessionManager(): SessionManager {
  sessionManager = SessionManager.getInstance();
  return sessionManager;
}
