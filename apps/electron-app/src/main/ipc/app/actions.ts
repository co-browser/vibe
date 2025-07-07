import {
  ipcMain,
  clipboard,
  Menu,
  BrowserWindow,
  type MenuItemConstructorOptions,
} from "electron";
import { showContextMenuWithFrameMain } from "../../browser/context-menu";

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
  async (event, items: any[], context: string = "default") => {
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

      // Get cursor position from the renderer
      const cursorPosition = await event.sender.executeJavaScript(`
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

      // Use the new WebFrameMain API utility function for better cross-platform compatibility
      // This works across webcontent, nav, and chat areas
      const focusedFrame = event.sender.focusedFrame;
      if (focusedFrame) {
        showContextMenuWithFrameMain(
          event.sender,
          menu,
          cursorPosition.x || 0,
          cursorPosition.y || 0,
          focusedFrame,
        );
      } else {
        // Fallback to standard popup without frame for Writing Tools support
        const currentWindow = BrowserWindow.fromWebContents(event.sender);
        if (currentWindow) {
          menu.popup({
            window: currentWindow,
            x: cursorPosition.x || 0,
            y: cursorPosition.y || 0,
          });
        }
      }

      return { success: true };
    } catch (error) {
      console.error("Failed to show context menu:", error);
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
