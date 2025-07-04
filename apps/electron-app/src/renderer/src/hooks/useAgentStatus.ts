import { useEffect, useState } from "react";

export const useAgentStatus = () => {
  const [isAgentInitializing, setIsAgentInitializing] = useState(true);

  useEffect(() => {
    // Check agent status immediately
    const checkStatus = async () => {
      try {
        const isReady = await window.vibe?.chat?.getAgentStatus();
        setIsAgentInitializing(!isReady);
      } catch {
        // On error, assume agent is initializing
        setIsAgentInitializing(true);
      }
    };

    checkStatus();

    // Listen for status changes
    const handleAgentReady = (): void => {
      setIsAgentInitializing(false);
    };

    const unsubscribeStatus =
      window.vibe?.chat?.onAgentStatusChanged?.(handleAgentReady);

    // Fallback timeout to prevent infinite loading
    const fallbackTimeout = setTimeout(() => {
      setIsAgentInitializing(false);
    }, 10000);

    return () => {
      unsubscribeStatus?.();
      clearTimeout(fallbackTimeout);
    };
  }, []);

  return {
    isAgentInitializing,
  };
};
