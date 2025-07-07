/**
 * Context menu implementation for WebContentsView
 * Provides right-click context menus for browser tabs
 */

import {
  Menu,
  type MenuItemConstructorOptions,
  clipboard,
  BrowserWindow,
} from "electron";
import type { WebContentsView } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ContextMenu");

export interface ContextMenuParams {
  x: number;
  y: number;
  linkURL: string;
  linkText: string;
  pageURL: string;
  frameURL: string;
  srcURL: string;
  mediaType: string;
  hasImageContents: boolean;
  isEditable: boolean;
  selectionText: string;
  titleText: string;
  misspelledWord: string;
  dictionarySuggestions: string[];
  frameCharset: string;
  inputFieldType?: string; // Make optional to match Electron's type
  menuSourceType: string;
  mediaFlags: {
    inError: boolean;
    isPaused: boolean;
    isMuted: boolean;
    hasAudio: boolean;
    isLooping: boolean;
    isControlsVisible: boolean;
    canToggleControls: boolean;
    canPrint: boolean;
    canSave: boolean;
    canShowPictureInPicture: boolean;
    isShowingPictureInPicture: boolean;
    canRotate: boolean;
  };
  editFlags: {
    canUndo: boolean;
    canRedo: boolean;
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
    canDelete: boolean;
  };
}

/**
 * Utility function to show context menus across webcontent, nav, and chat areas
 * Uses the new WebFrameMain API for better cross-platform compatibility
 */
export function showContextMenuWithFrameMain(
  webContents: Electron.WebContents,
  menu: Menu,
  x: number,
  y: number,
  frame: Electron.WebFrameMain,
): void {
  try {
    const currentWindow = BrowserWindow.fromWebContents(webContents);
    if (!currentWindow) {
      logger.warn("Main window not found for context menu");
      return;
    }
    // Use standard popup method
    menu.popup({
      window: currentWindow,
      frame,
      x,
      y,
    });
    logger.debug("Context menu shown");
  } catch (error) {
    logger.error("Failed to show context menu with WebFrameMain", { error });
    // Final fallback
    try {
      const currentWindow = BrowserWindow.fromWebContents(webContents);
      const fallbackFrame = currentWindow?.webContents.focusedFrame;

      if (currentWindow && fallbackFrame) {
        menu.popup({ window: currentWindow, x, y, frame: fallbackFrame });
      }
    } catch (fallbackError) {
      logger.error("Final fallback context menu failed", { fallbackError });
    }
  }
}

/**
 * Creates a context menu template based on the context and parameters
 */
