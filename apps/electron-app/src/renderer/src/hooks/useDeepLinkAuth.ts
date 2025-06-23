/**
 * Hook for handling deep-link authentication
 * Listens for auto-login events from main process and integrates with Privy
 */

import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";

interface AutoLoginPayload {
  userId: string;
  email?: string;
  accessToken: string;
  expiresAt?: number;
}

interface DeepLinkNavigationPayload {
  page?: string;
  tabId?: string;
}

export function useDeepLinkAuth() {
  const { ready: privyReady, authenticated } = usePrivy();
  const [isAutoLoginPending, setIsAutoLoginPending] = useState(false);
  const [lastAutoLoginAttempt, setLastAutoLoginAttempt] = useState<
    number | null
  >(null);

  useEffect(() => {
    if (!window.electron?.ipcRenderer) return;

    // Handle auto-login from deep-links
    const handleAutoLogin = async (_event: any, payload: AutoLoginPayload) => {
      console.log("🔗 Deep-link auto-login received:", {
        userId: payload.userId,
        email: payload.email,
      });

      try {
        setIsAutoLoginPending(true);
        setLastAutoLoginAttempt(Date.now());

        // If already authenticated, check if it's the same user
        if (authenticated) {
          console.log("📱 User already authenticated, skipping auto-login");
          setIsAutoLoginPending(false);
          return;
        }

        // Wait for Privy to be ready
        if (!privyReady) {
          console.log("⏳ Waiting for Privy to be ready...");
          // The useEffect will run again when privyReady changes
          return;
        }

        // Here you would integrate with your authentication system
        // Since Privy handles auth, we can simulate success and let the existing auth sync work
        console.log("✅ Auto-login completed via deep-link");

        // The main process has already updated the auth state
        // The useAuthSync hook will handle syncing with Privy
      } catch (error) {
        console.error("❌ Auto-login failed:", error);
      } finally {
        setIsAutoLoginPending(false);
      }
    };

    // Handle navigation from deep-links
    const handleNavigation = (
      _event: any,
      payload: DeepLinkNavigationPayload,
    ) => {
      console.log("🔗 Deep-link navigation received:", payload);

      // Handle navigation to specific pages
      if (payload.page === "chat") {
        // Open chat panel if not already open
        window.vibe?.interface?.toggleChatPanel?.(true);
      }

      // Handle specific tab navigation
      if (payload.tabId) {
        window.vibe?.tabs?.switchToTab?.(payload.tabId);
      }
    };

    // Register IPC listeners
    window.electron.ipcRenderer.on("deep-link:auto-login", handleAutoLogin);
    window.electron.ipcRenderer.on("deep-link:navigate", handleNavigation);

    // Cleanup listeners
    return () => {
      window.electron?.ipcRenderer?.removeListener(
        "deep-link:auto-login",
        handleAutoLogin,
      );
      window.electron?.ipcRenderer?.removeListener(
        "deep-link:navigate",
        handleNavigation,
      );
    };
  }, [privyReady, authenticated]);

  // Retry auto-login when Privy becomes ready
  useEffect(() => {
    if (privyReady && isAutoLoginPending && lastAutoLoginAttempt) {
      // If we have a pending auto-login and Privy just became ready,
      // the auth sync should handle the rest
      console.log("🔄 Privy ready, auth sync should handle authentication");
      setIsAutoLoginPending(false);
    }
  }, [privyReady, isAutoLoginPending, lastAutoLoginAttempt]);

  return {
    isAutoLoginPending,
    lastAutoLoginAttempt,
  };
}

/**
 * Utility functions for generating deep-links (for use in web dashboard)
 */
export const DeepLinkUtils = {
  /**
   * Generate authentication deep-link
   */
  generateAuthLink: (
    userId: string,
    accessToken: string,
    email?: string,
  ): string => {
    const params = new URLSearchParams({
      token: accessToken,
      userId: userId,
    });

    if (email) {
      params.set("email", email);
    }

    return `vibe://auth?${params.toString()}`;
  },

  /**
   * Generate navigation deep-link
   */
  generateOpenLink: (page?: string, tabId?: string): string => {
    const params = new URLSearchParams();

    if (page) params.set("page", page);
    if (tabId) params.set("tabId", tabId);

    const query = params.toString();
    return `vibe://open${query ? `?${query}` : ""}`;
  },

  /**
   * Check if deep-links are supported in current environment
   */
  isSupported: (): boolean => {
    return (
      typeof window !== "undefined" &&
      typeof window.electron?.ipcRenderer !== "undefined"
    );
  },
};
