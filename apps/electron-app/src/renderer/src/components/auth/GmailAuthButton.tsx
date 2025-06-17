import React, { useState, useEffect } from "react";
import { LoadingOutlined } from "@ant-design/icons";
import { IconWithStatus } from "@/components/ui/icon-with-status";

/** Gmail SVG icon component */
const GmailIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="currentColor"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z" />
  </svg>
);

interface AuthStatus {
  authenticated: boolean;
  hasOAuthKeys: boolean;
  hasCredentials: boolean;
  error?: string;
}

/** Gmail OAuth authentication button component */
export const GmailAuthButton: React.FC = () => {
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
      if (tabKey === "oauth-gmail") {
        checkAuthStatus();
      }
    };

    // Use the proper vibe tabs API for OAuth events
    const unsubscribe =
      window.vibe?.tabs?.onOAuthTabCompleted?.(handleOAuthCompleted);

    return () => {
      unsubscribe?.();
    };
  }, []);

  const getTooltipText = (): string => {
    if (isLoading) return "Checking Gmail connection...";
    if (isAuthenticating) return "Authenticating...";
    if (!authStatus?.hasOAuthKeys && authStatus?.error) return authStatus.error;
    if (authStatus?.authenticated)
      return "Gmail connected • Click to disconnect";
    return "Gmail not connected • Click to connect";
  };

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

  return (
    <IconWithStatus
      status={getStatusIndicatorStatus()}
      statusTitle={getTooltipText()}
      title={getTooltipText()}
      onClick={handleClick}
      variant="gmail"
    >
      {isLoading || isAuthenticating ? (
        <LoadingOutlined spin className="gmail-icon" />
      ) : (
        <GmailIcon className="gmail-icon" />
      )}
    </IconWithStatus>
  );
};
