/**
 * Help menu items
 */

import type { MenuItemConstructorOptions } from "electron";
import { dialog, BrowserWindow } from "electron";

export function createHelpMenu(): MenuItemConstructorOptions {
  const isMac = process.platform === "darwin";

  const showKeyboardShortcutsHelp = () => {
    const modifierKey = isMac ? "⌘" : "Ctrl";
    const tabModifier = isMac ? "⌘" : "Alt";

    // Get the focused window to show dialog
    const focusedWindow = BrowserWindow.getFocusedWindow();

    if (focusedWindow) {
      dialog.showMessageBox(focusedWindow, {
        type: "info",
        title: "Keyboard Shortcuts",
        message: "Available Keyboard Shortcuts",
        detail: `Tab Navigation:
${tabModifier}+1 through ${tabModifier}+9: Switch to specific tab
${modifierKey}+T: Open new tab
${modifierKey}+Shift+N: Open new window

Navigation:
${modifierKey}+R: Reload current page
${modifierKey}+Left Arrow: Go back
${modifierKey}+Right Arrow: Go forward

Help:
F1: Show this help dialog`,
        buttons: ["OK"],
      });
    }
  };

  return {
    role: "help",
    submenu: [
      {
        label: "Keyboard Shortcuts",
        accelerator: "F1",
        click: showKeyboardShortcutsHelp,
      },
    ] as MenuItemConstructorOptions[],
  };
}