function createContextMenuTemplate(
  view: WebContentsView,
  params: ContextMenuParams,
): MenuItemConstructorOptions[] {
  const template: MenuItemConstructorOptions[] = [];
  const webContents = view.webContents;

  // Link context menu
  if (params.linkURL) {
    template.push(
      {
        label: "Open Link",
        click: () => {
          webContents.loadURL(params.linkURL);
        },
      },
      {
        label: "Open Link in New Tab",
        click: () => {
          // Send IPC to main window to create new tab
          const mainWindow = BrowserWindow.fromWebContents(webContents);
          if (
            mainWindow &&
            !mainWindow.isDestroyed() &&
            !mainWindow.webContents.isDestroyed()
          ) {
            mainWindow.webContents.send("tab:create", params.linkURL);
          }
        },
      },
      {
        label: "Copy Link",
        click: () => {
          clipboard.writeText(params.linkURL);
        },
      },
      { type: "separator" },
    );
  }

  // Image context menu
  if (params.hasImageContents || params.srcURL) {
    template.push(
      {
        label: "Copy Image",
        click: () => {
          webContents.copyImageAt(params.x, params.y);
        },
      },
      {
        label: "Copy Image Address",
        click: () => {
          clipboard.writeText(params.srcURL);
        },
      },
      {
        label: "Save Image As...",
        click: () => {
          webContents.downloadURL(params.srcURL);
        },
      },
      { type: "separator" },
    );
  }

  // Text selection context menu
  if (params.selectionText) {
    template.push(
      {
        label: "Copy",
        enabled: params.editFlags.canCopy,
        click: () => {
          webContents.copy();
        },
      },
      {
        label:
          'Search Google for "' +
          params.selectionText.substring(0, 20) +
          (params.selectionText.length > 20 ? "..." : "") +
          '"',
        click: () => {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
          const mainWindow = BrowserWindow.fromWebContents(webContents);
          if (
            mainWindow &&
            !mainWindow.isDestroyed() &&
            !mainWindow.webContents.isDestroyed()
          ) {
            mainWindow.webContents.send("tab:create", searchUrl);
          }
        },
      },
      { type: "separator" },
    );
  }

  // Editable context menu
  if (params.isEditable) {
    template.push(
      {
        label: "Undo",
        enabled: params.editFlags.canUndo,
        click: () => {
          webContents.undo();
        },
      },
      {
        label: "Redo",
        enabled: params.editFlags.canRedo,
        click: () => {
          webContents.redo();
        },
      },
      { type: "separator" },
      {
        label: "Cut",
        enabled: params.editFlags.canCut,
        click: () => {
          webContents.cut();
        },
      },
      {
        label: "Copy",
        enabled: params.editFlags.canCopy,
        click: () => {
          webContents.copy();
        },
      },
      {
        label: "Paste",
        enabled: params.editFlags.canPaste,
        click: () => {
          webContents.paste();
        },
      },
      {
        label: "Select All",
        enabled: params.editFlags.canSelectAll,
        click: () => {
          webContents.selectAll();
        },
      },
      { type: "separator" },
    );
  }

  // Spelling suggestions
  if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
    params.dictionarySuggestions.slice(0, 5).forEach(suggestion => {
      template.push({
        label: suggestion,
        click: () => {
          webContents.replaceMisspelling(suggestion);
        },
      });
    });
    template.push({ type: "separator" });
  }

  // Default browser actions
  // Helper function to safely check navigation history
  const safeCanGoBack = (): boolean => {
    try {
      return (
        (!webContents.isDestroyed() &&
          webContents.navigationHistory?.canGoBack()) ||
        false
      );
    } catch (error) {
      logger.warn("Failed to check canGoBack, falling back to false:", error);
      return false;
    }
  };

  const safeCanGoForward = (): boolean => {
    try {
      return (
        (!webContents.isDestroyed() &&
          webContents.navigationHistory?.canGoForward()) ||
        false
      );
    } catch (error) {
      logger.warn(
        "Failed to check canGoForward, falling back to false:",
        error,
      );
      return false;
    }
  };

  template.push(
    {
      label: "Back",
      enabled: safeCanGoBack(),
      click: () => {
        try {
          if (!webContents.isDestroyed() && safeCanGoBack()) {
            webContents.goBack();
          }
        } catch (error) {
          logger.error("Failed to navigate back:", error);
        }
      },
    },
    {
      label: "Forward",
      enabled: safeCanGoForward(),
      click: () => {
        try {
          if (!webContents.isDestroyed() && safeCanGoForward()) {
            webContents.goForward();
          }
        } catch (error) {
          logger.error("Failed to navigate forward:", error);
        }
      },
    },
    {
      label: "Reload",
      click: () => {
        webContents.reload();
      },
    },
    { type: "separator" },
    {
      label: "View Page Source",
      click: () => {
        const mainWindow = BrowserWindow.fromWebContents(webContents);
        if (
          mainWindow &&
          !mainWindow.isDestroyed() &&
          !mainWindow.webContents.isDestroyed()
        ) {
          mainWindow.webContents.send(
            "tab:create",
            `view-source:${params.pageURL}`,
          );
        }
      },
    },
    {
      label: "Inspect Element",
      click: () => {
        webContents.inspectElement(params.x, params.y);
      },
    },
  );

  return template;
}

/**
 * Shows a context menu for a WebContentsView using the new WebFrameMain API
 */
export function showContextMenu(
  view: WebContentsView,
  params: ContextMenuParams,
  frame: Electron.WebFrameMain,
): void {
  try {
    const template = createContextMenuTemplate(view, params);
    const menu = Menu.buildFromTemplate(template);

    // Use the new utility function that supports WebFrameMain API
    showContextMenuWithFrameMain(
      view.webContents,
      menu,
      params.x,
      params.y,
      frame,
    );

    logger.debug("Context menu shown", {
      pageURL: params.pageURL,
      hasLink: !!params.linkURL,
      hasImage: params.hasImageContents,
      hasSelection: !!params.selectionText,
      isEditable: params.isEditable,
    });
  } catch (error) {
    logger.error("Failed to show context menu", { error });
  }
}

/**
 * Sets up context menu handlers for a WebContentsView
 */
export function setupContextMenuHandlers(view: WebContentsView): void {
  const webContents = view.webContents;

  // Handle context menu events
  webContents.on("context-menu", (event, params) => {
    event.preventDefault();
    const focusedFrame = webContents.focusedFrame;
    if (focusedFrame) {
      showContextMenu(view, params, focusedFrame);
    } else {
      logger.warn("No focused frame available for context menu");
    }
  });

  logger.debug("Context menu handlers set up for WebContentsView");
}
