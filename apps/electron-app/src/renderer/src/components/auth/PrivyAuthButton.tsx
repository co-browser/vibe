import React, { useState, useEffect } from "react";
import { Loader2, Brain } from "lucide-react";
import { IconWithStatus } from "@/components/ui/icon-with-status";
import { usePrivy, useLogin } from "@privy-io/react-auth";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("PrivyAuthButton");

/** Privy OAuth authentication button component */
export const PrivyAuthButton: React.FC = () => {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Log Privy state on mount and changes
  useEffect(() => {
    logger.debug("Privy state changed:", {
      ready,
      authenticated,
      userEmail: user?.email || "none",
      hasUser: !!user,
    });
  }, [ready, authenticated, user]);

  // Helper to restore browser view visibility
  const restoreViewVisibility = async () => {
    try {
      const activeTabKey = await window.vibe?.tabs?.getActiveTabKey?.();
      if (activeTabKey && window.vibe?.browser?.setViewVisibility) {
        await window.vibe.browser.setViewVisibility(activeTabKey, true);
      }
    } catch (error) {
      logger.error("Failed to restore browser view:", error);
    }
  };

  // Use the login hook with callbacks
  const { login } = useLogin({
    onComplete: async params => {
      logger.debug("Login successful", params);
      setIsAuthenticating(false);
      await restoreViewVisibility();
    },
    onError: async error => {
      logger.error("Login failed or cancelled:", error);
      setIsAuthenticating(false);
      await restoreViewVisibility();
    },
  });

  // Send auth token to main process when authenticated
  useEffect(() => {
    let isCancelled = false;

    const updateAuthToken = async () => {
      if (isCancelled) return;

      logger.debug(
        "updateAuthToken effect - ready:",
        ready,
        "authenticated:",
        authenticated,
      );

      if (!ready) {
        logger.debug("Privy not ready yet, waiting...");
        return;
      }

      if (authenticated) {
        try {
          logger.debug("User is authenticated, getting access token...");
          const token = await getAccessToken();

          // Don't log sensitive token data in production
          if (process.env.NODE_ENV === "development") {
            logger.debug(
              "Got access token from Privy:",
              token ? `present (${token.substring(0, 20)}...)` : "null",
            );
          } else {
            logger.debug(
              "Got access token from Privy:",
              token ? "present" : "null",
            );
          }

          if (isCancelled) return;

          if (token && window.vibe?.app?.setAuthToken) {
            await window.vibe.app.setAuthToken(token);
            logger.debug("Auth token sent to main process");
          } else if (!window.vibe?.app?.setAuthToken) {
            logger.error("setAuthToken method not available");
          } else if (!token) {
            logger.error(
              "No token received from getAccessToken despite being authenticated",
            );
          }
        } catch (error) {
          logger.error("Failed to get/set auth token:", error);
        }
      } else {
        // Clear token when logged out
        logger.debug("User not authenticated, clearing auth token");
        try {
          if (window.vibe?.app?.setAuthToken) {
            await window.vibe.app.setAuthToken(null);
            logger.debug("Auth token cleared");
          }
        } catch (error) {
          logger.error("Failed to clear auth token:", error);
        }
      }
    };

    updateAuthToken();

    return () => {
      isCancelled = true;
    };
  }, [ready, authenticated, getAccessToken]);

  const handleLogin = async () => {
    if (!ready || isAuthenticating) return;
    setIsAuthenticating(true);

    // Hide browser view to show Privy modal
    try {
      const activeTabKey = await window.vibe?.tabs?.getActiveTabKey?.();
      if (activeTabKey && window.vibe?.browser?.setViewVisibility) {
        await window.vibe.browser.setViewVisibility(activeTabKey, false);
      }
    } catch (error) {
      logger.error("Failed to hide browser view:", error);
    }

    login();
  };

  const handleClick = async (): Promise<void> => {
    if (isAuthenticating) return;

    logger.debug("PrivyAuthButton clicked - current state:", {
      authenticated,
      ready,
      user: user?.email,
    });

    if (authenticated) {
      // Try to get token before logout to debug
      try {
        const token = await getAccessToken();
        logger.debug("Current token before logout:", token ? "present" : "null");
      } catch (e) {
        logger.error("Failed to get token before logout:", e);
      }
      logout();
    } else {
      handleLogin();
    }
  };

  const getTooltipText = (): string => {
    if (!ready) return "Loading Privy...";
    if (isAuthenticating) return "Authenticating...";
    if (authenticated)
      return `Logged in as ${user?.email || "User"} • Click to disconnect`;
    return "Cloud RAG not connected • Click to connect";
  };

  const getStatusIndicatorStatus = ():
    | "connected"
    | "disconnected"
    | "loading" => {
    if (!ready || isAuthenticating) return "loading";
    return authenticated ? "connected" : "disconnected";
  };

  return (
    <IconWithStatus
      status={getStatusIndicatorStatus()}
      statusTitle={getTooltipText()}
      title={getTooltipText()}
      onClick={handleClick}
      variant="privy"
      label="Sign in"
      className={authenticated ? "" : "disconnected"}
    >
      {isAuthenticating ? (
        <Loader2 className="privy-icon animate-spin" />
      ) : (
        <Brain className="privy-icon" />
      )}
    </IconWithStatus>
  );
};
