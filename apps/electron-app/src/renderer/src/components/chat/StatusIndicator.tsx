import React, { useState, useEffect } from "react";

interface AgentStatus {
  status: string;
  ready: boolean;
  initialized: boolean;
  serviceStatus:
    | "disconnected"
    | "no_api_key"
    | "initializing"
    | "ready"
    | "processing"
    | "error";
  workerConnected?: boolean;
  isHealthy?: boolean;
  lastActivity?: number;
  error?: string;
}

interface AgentStatusIndicatorProps {
  isInitializing: boolean;
}

export const AgentStatusIndicator: React.FC<AgentStatusIndicatorProps> = ({
  isInitializing,
}) => {
  const [status, setStatus] = useState<AgentStatus | null>(null);

  useEffect(() => {
    if (!isInitializing) return;

    let cancelled = false;

    // Fetch detailed status
    window.vibe.chat
      .getAgentStatus()
      .then(status => {
        if (!cancelled) {
          setStatus(status);
        }
      })
      .catch(error => {
        console.error("Failed to fetch agent status:", error);
        if (!cancelled) {
          setStatus({
            status: "error",
            ready: false,
            initialized: false,
            serviceStatus: "error",
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isInitializing]);

  if (!isInitializing && status?.serviceStatus !== "no_api_key") return null;

  const isNoApiKey = status?.serviceStatus === "no_api_key";
  const message = isNoApiKey
    ? "OpenAI API key required - Click the OpenAI button above to add your key"
    : "Connecting to agent...";

  return (
    <div
      className="agent-init-status"
      style={{
        padding: "16px",
        textAlign: "center",
        backgroundColor: "#f8f9fa",
        borderBottom: "1px solid #e9ecef",
        fontSize: "14px",
        color: "#6c757d",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}
      >
        {!isNoApiKey && (
          <div
            style={{
              width: "16px",
              height: "16px",
              border: "2px solid #dee2e6",
              borderTop: "2px solid #007bff",
              borderRadius: "50%",
              animation: "spin 1s linear infinite",
            }}
          ></div>
        )}
        <span>{message}</span>
      </div>
    </div>
  );
};
