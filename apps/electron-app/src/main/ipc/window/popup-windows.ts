import { ipcMain } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("popup-windows-ipc");

/**
 * Popup window management handlers
 * Handles opening onboarding, settings, and about windows
 */

ipcMain.handle("window:open-onboarding", async (event) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      logger.error("Cannot open onboarding window: sender window not found");
      return { success: false, error: "Sender window not found" };
    }

    // Get the ApplicationWindow instance from the Browser
    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      logger.error("Cannot open onboarding window: ApplicationWindow not found");
      return { success: false, error: "ApplicationWindow not found" };
    }

    const onboardingWindow = applicationWindow.openOnboardingWindow();
    logger.info("Onboarding window opened successfully");
    
    return { 
      success: true, 
      windowId: onboardingWindow.id 
    };
  } catch (error) {
    logger.error("Failed to open onboarding window:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle("window:open-settings", async (event) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      logger.error("Cannot open settings window: sender window not found");
      return { success: false, error: "Sender window not found" };
    }

    // Get the ApplicationWindow instance from the Browser
    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      logger.error("Cannot open settings window: ApplicationWindow not found");
      return { success: false, error: "ApplicationWindow not found" };
    }

    const settingsWindow = applicationWindow.openSettingsWindow();
    logger.info("Settings window opened successfully");
    
    return { 
      success: true, 
      windowId: settingsWindow.id 
    };
  } catch (error) {
    logger.error("Failed to open settings window:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle("window:open-about", async (event) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      logger.error("Cannot open about window: sender window not found");
      return { success: false, error: "Sender window not found" };
    }

    // Get the ApplicationWindow instance from the Browser
    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      logger.error("Cannot open about window: ApplicationWindow not found");
      return { success: false, error: "ApplicationWindow not found" };
    }

    const aboutWindow = applicationWindow.openAboutWindow();
    logger.info("About window opened successfully");
    
    return { 
      success: true, 
      windowId: aboutWindow.id 
    };
  } catch (error) {
    logger.error("Failed to open about window:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle("window:get-popup-windows", async (event) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      return { success: false, error: "ApplicationWindow not found" };
    }

    const popupWindows = applicationWindow.getPopupWindows();
    
    return {
      success: true,
      popupWindows: {
        onboarding: popupWindows.onboarding ? {
          id: popupWindows.onboarding.id,
          isVisible: !popupWindows.onboarding.window.isDestroyed() && popupWindows.onboarding.window.isVisible()
        } : null,
        settings: popupWindows.settings ? {
          id: popupWindows.settings.id,
          isVisible: !popupWindows.settings.window.isDestroyed() && popupWindows.settings.window.isVisible()
        } : null,
        about: popupWindows.about ? {
          id: popupWindows.about.id,
          isVisible: !popupWindows.about.window.isDestroyed() && popupWindows.about.window.isVisible()
        } : null,
      }
    };
  } catch (error) {
    logger.error("Failed to get popup windows:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle("window:close-all-popups", async (event) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      return { success: false, error: "ApplicationWindow not found" };
    }

    applicationWindow.closeAllPopupWindows();
    logger.info("All popup windows closed successfully");
    
    return { success: true };
  } catch (error) {
    logger.error("Failed to close popup windows:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});

ipcMain.handle("window:is-popup-open", async (event, windowType: string) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow = browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      return { success: false, error: "ApplicationWindow not found" };
    }

    const popupWindows = applicationWindow.getPopupWindows();
    let isOpen = false;

    switch (windowType) {
      case "onboarding":
        isOpen = popupWindows.onboarding && !popupWindows.onboarding.window.isDestroyed();
        break;
      case "settings":
        isOpen = popupWindows.settings && !popupWindows.settings.window.isDestroyed();
        break;
      case "about":
        isOpen = popupWindows.about && !popupWindows.about.window.isDestroyed();
        break;
      default:
        return { success: false, error: "Invalid window type" };
    }
    
    return { success: true, isOpen };
  } catch (error) {
    logger.error("Failed to check popup window state:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    };
  }
});