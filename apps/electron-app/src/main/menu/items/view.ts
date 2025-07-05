/**
 * View menu items
 */

import type { MenuItemConstructorOptions } from "electron";
import { Browser } from "@/browser/browser";
import { BrowserWindow } from "electron";

export function createViewMenu(browser: Browser): MenuItemConstructorOptions {
  const isMac = process.platform === "darwin";

  return {
    label: "View",
    submenu: [
      {
        label: "Reload",
        accelerator: isMac ? "Command+R" : "Control+R",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (!focusedWindow) return;

          // Use webContents.id for ApplicationWindow lookup (IPC routing compatibility)
          const appWindow = browser.getApplicationWindow(
            focusedWindow.webContents.id,
          );
          if (!appWindow) return;

          const activeTabKey = appWindow.tabManager.getActiveTabKey();
          if (activeTabKey) {
            const activeView = appWindow.viewManager.getView(activeTabKey);
            if (activeView && !activeView.webContents.isDestroyed()) {
              activeView.webContents.reload();
            }
          }
        },
      },
      {
        label: "Toggle Developer Tools",
        accelerator: isMac ? "Command+Option+I" : "Control+Shift+I",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (
            focusedWindow &&
            focusedWindow.webContents &&
            !focusedWindow.webContents.isDestroyed()
          ) {
            focusedWindow.webContents.toggleDevTools();
          }
        },
      },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ] as MenuItemConstructorOptions[],
  };
}
