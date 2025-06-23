/**
 * Hook to synchronize Privy authentication state with the main process
 * Ensures agent capabilities are protected by authentication
 */

import { useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";

export function useAuthSync() {
  const { ready, authenticated, user } = usePrivy();

  useEffect(() => {
    if (!ready) return; // Wait for Privy to be ready

    // Update main process with authentication state
    const updateAuthState = async () => {
      try {
        if (window.electron?.ipcRenderer) {
          window.electron.ipcRenderer.send("auth:update-state", {
            authenticated,
            userId: user?.id || null,
          });
        }
      } catch (error) {
        console.error("Failed to sync auth state:", error);
      }
    };

    updateAuthState();
  }, [ready, authenticated, user?.id]);

  // Handle logout cleanup
  useEffect(() => {
    if (!ready) return;

    if (!authenticated) {
      // User logged out, clear main process auth state
      try {
        if (window.electron?.ipcRenderer) {
          window.electron.ipcRenderer.send("auth:logout");
        }
      } catch (error) {
        console.error("Failed to handle logout sync:", error);
      }
    }
  }, [ready, authenticated]);

  return {
    ready,
    authenticated,
    user,
  };
}
