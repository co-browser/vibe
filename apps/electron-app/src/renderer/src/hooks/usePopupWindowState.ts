import { useState, useEffect } from "react";

export type PopupWindowType = "onboarding" | "settings" | "about";

export interface PopupWindowStates {
  onboarding: boolean;
  settings: boolean;
  about: boolean;
}

/**
 * Custom hook to track popup window states
 * Automatically updates when windows are opened/closed
 */
export function usePopupWindowState() {
  const [windowStates, setWindowStates] = useState<PopupWindowStates>({
    onboarding: false,
    settings: false,
    about: false,
  });

  const [isLoading, setIsLoading] = useState(true);

  // Check initial window states
  useEffect(() => {
    const checkInitialStates = async () => {
      try {
        const [onboardingResult, settingsResult, aboutResult] =
          await Promise.all([
            window.vibe.interface.isPopupWindowOpen("onboarding"),
            window.vibe.interface.isPopupWindowOpen("settings"),
            window.vibe.interface.isPopupWindowOpen("about"),
          ]);

        setWindowStates({
          onboarding: onboardingResult.success
            ? onboardingResult.isOpen
            : false,
          settings: settingsResult.success ? settingsResult.isOpen : false,
          about: aboutResult.success ? aboutResult.isOpen : false,
        });
      } catch (error) {
        console.error("Failed to check initial popup window states:", error);
      } finally {
        setIsLoading(false);
      }
    };

    checkInitialStates();
  }, []);

  // Set up event listeners for real-time updates
  useEffect(() => {
    const handleWindowOpened = (data: { type: string; windowId: number }) => {
      if (["onboarding", "settings", "about"].includes(data.type)) {
        setWindowStates(prev => ({
          ...prev,
          [data.type]: true,
        }));
      }
    };

    const handleWindowClosed = (data: { type: string; windowId: number }) => {
      if (["onboarding", "settings", "about"].includes(data.type)) {
        setWindowStates(prev => ({
          ...prev,
          [data.type]: false,
        }));
      }
    };

    // Set up event listeners
    const unsubscribeOpened =
      window.vibe.interface.onPopupWindowOpened(handleWindowOpened);
    const unsubscribeClosed =
      window.vibe.interface.onPopupWindowClosed(handleWindowClosed);

    // Cleanup on unmount
    return () => {
      unsubscribeOpened();
      unsubscribeClosed();
    };
  }, []);

  // Helper functions to open windows with error handling
  const openWindow = async (windowType: PopupWindowType) => {
    try {
      let result;
      switch (windowType) {
        case "onboarding":
          result = await window.vibe.interface.openOnboardingWindow();
          break;
        case "settings":
          result = await window.vibe.interface.openSettingsWindow();
          break;
        case "about":
          result = await window.vibe.interface.openAboutWindow();
          break;
      }
      return result;
    } catch (error) {
      console.error(`Failed to open ${windowType} window:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  // Helper function to check if a specific window is open
  const isWindowOpen = (windowType: PopupWindowType): boolean => {
    return windowStates[windowType];
  };

  // Helper function to close all popup windows
  const closeAllWindows = async () => {
    try {
      return await window.vibe.interface.closeAllPopupWindows();
    } catch (error) {
      console.error("Failed to close all popup windows:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };

  return {
    windowStates,
    isLoading,
    isWindowOpen,
    openWindow,
    closeAllWindows,
    // Individual window openers for convenience
    openOnboarding: () => openWindow("onboarding"),
    openSettings: () => openWindow("settings"),
    openAbout: () => openWindow("about"),
  };
}

export default usePopupWindowState;
