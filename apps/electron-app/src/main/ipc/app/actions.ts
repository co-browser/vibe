import { ipcMain, clipboard } from "electron";
import {
  getContextMenuService,
  ContextMenuOptions,
} from "../../services/context-menu-service";

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
  async (_event, options: ContextMenuOptions) => {
    try {
      const contextMenuService = getContextMenuService();
      await contextMenuService.showContextMenu(options);
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
