import { useEffect, useState } from "react";
// Simple browser-compatible logger for renderer process
const logger = {
  info: (msg: string, ...args: any[]) =>
    console.log(`[AgentStatus] ${msg}`, ...args),
  warn: (msg: string, ...args: any[]) =>
    console.warn(`[AgentStatus] ${msg}`, ...args),
  error: (msg: string, ...args: any[]) =>
    console.error(`[AgentStatus] ${msg}`, ...args),
  debug: (msg: string, ...args: any[]) =>
    console.log(`[AgentStatus] ${msg}`, ...args),
};

export const useAgentStatus = () => {
  const [isAgentInitializing, setIsAgentInitializing] = useState(true);

  useEffect(() => {
    const handleAgentReady = (): void => {
      setIsAgentInitializing(false);
    };

    const unsubscribeStatus =
      window.vibe?.chat?.onAgentStatusChanged?.(handleAgentReady);

    window.vibe?.chat
      ?.getAgentStatus()
      .then((isReady: boolean) => {
        if (isReady) setIsAgentInitializing(false);
      })
      .catch(error => {
        logger.warn("Agent status check failed:", error);
        setTimeout(() => {
          setIsAgentInitializing(false);
        }, 3000);
      });

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
