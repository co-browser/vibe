/**
 * File menu items
 */

import type { MenuItemConstructorOptions } from "electron";
import { Browser } from "@/browser/browser";
import { BrowserWindow } from "electron";
import { sendTabToAgent } from "@/utils/tab-agent";

export function createFileMenu(browser: Browser): MenuItemConstructorOptions {
  const isMac = process.platform === "darwin";

  return {
    label: "File",
    submenu: [
      {
        label: "New Tab",
        accelerator: isMac ? "Command+T" : "Control+T",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow) {
              appWindow.tabManager.createTab("https://www.google.com");
            }
          }
        },
      },
      {
        label: "New Window",
        accelerator: isMac ? "Command+Shift+N" : "Control+Shift+N",
        click: () => {
          browser.createWindow();
        },
      },
      { type: "separator" },
      {
        label: "Send Tab to Agent Memory",
        accelerator: isMac ? "Option+Command+M" : "Control+Alt+M",
        click: async () => {
          await sendTabToAgent(browser);
        },
      },
      { type: "separator" },
      { role: isMac ? "close" : "quit" },
    ],
  };
}
