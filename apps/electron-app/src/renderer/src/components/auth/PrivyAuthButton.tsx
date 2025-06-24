import React, { useState, useEffect } from "react";
import { Loader2, Brain } from "lucide-react";
import { IconWithStatus } from "@/components/ui/icon-with-status";
import { usePrivy, useLogin } from "@privy-io/react-auth";

/** Privy OAuth authentication button component */
export const PrivyAuthButton: React.FC = () => {
  const { ready, authenticated, user, logout, getAccessToken } = usePrivy();
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Helper to restore browser view visibility
  const restoreViewVisibility = async () => {
    try {
      const activeTabKey = await window.vibe?.tabs?.getActiveTabKey?.();
      if (activeTabKey && window.vibe?.browser?.setViewVisibility) {
        await window.vibe.browser.setViewVisibility(activeTabKey, true);
      }
    } catch (error) {
      console.error("Failed to restore browser view:", error);
    }
  };

  // Use the login hook with callbacks
  const { login } = useLogin({
    onComplete: async params => {
      console.log("Login successful", params);
      setIsAuthenticating(false);
      await restoreViewVisibility();
    },
    onError: async error => {
      console.error("Login failed or cancelled:", error);
      setIsAuthenticating(false);
      await restoreViewVisibility();
    },
  });

  // Send auth token to main process when authenticated
  useEffect(() => {
    const updateAuthToken = async () => {
      if (ready && authenticated) {
        try {
          const token = await getAccessToken();
          if (token && window.vibe?.app?.setAuthToken) {
            await window.vibe.app.setAuthToken(token);
          }
        } catch (error) {
          console.error("Failed to set auth token:", error);
        }
      } else if (ready && !authenticated && window.vibe?.app?.setAuthToken) {
        // Clear token when logged out
        await window.vibe.app.setAuthToken(null);
      }
    };

    updateAuthToken();
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
      console.error("Failed to hide browser view:", error);
    }

    login();
  };

  const handleClick = (): void => {
    if (isAuthenticating) return;
    if (authenticated) {
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
      label="Memory"
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
