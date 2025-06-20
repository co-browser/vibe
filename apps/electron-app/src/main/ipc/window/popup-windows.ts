import { ipcMain } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("popup-windows-ipc");

/**
 * Popup window management handlers
 * Handles opening onboarding, settings, and about windows
 */

/**
 * Generic helper function for opening popup windows
 */
async function openPopupWindow(
  event: Electron.IpcMainInvokeEvent,
  windowType: 'onboarding' | 'settings' | 'about',
  openMethod: 'openOnboardingWindow' | 'openSettingsWindow' | 'openAboutWindow'
) {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      logger.error(`Cannot open ${windowType} window: sender window not found`);
      return { success: false, error: "Sender window not found" };
    }

    // Get the ApplicationWindow instance from the Browser
    const applicationWindow =
      browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      logger.error(`Cannot open ${windowType} window: ApplicationWindow not found`);
      return { success: false, error: "ApplicationWindow not found" };
    }

    const popupWindow = applicationWindow[openMethod]();
    logger.info(`${windowType.charAt(0).toUpperCase() + windowType.slice(1)} window opened successfully`);

    return {
      success: true,
      windowId: popupWindow.id,
    };
  } catch (error) {
    logger.error(`Failed to open ${windowType} window:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

ipcMain.handle("window:open-onboarding", async event => {
  return openPopupWindow(event, 'onboarding', 'openOnboardingWindow');
});

ipcMain.handle("window:open-settings", async event => {
  return openPopupWindow(event, 'settings', 'openSettingsWindow');
});

ipcMain.handle("window:open-about", async event => {
  return openPopupWindow(event, 'about', 'openAboutWindow');
});

ipcMain.handle("window:get-popup-windows", async event => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow =
      browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      return { success: false, error: "ApplicationWindow not found" };
    }

    const popupWindows = applicationWindow.getPopupWindows();

    return {
      success: true,
      popupWindows: {
        onboarding: popupWindows.onboarding
          ? {
              id: popupWindows.onboarding.id,
              isVisible:
                !popupWindows.onboarding.window.isDestroyed() &&
                popupWindows.onboarding.window.isVisible(),
            }
          : null,
        settings: popupWindows.settings
          ? {
              id: popupWindows.settings.id,
              isVisible:
                !popupWindows.settings.window.isDestroyed() &&
                popupWindows.settings.window.isVisible(),
            }
          : null,
        about: popupWindows.about
          ? {
              id: popupWindows.about.id,
              isVisible:
                !popupWindows.about.window.isDestroyed() &&
                popupWindows.about.window.isVisible(),
            }
          : null,
      },
    };
  } catch (error) {
    logger.error("Failed to get popup windows:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("window:close-all-popups", async event => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow =
      browser?.getApplicationWindowFromBrowserWindow(senderWindow);
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
});

ipcMain.handle("window:is-popup-open", async (event, windowType: string) => {
  try {
    const senderWindow = browser?.getWindowFromWebContents(event.sender);
    if (!senderWindow) {
      return { success: false, error: "Sender window not found" };
    }

    const applicationWindow =
      browser?.getApplicationWindowFromBrowserWindow(senderWindow);
    if (!applicationWindow) {
      return { success: false, error: "ApplicationWindow not found" };
    }

    const popupWindows = applicationWindow.getPopupWindows();
    let isOpen: boolean = false;

    switch (windowType) {
      case "onboarding":
        isOpen = Boolean(
          popupWindows.onboarding &&
            !popupWindows.onboarding.window.isDestroyed(),
        );
        break;
      case "settings":
        isOpen = Boolean(
          popupWindows.settings && !popupWindows.settings.window.isDestroyed(),
        );
        break;
      case "about":
        isOpen = Boolean(
          popupWindows.about && !popupWindows.about.window.isDestroyed(),
        );
        break;
      default:
        return { success: false, error: "Invalid window type" };
    }

    return { success: true, isOpen };
  } catch (error) {
    logger.error("Failed to check popup window state:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
});
