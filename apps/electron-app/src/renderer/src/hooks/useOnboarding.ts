import { useState, useEffect } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("useOnboarding");

interface OnboardingStatus {
  initialized: boolean;
  hasRunBefore: boolean;
}

interface OnboardingResult {
  isFirstRun: boolean;
  needsOnboarding: boolean;
  profileCreated: boolean;
}

export function useOnboarding() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingStatus, setOnboardingStatus] =
    useState<OnboardingStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Initialize onboarding on component mount
  useEffect(() => {
    const initializeOnboarding = async () => {
      try {
        setIsLoading(true);

        // Check if onboarding is needed
        const result: OnboardingResult =
          await window.electronAPI?.ipcRenderer?.invoke(
            "onboarding:initialize",
          );

        if (result.needsOnboarding) {
          logger.info("Onboarding needed, opening modal");
          setIsOnboardingOpen(true);
        } else {
          logger.info("No onboarding needed");
        }

        // Get onboarding status
        const status: OnboardingStatus =
          await window.electronAPI?.ipcRenderer?.invoke(
            "onboarding:get-status",
          );
        setOnboardingStatus(status);
      } catch (error) {
        logger.error("Failed to initialize onboarding:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initializeOnboarding();
  }, []);

  const openOnboarding = () => {
    setIsOnboardingOpen(true);
  };

  const closeOnboarding = () => {
    setIsOnboardingOpen(false);
  };

  const refreshOnboardingStatus = async () => {
    try {
      const status: OnboardingStatus =
        await window.electronAPI?.ipcRenderer?.invoke("onboarding:get-status");
      setOnboardingStatus(status);
    } catch (error) {
      logger.error("Failed to refresh onboarding status:", error);
    }
  };

  return {
    isOnboardingOpen,
    onboardingStatus,
    isLoading,
    openOnboarding,
    closeOnboarding,
    refreshOnboardingStatus,
  };
}
