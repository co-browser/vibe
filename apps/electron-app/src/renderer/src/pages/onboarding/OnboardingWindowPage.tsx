import { useState, useEffect } from "react";
import { createLogger } from "@vibe/shared-types";
import { OnboardingModal } from "../../components/onboarding/OnboardingModal";

const logger = createLogger("OnboardingWindowPage");

export function OnboardingWindowPage() {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(true);

  // Get detected browsers on component mount
  useEffect(() => {
    const getBrowsers = async () => {
      try {
        const browsers = await window.electronAPI?.ipcRenderer?.invoke(
          "onboarding:get-browsers",
        );
        if (browsers) {
          // Store browsers for potential future use
          logger.debug("Detected browsers:", browsers);
        }
      } catch (error) {
        logger.error("Failed to get detected browsers:", error);
      }
    };

    getBrowsers();
  }, []);

  const handleCloseOnboarding = async () => {
    try {
      // Complete the onboarding process
      await window.electronAPI?.ipcRenderer?.invoke("onboarding:complete-window");
      setIsOnboardingOpen(false);
    } catch (error) {
      logger.error("Failed to complete onboarding:", error);
      // Even if completion fails, close the window
      await window.electronAPI?.ipcRenderer?.invoke("onboarding:close-window");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        onClose={handleCloseOnboarding}
      />

      {/* Fallback content (should not be visible when modal is open) */}
      {!isOnboardingOpen && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Onboarding Complete
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              Welcome to Vibe Browser! The window will close automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
