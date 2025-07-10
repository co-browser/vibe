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
      logger.info("Showing context menu", {
        itemCount: items.length,
        context,
        hasCoordinates: !!coordinates,
        coordinates,
        senderId: event.sender.id,
        senderType: event.sender.constructor.name,
      });

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
      const cursorPosition = coordinates || { x: 0, y: 0 };

      // If no coordinates provided, use default position
      // Note: Getting selection position via executeJavaScript was removed for security reasons
      // Callers should provide explicit coordinates when needed

      // Import the constants we need
      const GLASSMORPHISM_PADDING = 8;
      const BROWSER_CHROME_HEIGHT = 41 + 48; // TAB_BAR + NAVIGATION_BAR

      // Get the WebContentsView bounds to convert renderer coordinates to window coordinates
      let viewOffsetX = 0;
      let viewOffsetY = 0;

      // Check if this is a WebContentsView (browser tab) or the main window renderer
      const currentWindow = BrowserWindow.fromWebContents(event.sender);
      const isMainWindowRenderer =
        currentWindow && currentWindow.webContents.id === event.sender.id;

      if (!isMainWindowRenderer) {
        // This is a WebContentsView (browser tab), need to get its bounds
        // WebContentsViews are positioned with these offsets
        viewOffsetX = GLASSMORPHISM_PADDING;
        viewOffsetY = BROWSER_CHROME_HEIGHT + GLASSMORPHISM_PADDING;
        logger.debug("WebContentsView detected, applying offsets", {
          viewOffsetX,
          viewOffsetY,
        });
      } else {
        // This is the main window renderer (tab bar, nav bar, chat page, etc.)
        // Coordinates are already relative to the window, no offset needed
        logger.debug(
          "Context menu from main window renderer, no offset needed",
        );
      }

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

      // Show context menu using the utility function
      logger.debug("Using showContextMenuWithFrameMain");
      showContextMenuWithFrameMain(event.sender, menu, adjustedX, adjustedY);

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
