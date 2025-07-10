import { app, Menu } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("CopyFix");

/**
 * Fix for Command+C copy functionality on macOS
 * Ensures proper focus and menu operations
 */
export function setupCopyFix(): void {
  // Force menu to rebuild on macOS to ensure accelerators work
  if (process.platform === "darwin") {
    app.on("browser-window-focus", () => {
      // Get current menu and set it again to refresh accelerators
      const currentMenu = Menu.getApplicationMenu();
      if (currentMenu) {
        Menu.setApplicationMenu(currentMenu);
        logger.debug("Menu refreshed on window focus");
      }
    });
  }

  // Ensure WebContentsView gets focus for copy operations
  app.on("browser-window-created", (_, window) => {
    // Add a slight delay to ensure window is fully initialized
    setTimeout(() => {
      window.webContents.on("focus", () => {
        logger.debug("Main window focused");

        // Try to focus the active WebContentsView
        const appWindow = (global as any).browser?.getApplicationWindow(
          window.webContents.id,
        );
        if (appWindow) {
          const activeTabKey = appWindow.tabManager.getActiveTabKey();
          if (activeTabKey) {
            const view = appWindow.viewManager.getView(activeTabKey);
            if (view && !view.webContents.isDestroyed()) {
              // Focus the WebContentsView to ensure copy works
              view.webContents.focus();
              logger.debug("Active view focused");
            }
          }
        }
      });
    }, 100);
  });

  logger.info("Copy fix initialized for macOS");
}
