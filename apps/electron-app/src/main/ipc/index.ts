import type { Browser } from "@/browser/browser";
import { createLogger } from "@vibe/shared-types";
import { useUserProfileStore } from "@/store/user-profile-store";

const logger = createLogger("ipc-handlers");

// App APIs - direct imports (register themselves)
import "@/ipc/app/app-info";
import "@/ipc/app/clipboard";
import "@/ipc/app/notifications";
import "@/ipc/app/actions";
import "@/ipc/app/gmail";
import "@/ipc/app/api-keys";
import "@/ipc/app/modals";
import "@/ipc/app/tray-control";
import "@/ipc/app/password-paste";
import "@/ipc/app/hotkey-control";

// Chat APIs - direct imports (register themselves)
import "@/ipc/chat/chat-messaging";
import "@/ipc/chat/agent-status";
import "@/ipc/chat/chat-history";
import "@/ipc/chat/tab-context";

// Session APIs - direct imports (register themselves)
import "@/ipc/session/state-management";
import "@/ipc/session/session-persistence";
import { setupSessionStateSync } from "@/ipc/session/state-sync";

// Settings APIs - direct imports (register themselves)
import "@/ipc/settings/settings-management";

// Window APIs - direct imports (register themselves)
import "@/ipc/window/window-state";
import "@/ipc/window/window-interface";
import "@/ipc/window/chat-panel";

// Browser APIs - direct imports (register themselves)
import { setupBrowserEventForwarding } from "@/ipc/browser/events";
import "@/ipc/browser/tabs";
import "@/ipc/browser/windows";
import "@/ipc/browser/navigation";
import "@/ipc/browser/content";
import { downloads } from "@/ipc/browser/download";
import { registerPasswordAutofillHandlers } from "@/ipc/browser/password-autofill";

// MCP APIs - direct imports (register themselves)
import "@/ipc/mcp/mcp-status";

// User APIs
import { registerProfileHistoryHandlers } from "@/ipc/user/profile-history";

// Settings APIs - Password handlers for settings dialog
import { registerPasswordHandlers } from "@/ipc/settings/password-handlers";

// Profile APIs
import { registerTopSitesHandlers } from "@/ipc/profile/top-sites";

/**
 * Registers all IPC handlers
 */
export function registerAllIpcHandlers(browser: Browser): () => void {
  logger.info("Registering all IPC handlers");

  // Setup browser event forwarding (needs browser instance)
  setupBrowserEventForwarding();

  // Register user profile handlers
  registerProfileHistoryHandlers();

  // Register password handlers for settings dialog
  registerPasswordHandlers();

  // Register password autofill handlers for browser content
  registerPasswordAutofillHandlers();

  // Register top sites handlers
  registerTopSitesHandlers();

  // Initialize downloads service
  downloads.init();

  // Test downloads service
  logger.info("Downloads service test:", {
    downloadsInitialized: true,
    profileStoreReady: useUserProfileStore.getState().isStoreReady(),
    activeProfile: useUserProfileStore.getState().getActiveProfile()?.id,
  });

  // Setup session state sync (broadcasts to all windows)
  let sessionUnsubscribe: (() => void) | null = null;
  try {
    sessionUnsubscribe = setupSessionStateSync(browser);
  } catch {
    // Browser not ready yet, setup will work when windows exist
    logger.info("Browser not ready, setting up session sync without browser");
    sessionUnsubscribe = setupSessionStateSync();
  }

  // Return cleanup function
  return () => {
    logger.info("Unregistering all IPC handlers");
    sessionUnsubscribe?.(); // Clean up session subscription
  };
}

// Legacy handlers completely removed - migration complete ✅
