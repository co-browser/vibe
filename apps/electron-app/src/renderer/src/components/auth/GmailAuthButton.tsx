import React, { useState, useEffect, useCallback } from "react";
import { Loader2, Mail, Lock } from "lucide-react";
import { IconWithStatus } from "@/components/ui/icon-with-status";
import { GMAIL_CONFIG } from "@vibe/shared-types";

interface AuthStatus {
  authenticated: boolean;
  hasOAuthKeys: boolean;
  hasCredentials: boolean;
  error?: string;
}

interface GmailAuthButtonProps {
  isPrivyAuthenticated?: boolean;
}

/** Gmail OAuth authentication button component */
export const GmailAuthButton: React.FC<GmailAuthButtonProps> = ({
  isPrivyAuthenticated = false,
}) => {
  const [authStatus, setAuthStatus] = useState<AuthStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const checkAuthStatus = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const status = await window.vibe.app.gmail.checkAuth();
      setAuthStatus(status);
    } catch (error) {
      console.error("Error checking Gmail auth status:", error);
      setAuthStatus({
        authenticated: false,
        hasOAuthKeys: false,
        hasCredentials: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAuthenticate = async (): Promise<void> => {
    try {
      setIsAuthenticating(true);
      await window.vibe.app.gmail.startAuth();
      // Auth status will be refreshed via IPC event listener
    } catch (error) {
      console.error("Error during Gmail authentication:", error);
      setAuthStatus(prev => ({
        ...prev,
        authenticated: false,
        hasOAuthKeys: false,
        hasCredentials: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleClearAuth = async (): Promise<void> => {
    try {
      setIsAuthenticating(true);
      await window.vibe.app.gmail.clearAuth();
      await checkAuthStatus(); // Refresh status after clearing
    } catch (error) {
      console.error("Error clearing Gmail auth:", error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  useEffect(() => {
    checkAuthStatus();

    // Listen for OAuth completion events from main process
    const handleOAuthCompleted = (tabKey: string) => {
      if (tabKey === GMAIL_CONFIG.OAUTH_TAB_KEY) {
        // Delay check to ensure credentials are saved
        setTimeout(() => {
          checkAuthStatus();
        }, 1000);
      }
    };

    // Use the proper vibe tabs API for OAuth events
    const unsubscribe =
      window.vibe?.tabs?.onOAuthTabCompleted?.(handleOAuthCompleted);

    return () => {
      unsubscribe?.();
    };
  }, []);

  const getTooltipText = useCallback((): string => {
    if (isLoading) return "Checking Gmail connection...";
    if (isAuthenticating) return "Authenticating...";

    // Show lock message when Privy is not authenticated (for both local and cloud modes)
    if (!isPrivyAuthenticated) {
      return authStatus?.authenticated
        ? "Gmail connected • Sign in with CoBrowser to use"
        : "Sign in with CoBrowser first to use Gmail";
    }

    if (!authStatus?.hasOAuthKeys && authStatus?.error) return authStatus.error;
    if (authStatus?.authenticated)
      return "Gmail connected • Click to disconnect";
    return "Gmail not connected • Click to connect";
  }, [isLoading, isAuthenticating, isPrivyAuthenticated, authStatus]);

  const handleClick = (): void => {
    if (isLoading || isAuthenticating) return;

    if (authStatus?.authenticated) {
      handleClearAuth();
    } else {
      handleAuthenticate();
    }
  };

  const getStatusIndicatorStatus = ():
    | "connected"
    | "disconnected"
    | "loading" => {
    if (isLoading || isAuthenticating) return "loading";
    return authStatus?.authenticated ? "connected" : "disconnected";
  };

  // Check if we should show the lock (for both local and cloud modes)
  const shouldShowLock = !isPrivyAuthenticated;

  return (
    <div className="gmail-button-container">
      <IconWithStatus
        status={getStatusIndicatorStatus()}
        statusTitle={getTooltipText()}
        title={getTooltipText()}
        onClick={handleClick}
        variant="gmail"
        label="Gmail"
        className={authStatus?.authenticated ? "" : "disconnected"}
      >
        {isLoading || isAuthenticating ? (
          <Loader2 className="gmail-icon animate-spin" />
        ) : (
          <Mail className="gmail-icon" />
        )}
      </IconWithStatus>
      {shouldShowLock && (
        <div className="gmail-pill-lock-overlay">
          <Lock size={14} />
        </div>
      )}
    </div>
  );
};
