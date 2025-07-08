import {
  ipcMain,
  clipboard,
  Menu,
  BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";
import { showContextMenuWithFrameMain } from "../../browser/context-menu";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("actions");

/**
 * User action handlers
 * Direct approach - no registration functions needed
 */

ipcMain.on("actions:copy-text", (_event, text: string) => {
  clipboard.writeText(text);
});

ipcMain.on("actions:copy-link", (_event, url: string) => {
  clipboard.writeText(url);
});

ipcMain.handle(
  "actions:show-context-menu",
  async (
    event,
    items: any[],
    context: string = "default",
    coordinates?: { x: number; y: number },
  ) => {
    try {
      // Create menu template from items
      const template: MenuItemConstructorOptions[] = items.map(item => {
        if (item.type === "separator") {
          return { type: "separator" as const };
        }

        return {
          label: item.label,
          enabled: item.enabled !== false,
          click: () => {
            // Send the click event back to the renderer
            event.sender.send("context-menu-item-clicked", {
              id: item.id,
              context,
              data: item.data,
            });
          },
        };
      });

      const menu = Menu.buildFromTemplate(template);

      // Use provided coordinates or try to get cursor position
      let cursorPosition = coordinates || { x: 0, y: 0 };

      // If no coordinates provided, try to get selection position as fallback
      if (!coordinates) {
        try {
          cursorPosition = await event.sender.executeJavaScript(`
          (() => {
            const selection = window.getSelection();
            if (selection && selection.rangeCount > 0) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              return { x: rect.left + rect.width / 2, y: rect.bottom };
            }
            return { x: 0, y: 0 };
          })()
        `);
        } catch (error) {
          logger.warn("Failed to get cursor position from selection:", error);
        }
      }

      // Get the WebContentsView bounds to convert renderer coordinates to window coordinates
      const viewOffsetX = 0;
      const viewOffsetY = 0;

      // Check if this is a WebContentsView (browser tab) or the main window renderer
      const currentWindow = BrowserWindow.fromWebContents(event.sender);
      const isMainWindowRenderer =
        currentWindow && currentWindow.webContents.id === event.sender.id;

      if (!isMainWindowRenderer) {
        // This is a WebContentsView (browser tab), need to get its bounds
        try {
          // Try to find the WebContentsView that contains this webContents
          // Skip view bounds lookup for now - would need access to TabManager instance
          // which is not easily accessible from here
          logger.debug("Skipping view bounds lookup");
        } catch (error) {
          logger.warn("Failed to get view bounds for context menu:", error);
        }
      } else {
        // This is the main window renderer (tab bar, chat page, etc.)
        // Coordinates are already relative to the window, no offset needed
        logger.debug(
          "Context menu from main window renderer, no offset needed",
        );
      }

      // Use the new WebFrameMain API utility function for better cross-platform compatibility
      // This works across webcontent, nav, and chat areas
      const focusedFrame = event.sender.focusedFrame;

      // Add view offsets to convert from renderer coordinates to window coordinates
      const adjustedX = (cursorPosition.x || 0) + viewOffsetX;
      const adjustedY = (cursorPosition.y || 0) + viewOffsetY;

      logger.debug("Context menu positioning:", {
        originalCoords: cursorPosition,
        viewOffset: { x: viewOffsetX, y: viewOffsetY },
        adjustedCoords: { x: adjustedX, y: adjustedY },
        isMainWindowRenderer,
        hasCoordinates: !!coordinates,
        senderId: event.sender.id,
        windowId: currentWindow?.id,
      });

      if (focusedFrame) {
        showContextMenuWithFrameMain(
          event.sender,
          menu,
          adjustedX,
          adjustedY,
          focusedFrame,
        );
      } else {
        // Fallback to standard popup - try to get frame from window
        const currentWindow = BrowserWindow.fromWebContents(event.sender);
        if (currentWindow) {
          const fallbackFrame = currentWindow.webContents.focusedFrame;
          menu.popup({
            window: currentWindow,
            x: adjustedX,
            y: adjustedY,
            frame: fallbackFrame || undefined, // Include frame if available for Writing Tools support
          });
        }
      }

      return { success: true };
    } catch (error) {
      logger.error("Failed to show context menu:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
);

ipcMain.handle(
  "actions:execute",
  async (_event, actionId: string, ...args: any[]) => {
    // Action execution not implemented - return success for compatibility
    return { success: true, actionId, args };
  },
);
