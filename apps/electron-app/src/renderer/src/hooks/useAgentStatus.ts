import { useEffect, useState } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("useAgentStatus");

type AgentServiceStatus =
  | "disconnected"
  | "no_api_key"
  | "initializing"
  | "ready"
  | "processing"
  | "error"
  | "unknown";

interface AgentStatus {
  status: string;
  ready: boolean;
  initialized: boolean;
  serviceStatus: AgentServiceStatus;
  workerConnected?: boolean;
  isHealthy?: boolean;
  lastActivity?: number;
  error?: string;
}

// Runtime validation function
const isValidAgentStatus = (data: unknown): data is AgentStatus => {
  if (!data || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  // Check required fields
  return (
    typeof obj.status === "string" &&
    typeof obj.ready === "boolean" &&
    typeof obj.initialized === "boolean" &&
    typeof obj.serviceStatus === "string"
  );
};

export const useAgentStatus = () => {
  // Start with initializing state until we know the actual status
  const [isAgentInitializing, setIsAgentInitializing] = useState(true);
  const [agentStatus, setAgentStatus] =
    useState<AgentServiceStatus>("initializing");
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    const checkAgentStatus = async (): Promise<void> => {
      try {
        logger.debug("Checking agent status...");
        const status = await window.vibe?.chat?.getAgentStatus();
        logger.debug("Status received:", status);

        if (isValidAgentStatus(status)) {
          // Use serviceStatus for more accurate status information
          const effectiveStatus =
            status.serviceStatus ||
            (status.status as AgentServiceStatus) ||
            "unknown";
          const hasKey =
            effectiveStatus !== "no_api_key" && status.status !== "no_api_key";

          logger.debug("Effective status:", effectiveStatus, "hasKey:", hasKey);

          setAgentStatus(effectiveStatus);
          setHasApiKey(hasKey);

          // Only set initializing to false if we have a definitive status
          if (
            effectiveStatus === "no_api_key" ||
            effectiveStatus === "ready" ||
            effectiveStatus === "error"
          ) {
            setIsAgentInitializing(false);
          } else {
            setIsAgentInitializing(
              effectiveStatus === "initializing" ||
                effectiveStatus === "disconnected" ||
                status.status === "not_initialized",
            );
          }
        } else {
          // Invalid or no status returned - assume error state
          logger.warn("Invalid status data received:", status);
          setAgentStatus("error");
          setHasApiKey(false);
          setIsAgentInitializing(false);
        }
      } catch (error) {
        logger.error("Failed to get agent status:", error);
        // Set error state on exception
        setAgentStatus("error");
        setHasApiKey(false);
        setIsAgentInitializing(false);
      }
    };

    // Check initial status
    checkAgentStatus();

    // Listen for status changes
    const unsubscribeStatus = window.vibe?.chat?.onAgentStatusChanged?.(() => {
      checkAgentStatus();
    });

    // Fallback timeout with error state
    const fallbackTimeout = setTimeout(() => {
      if (isAgentInitializing) {
        logger.warn("Agent initialization timed out after 10 seconds");
        setAgentStatus("error");
        setIsAgentInitializing(false);
      }
    }, 10000);

    return () => {
      unsubscribeStatus?.();
      clearTimeout(fallbackTimeout);
    };
  }, [isAgentInitializing]);

  const isDisabled =
    !hasApiKey || isAgentInitializing || agentStatus === "error";

  logger.debug("Returning:", {
    isAgentInitializing,
    agentStatus,
    hasApiKey,
    isDisabled,
  });

  return {
    isAgentInitializing,
    agentStatus,
    hasApiKey,
    isDisabled,
    isError: agentStatus === "error",
  };
};
