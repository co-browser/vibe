import { BrowserWindow, dialog, clipboard } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ContextMenuActions");

export class ContextMenuActionHandler {
  private static instance: ContextMenuActionHandler;

  public static getInstance(): ContextMenuActionHandler {
    if (!ContextMenuActionHandler.instance) {
      ContextMenuActionHandler.instance = new ContextMenuActionHandler();
    }
    return ContextMenuActionHandler.instance;
  }

  public async handleAction(actionId: string, ...args: any[]): Promise<void> {
    try {
      logger.debug(`Handling context menu action: ${actionId}`, args);

      switch (actionId) {
        // Browser actions
        case "browser:go-back":
          await this.handleBrowserGoBack(args[0]);
          break;
        case "browser:go-forward":
          await this.handleBrowserGoForward(args[0]);
          break;
        case "browser:reload":
          await this.handleBrowserReload(args[0]);
          break;
        case "browser:save-as":
          await this.handleBrowserSaveAs(args[0]);
          break;
        case "browser:search":
          await this.handleBrowserSearch(args[0]);
          break;
        case "browser:send-to-devices":
          await this.handleBrowserSendToDevices();
          break;
        case "browser:translate":
          await this.handleBrowserTranslate(args[0]);
          break;
        case "browser:visbug":
          await this.handleBrowserVisBug(args[0]);
          break;
        case "browser:view-source":
          await this.handleBrowserViewSource(args[0]);
          break;
        case "browser:fix-text":
          await this.handleBrowserFixText(args[0]);
          break;
        case "browser:open-link-new-tab":
          await this.handleBrowserOpenLinkNewTab(args[0]);
          break;
        case "browser:copy-link":
          await this.handleBrowserCopyLink(args[0]);
          break;

        // Tab actions
        case "tab:new-to-right":
          await this.handleTabNewToRight(args[0]);
          break;
        case "tab:reload":
          await this.handleTabReload(args[0]);
          break;
        case "tab:duplicate":
          await this.handleTabDuplicate(args[0]);
          break;
        case "tab:pin":
          await this.handleTabPin(args[0]);
          break;
        case "tab:mute":
          await this.handleTabMute(args[0]);
          break;
        case "tab:smart-close-all":
          await this.handleTabSmartCloseAll(args[0]);
          break;

        // Chat actions
        case "chat:history":
          await this.handleChatHistory();
          break;
        case "chat:suggestions":
          await this.handleChatSuggestions();
          break;
        case "chat:account":
          await this.handleChatAccount();
          break;

        default:
          logger.warn(`Unknown context menu action: ${actionId}`);
      }
    } catch (error) {
      logger.error(`Failed to handle action ${actionId}:`, error);
    }
  }

  // Browser action handlers
  private async handleBrowserGoBack(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:go-back", tabId);
    }
  }

  private async handleBrowserGoForward(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:go-forward", tabId);
    }
  }

  private async handleBrowserReload(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:reload", tabId);
    }
  }

  private async handleBrowserSaveAs(tabId: string): Promise<void> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    const result = await dialog.showSaveDialog(window, {
      title: "Save Page As",
      defaultPath: "page.html",
      filters: [
        { name: "HTML Files", extensions: ["html", "htm"] },
        { name: "All Files", extensions: ["*"] },
      ],
    });

    if (!result.canceled && result.filePath) {
      window.webContents.send("vibe:page:save-as", tabId, result.filePath);
    }
  }

  private async handleBrowserSearch(selectedText?: string): Promise<void> {
    if (selectedText) {
      const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(selectedText)}`;
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send("vibe:tabs:create", { url: searchUrl });
      }
    }
  }

  private async handleBrowserSendToDevices(): Promise<void> {
    // Placeholder for send to devices functionality
    const window = BrowserWindow.getFocusedWindow();
    if (window) {
      dialog.showMessageBox(window, {
        type: "info",
        title: "Send to Devices",
        message:
          "Send to devices functionality will be implemented in a future update.",
      });
    }
  }

  private async handleBrowserTranslate(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:translate", tabId);
    }
  }

  private async handleBrowserVisBug(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:visbug", tabId);
    }
  }

  private async handleBrowserViewSource(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:view-source", tabId);
    }
  }

  private async handleBrowserFixText(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:fix-text", tabId);
    }
  }

  private async handleBrowserOpenLinkNewTab(linkUrl: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:tabs:create", { url: linkUrl });
    }
  }

  private async handleBrowserCopyLink(linkUrl: string): Promise<void> {
    clipboard.writeText(linkUrl);
  }

  // Tab action handlers
  private async handleTabNewToRight(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:tabs:create-to-right", tabId);
    }
  }

  private async handleTabReload(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:page:reload", tabId);
    }
  }

  private async handleTabDuplicate(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:tabs:duplicate", tabId);
    }
  }

  private async handleTabPin(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:tabs:pin", tabId);
    }
  }

  private async handleTabMute(tabId: string): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:tabs:mute", tabId);
    }
  }

  private async handleTabSmartCloseAll(tabId: string): Promise<void> {
    const window = BrowserWindow.getFocusedWindow();
    if (!window) return;

    const result = await dialog.showMessageBox(window, {
      type: "question",
      title: "Smart Close All",
      message: "Close all tabs except pinned tabs?",
      buttons: ["Cancel", "Close All"],
      defaultId: 0,
      cancelId: 0,
    });

    if (result.response === 1) {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send("vibe:tabs:smart-close-all", tabId);
      }
    }
  }

  // Chat action handlers
  private async handleChatHistory(): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:chat:show-history");
    }
  }

  private async handleChatSuggestions(): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:chat:show-suggestions");
    }
  }

  private async handleChatAccount(): Promise<void> {
    const windows = BrowserWindow.getAllWindows();
    if (windows.length > 0) {
      windows[0].webContents.send("vibe:chat:show-account");
    }
  }
}

export const getContextMenuActionHandler = (): ContextMenuActionHandler => {
  return ContextMenuActionHandler.getInstance();
};
