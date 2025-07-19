import React, { useState, useEffect } from "react";
import { X } from "lucide-react";
import "@/components/styles/PrivyAuthTooltip.css";

interface PrivyAuthTooltipProps {
  isPrivyAuthenticated: boolean;
  useLocalGmailServer: boolean | null;
}

export const PrivyAuthTooltip: React.FC<PrivyAuthTooltipProps> = ({
  isPrivyAuthenticated,
  useLocalGmailServer,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  // Reset dismissed state when transitioning to authenticated
  useEffect(() => {
    if (isPrivyAuthenticated && isDismissed) {
      setIsDismissed(false);
    }
  }, [isPrivyAuthenticated, isDismissed]);

  // Show tooltip only when:
  // 1. Not authenticated with Privy
  // 2. Using cloud Gmail server
  // 3. Not dismissed by user
  const shouldShow =
    !isPrivyAuthenticated && useLocalGmailServer === false && !isDismissed;

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="privy-auth-tooltip">
      <div className="privy-auth-tooltip-content">
        <span className="privy-auth-tooltip-text">
          Sign in with CoBrowser to use cloud services
        </span>
        <button
          className="privy-auth-tooltip-close"
          onClick={() => setIsDismissed(true)}
          aria-label="Dismiss tooltip"
        >
          <X size={14} />
        </button>
      </div>
      <div className="privy-auth-tooltip-arrow" />
    </div>
  );
};
