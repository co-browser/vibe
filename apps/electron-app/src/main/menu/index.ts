/**
 * Application menu setup
 * Consolidated menu system following Apple Human Interface Guidelines
 */

import {
  Menu,
  type MenuItemConstructorOptions,
  BrowserWindow,
  dialog,
} from "electron";
import { Browser } from "@/browser/browser";
import { createLogger } from "@vibe/shared-types";
import { sendTabToAgent } from "@/utils/tab-agent";

const logger = createLogger("ApplicationMenu");

/**
 * Shows the settings modal (placeholder implementation)
 */
function showSettingsModal() {
  console.log("[Menu] showSettingsModal called");
  const focusedWindow = BrowserWindow.getFocusedWindow();
  console.log(
    "[Menu] Focused window:",
    focusedWindow ? `ID: ${focusedWindow.id}` : "none",
  );
  if (focusedWindow) {
    console.log(
      "[Menu] Sending app:show-settings-modal to window",
      focusedWindow.id,
    );
    focusedWindow.webContents.send("app:show-settings-modal");
    console.log("[Menu] IPC event sent successfully");
  } else {
    console.warn(
      "[Menu] No focused window found, cannot send settings modal event",
    );
  }
}

/**
 * Shows the downloads modal
 */
function showDownloadsModal() {
  console.log("[Menu] showDownloadsModal called");
  const focusedWindow = BrowserWindow.getFocusedWindow();
  console.log(
    "[Menu] Focused window:",
    focusedWindow ? `ID: ${focusedWindow.id}` : "none",
  );

  if (focusedWindow) {
    console.log(
      "[Menu] Sending app:show-downloads-modal to window",
      focusedWindow.id,
    );
    focusedWindow.webContents.send("app:show-downloads-modal");
    console.log("[Menu] IPC event sent successfully");
  } else {
    console.warn(
      "[Menu] No focused window found, cannot send downloads modal event",
    );
  }
}

/**
 * Shows keyboard shortcuts help dialog
 */
function showKeyboardShortcuts() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (focusedWindow) {
    dialog.showMessageBox(focusedWindow, {
      type: "info",
      title: "Keyboard Shortcuts",
      message: "Vibe Browser Keyboard Shortcuts",
      detail: `
Navigation:
⌘T / Ctrl+T - New Tab
⌘W / Ctrl+W - Close Tab
⌘R / Ctrl+R - Reload
⌘←/→ / Alt+←/→ - Back/Forward

Tabs:
⌘1-9 / Ctrl+1-9 - Switch to Tab
⌘⇧T / Ctrl+Shift+T - Reopen Closed Tab

Agent:
⌥⌘M / Ctrl+Alt+M - Send Tab to Agent

View:
⌘+ / Ctrl++ - Zoom In
⌘- / Ctrl+- - Zoom Out
⌘0 / Ctrl+0 - Reset Zoom
      `.trim(),
      buttons: ["OK"],
    });
  }
}

/**
 * Creates the consolidated application menu
 */
