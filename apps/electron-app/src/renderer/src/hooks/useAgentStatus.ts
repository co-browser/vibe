import { useEffect, useState } from "react";

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
      .catch(() => {
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
