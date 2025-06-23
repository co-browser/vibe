/**
 * Authentication verification for IPC handlers
 * Provides authentication checks for protecting agent services
 */

import { BrowserWindow } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("auth-verification");

interface AuthState {
  authenticated: boolean;
  userId?: string;
  timestamp?: number;
}

// Store authentication state per window
const authStateMap = new Map<number, AuthState>();

/**
 * Update authentication state for a window
 */
export function updateAuthState(
  webContentsId: number,
  authState: AuthState,
): void {
  authStateMap.set(webContentsId, {
    ...authState,
    timestamp: Date.now(),
  });

  logger.debug(`Auth state updated for window ${webContentsId}:`, {
    authenticated: authState.authenticated,
    userId: authState.userId,
  });
}

/**
 * Get authentication state for a window
 */
export function getAuthState(webContentsId: number): AuthState | null {
  return authStateMap.get(webContentsId) || null;
}

/**
 * Check if a window is authenticated
 */
export function isAuthenticated(webContentsId: number): boolean {
  const authState = authStateMap.get(webContentsId);

  if (!authState) {
    return false;
  }

  // Check if authentication is still valid (24 hour timeout)
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  const isValid =
    authState.authenticated &&
    typeof authState.timestamp === "number" &&
    Date.now() - authState.timestamp < TWENTY_FOUR_HOURS;

  if (!isValid && authState.authenticated) {
    // Clear expired authentication
    authStateMap.delete(webContentsId);
    logger.warn(`Authentication expired for window ${webContentsId}`);
  }

  return isValid;
}

/**
 * Clear authentication state for a window
 */
export function clearAuthState(webContentsId: number): void {
  authStateMap.delete(webContentsId);
  logger.debug(`Auth state cleared for window ${webContentsId}`);
}

/**
 * Middleware to verify authentication before IPC operations
 */
export function requireAuth(webContentsId: number): boolean {
  const authenticated = isAuthenticated(webContentsId);

  if (!authenticated) {
    logger.warn(`Unauthorized access attempt from window ${webContentsId}`);
  }

  return authenticated;
}

/**
 * Clean up authentication state when window closes
 */
export function setupAuthCleanup(): void {
  // Listen for window closed events
  const cleanup = () => {
    const allWindows = BrowserWindow.getAllWindows();
    const activeIds = allWindows.map(win => win.webContents.id);

    // Remove auth states for closed windows
    for (const [webContentsId] of authStateMap) {
      if (!activeIds.includes(webContentsId)) {
        authStateMap.delete(webContentsId);
      }
    }
  };

  // Cleanup every 5 minutes
  setInterval(cleanup, 5 * 60 * 1000);
}
