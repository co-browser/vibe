import {
  Menu,
  BrowserWindow,
  MenuItemConstructorOptions,
  ipcMain,
} from "electron";
import { createLogger } from "@vibe/shared-types";
import { getContextMenuActionHandler } from "./context-menu-actions";

const logger = createLogger("ContextMenuService");

export interface ContextMenuOptions {
  type: "browser" | "tab" | "chat";
  x: number;
  y: number;
  windowId: number;
  tabId?: string;
  elementInfo?: {
    isInput?: boolean;
    isLink?: boolean;
    linkUrl?: string;
    selectedText?: string;
    canGoBack?: boolean;
    canGoForward?: boolean;
    isLoading?: boolean;
  };
}

export class ContextMenuService {
  private static instance: ContextMenuService;
  private actionHandler = getContextMenuActionHandler();

  public static getInstance(): ContextMenuService {
    if (!ContextMenuService.instance) {
      ContextMenuService.instance = new ContextMenuService();
      ContextMenuService.instance.setupIpcListeners();
    }
    return ContextMenuService.instance;
  }

  private setupIpcListeners(): void {
    // Listen for context menu actions from renderer
    ipcMain.on(
      "context-menu:action",
      async (_event, actionId: string, ...args: any[]) => {
        await this.actionHandler.handleAction(actionId, ...args);
      },
    );
  }

  public async showContextMenu(options: ContextMenuOptions): Promise<void> {
    try {
      const window = BrowserWindow.fromId(options.windowId);
      if (!window) {
        logger.error("Window not found for context menu");
        return;
      }

      let menuTemplate: MenuItemConstructorOptions[] = [];

      switch (options.type) {
        case "browser":
          menuTemplate = this.createBrowserContextMenu(options);
          break;
        case "tab":
          menuTemplate = this.createTabContextMenu(options);
          break;
        case "chat":
          menuTemplate = this.createChatContextMenu();
          break;
        default:
          logger.warn("Unknown context menu type:", options.type);
          return;
      }

      const menu = Menu.buildFromTemplate(menuTemplate);
      menu.popup({
        window,
        x: options.x,
        y: options.y,
      });

      logger.debug(`Context menu shown for type: ${options.type}`);
    } catch (error) {
      logger.error("Failed to show context menu:", error);
    }
  }

  private createBrowserContextMenu(
    options: ContextMenuOptions,
  ): MenuItemConstructorOptions[] {
    const { elementInfo } = options;
    const menuItems: MenuItemConstructorOptions[] = [];

    // Navigation items
    menuItems.push(
      {
        label: "Back",
        enabled: elementInfo?.canGoBack || false,
        click: () => this.executeAction("browser:go-back", options.tabId),
      },
      {
        label: "Forward",
        enabled: elementInfo?.canGoForward || false,
        click: () => this.executeAction("browser:go-forward", options.tabId),
      },
      {
        label: "Reload",
        click: () => this.executeAction("browser:reload", options.tabId),
      },
      { type: "separator" },
    );

    // Page actions
    menuItems.push(
      {
        label: "Save As...",
        click: () => this.executeAction("browser:save-as", options.tabId),
      },
      {
        label: "Search",
        click: () =>
          this.executeAction("browser:search", elementInfo?.selectedText),
      },
      {
        label: "Send to Your Devices",
        click: () =>
          this.executeAction("browser:send-to-devices", options.tabId),
      },
      {
        label: "Translate to English",
        click: () => this.executeAction("browser:translate", options.tabId),
      },
      { type: "separator" },
    );

    // Developer tools
    menuItems.push(
      {
        label: "VisBug",
        click: () => this.executeAction("browser:visbug", options.tabId),
      },
      {
        label: "View Page Source",
        click: () => this.executeAction("browser:view-source", options.tabId),
      },
    );

    // Input field specific actions
    if (elementInfo?.isInput) {
      menuItems.push(
        { type: "separator" },
        {
          label: "Fix Text",
          click: () => this.executeAction("browser:fix-text", options.tabId),
        },
      );
    }

    // Link specific actions
    if (elementInfo?.isLink && elementInfo.linkUrl) {
      menuItems.push(
        { type: "separator" },
        {
          label: "Open Link in New Tab",
          click: () =>
            this.executeAction(
              "browser:open-link-new-tab",
              elementInfo.linkUrl,
            ),
        },
        {
          label: "Copy Link Address",
          click: () =>
            this.executeAction("browser:copy-link", elementInfo.linkUrl),
        },
      );
    }

    return menuItems;
  }

  private createTabContextMenu(
    options: ContextMenuOptions,
  ): MenuItemConstructorOptions[] {
    return [
      {
        label: "New Tab to the Right",
        click: () => this.executeAction("tab:new-to-right", options.tabId),
      },
      { type: "separator" },
      {
        label: "Reload",
        click: () => this.executeAction("tab:reload", options.tabId),
      },
      {
        label: "Duplicate",
        click: () => this.executeAction("tab:duplicate", options.tabId),
      },
      { type: "separator" },
      {
        label: "Pin",
        click: () => this.executeAction("tab:pin", options.tabId),
      },
      {
        label: "Mute Site",
        click: () => this.executeAction("tab:mute", options.tabId),
      },
      { type: "separator" },
      {
        label: "Smart Close All...",
        click: () => this.executeAction("tab:smart-close-all", options.tabId),
      },
    ];
  }

  private createChatContextMenu(): MenuItemConstructorOptions[] {
    return [
      {
        label: "Chat History",
        click: () => this.executeAction("chat:history"),
      },
      {
        label: "Suggestions",
        click: () => this.executeAction("chat:suggestions"),
      },
      { type: "separator" },
      {
        label: "Account",
        click: () => this.executeAction("chat:account"),
      },
    ];
  }

  private async executeAction(actionId: string, ...args: any[]): Promise<void> {
    await this.actionHandler.handleAction(actionId, ...args);
  }
}

export const getContextMenuService = (): ContextMenuService => {
  return ContextMenuService.getInstance();
};