function createApplicationMenu(browser: Browser): MenuItemConstructorOptions[] {
  const isMac = process.platform === "darwin";

  // macOS App Menu (Vibe Browser)
  const macAppMenu: MenuItemConstructorOptions = {
    label: "Vibe Browser",
    submenu: [
      { role: "about" },
      { type: "separator" },
      {
        label: "Settings...",
        accelerator: "Command+,",
        click: showSettingsModal,
      },
      {
        label: "Downloads...",
        accelerator: "Command+Shift+D",
        click: showDownloadsModal,
      },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  // File Menu
  const fileMenu: MenuItemConstructorOptions = {
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
        click: () => browser.createWindow(),
      },
      { type: "separator" },
      {
        label: "Close Tab",
        accelerator: isMac ? "Command+W" : "Control+W",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            focusedWindow.webContents.send("window:close-active-tab");
          }
        },
      },
      { type: "separator" },
      {
        label: "Send Tab to Agent Memory",
        accelerator: isMac ? "Option+Command+M" : "Control+Alt+M",
        click: async () => await sendTabToAgent(browser),
      },
      { type: "separator" },
      ...(isMac
        ? []
        : ([
            {
              label: "Settings...",
              accelerator: "Control+,",
              click: showSettingsModal,
            },
            {
              label: "Downloads...",
              accelerator: "Control+Shift+D",
              click: showDownloadsModal,
            },
            { type: "separator" as const },
          ] as MenuItemConstructorOptions[])),
      ...(isMac ? [{ role: "close" as const }] : [{ role: "quit" as const }]),
    ],
  };

  // Edit Menu
  const editMenu: MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  // View Menu
  const viewMenu: MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      {
        label: "Reload",
        accelerator: isMac ? "Command+R" : "Control+R",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow) {
              const activeTab = appWindow.tabManager.getActiveTab();
              if (activeTab) {
                const activeTabKey = appWindow.tabManager.getActiveTabKey();
                if (activeTabKey) {
                  const view = appWindow.viewManager.getView(activeTabKey);
                  if (view && !view.webContents.isDestroyed()) {
                    view.webContents.reload();
                  }
                }
              }
            }
          }
        },
      },
      {
        label: "Force Reload",
        accelerator: isMac ? "Command+Shift+R" : "Control+Shift+R",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow) {
              const activeTab = appWindow.tabManager.getActiveTab();
              if (activeTab) {
                const activeTabKey = appWindow.tabManager.getActiveTabKey();
                if (activeTabKey) {
                  const view = appWindow.viewManager.getView(activeTabKey);
                  if (view && !view.webContents.isDestroyed()) {
                    view.webContents.reloadIgnoringCache();
                  }
                }
              }
            }
          }
        },
      },
      { type: "separator" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { role: "resetZoom" },
      { type: "separator" },
      { role: "togglefullscreen" },
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
      {
        label: "Force Close All Dialogs",
        accelerator: isMac ? "Command+Shift+Escape" : "Control+Shift+Escape",
        click: () => {
          // Force close all dialogs by accessing the dialog manager
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow && appWindow.dialogManager) {
              appWindow.dialogManager.closeAllDialogs();
            }
          }
        },
      },
    ],
  };

  // History Menu (Navigation)
  const historyMenu: MenuItemConstructorOptions = {
    label: "History",
    submenu: [
      {
        label: "Back",
        accelerator: isMac ? "Command+Left" : "Alt+Left",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow) {
              const activeTab = appWindow.tabManager.getActiveTab();
              if (activeTab) {
                appWindow.tabManager.goBack(activeTab.key);
              }
            }
          }
        },
      },
      {
        label: "Forward",
        accelerator: isMac ? "Command+Right" : "Alt+Right",
        click: () => {
          const focusedWindow = BrowserWindow.getFocusedWindow();
          if (focusedWindow) {
            const appWindow = browser.getApplicationWindow(
              focusedWindow.webContents.id,
            );
            if (appWindow) {
              const activeTab = appWindow.tabManager.getActiveTab();
              if (activeTab) {
                appWindow.tabManager.goForward(activeTab.key);
              }
            }
          }
        },
      },
    ],
  };

  // Window Menu
  const windowMenu: MenuItemConstructorOptions = {
    label: "Window",
    submenu: [
      { role: "minimize" },
      ...(isMac
        ? [
            { role: "zoom" as const },
            { role: "close" as const },
            { type: "separator" as const },
            { role: "front" as const },
          ]
        : [{ role: "close" as const }]),
    ],
  };

  // Help Menu
  const helpMenu: MenuItemConstructorOptions = {
    label: "Help",
    submenu: [
      {
        label: "Keyboard Shortcuts",
        accelerator: isMac ? "Command+/" : "Control+/",
        click: showKeyboardShortcuts,
      },
      { type: "separator" },
      {
        label: "Learn More",
        click: () => {
          import("electron").then(({ shell }) => {
            shell.openExternal("https://github.com/anthropics/vibe-browser");
          });
        },
      },
    ],
  };

  return [
    ...(isMac ? [macAppMenu] : []),
    fileMenu,
    editMenu,
    viewMenu,
    historyMenu,
    windowMenu,
    helpMenu,
  ];
}

/**
 * Sets up the application menu with browser integration
 */
export function setupApplicationMenu(browser: Browser): () => void {
  const buildMenu = () => {
    const template = createApplicationMenu(browser);
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);

    logger.info("Consolidated application menu built and set");
  };

  // Build initial menu
  buildMenu();

  // Return rebuild function for dynamic updates
  return buildMenu;
}
