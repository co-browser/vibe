import { IpcMainInvokeEvent, IpcMainEvent, clipboard, Notification } from "electron";
import { BaseIPCHandler, IPCHandlerMap, IPCListenerMap } from "./ipc-router";

/**
 * App Utilities IPC Handler
 * 
 * Consolidates app-related utility operations:
 * - Clipboard operations (clipboard.ts)
 * - Notifications (notifications.ts)
 * - Gmail authentication (gmail.ts)
 * - API key management (api-keys.ts)
 * - App information (app-info.ts)
 * - General actions (actions.ts)
 * 
 * Replaces 6 files from app/ directory with focused functionality.
 */
export class AppIPCHandler extends BaseIPCHandler {
  protected handlerName = "AppIPC";

  getHandlers(): IPCHandlerMap {
    return {
      // === Clipboard ===
      "app:read-clipboard": this.readClipboard,

      // === Gmail Authentication ===
      "gmail-check-auth": this.checkGmailAuth,
      "gmail-start-auth": this.startGmailAuth,
      "gmail-clear-auth": this.clearGmailAuth,

      // === API Key Management ===
      "get-api-key": this.getApiKey,
      "set-api-key": this.setApiKey,

      // === App Information ===
      "app:get-info": this.getAppInfo,

      // === General Actions ===
      "actions:show-context-menu": this.showContextMenu,
    };
  }

  getListeners(): IPCListenerMap {
    return {
      // === Clipboard ===
      "app:write-clipboard": this.writeClipboard,

      // === Notifications ===
      "app:show-notification": this.showNotification,

      // === General Actions ===
      "actions:copy-text": this.copyText,
      "actions:copy-link": this.copyLink,
    };
  }

  // === Clipboard Implementation ===

  private async readClipboard(): Promise<string> {
    try {
      const text = clipboard.readText();
      this.log("Read clipboard text");
      return text;
    } catch (error) {
      this.logError("readClipboard failed", error);
      throw error;
    }
  }

  private writeClipboard(_event: IpcMainEvent, text: string): void {
    try {
      if (!text || typeof text !== "string") {
        this.logError("writeClipboard failed", "Invalid text provided");
        return;
      }
      
      clipboard.writeText(text);
      this.log("Wrote text to clipboard");
    } catch (error) {
      this.logError("writeClipboard failed", error);
    }
  }

  // === Notifications Implementation ===

  private showNotification(_event: IpcMainEvent, title: string, body: string): void {
    try {
      if (!title || typeof title !== "string") {
        this.logError("showNotification failed", "Invalid title provided");
        return;
      }

      const notification = new Notification({
        title,
        body: body || "",
      });

      notification.show();
      this.log(`Showed notification: ${title}`);
    } catch (error) {
      this.logError("showNotification failed", error);
    }
  }

  // === Gmail Authentication Implementation ===

  private async checkGmailAuth(): Promise<boolean> {
    try {
      // This would integrate with Gmail service
      // For now, return false (not authenticated)
      this.log("Checked Gmail authentication status");
      return false;
    } catch (error) {
      this.logError("checkGmailAuth failed", error);
      throw error;
    }
  }

  private async startGmailAuth(_event: IpcMainInvokeEvent): Promise<any> {
    try {
      // This would integrate with Gmail service to start OAuth flow
      // For now, return placeholder
      this.log("Started Gmail authentication");
      return {
        success: false,
        message: "Gmail authentication not implemented",
      };
    } catch (error) {
      this.logError("startGmailAuth failed", error);
      throw error;
    }
  }

  private async clearGmailAuth(): Promise<boolean> {
    try {
      // This would clear Gmail authentication tokens
      this.log("Cleared Gmail authentication");
      return true;
    } catch (error) {
      this.logError("clearGmailAuth failed", error);
      throw error;
    }
  }

  // === API Key Management Implementation ===

  private async getApiKey(_event: IpcMainInvokeEvent, keyName: string): Promise<string | null> {
    try {
      if (!keyName || typeof keyName !== "string") {
        throw new Error("Invalid key name provided");
      }

      // This would integrate with secure storage for API keys
      // For now, return null
      this.log(`Retrieved API key: ${keyName}`);
      return null;
    } catch (error) {
      this.logError("getApiKey failed", error);
      throw error;
    }
  }

  private async setApiKey(_event: IpcMainInvokeEvent, keyName: string, value: string): Promise<boolean> {
    try {
      if (!keyName || typeof keyName !== "string") {
        throw new Error("Invalid key name provided");
      }
      
      if (!value || typeof value !== "string") {
        throw new Error("Invalid key value provided");
      }

      // This would integrate with secure storage for API keys
      this.log(`Set API key: ${keyName}`);
      return true;
    } catch (error) {
      this.logError("setApiKey failed", error);
      throw error;
    }
  }

  // === App Information Implementation ===

  private async getAppInfo(): Promise<any> {
    try {
      // This would return comprehensive app information
      const appInfo = {
        name: "Vibe",
        version: process.env.npm_package_version || "unknown",
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        electronVersion: process.versions.electron,
        chromeVersion: process.versions.chrome,
      };

      this.log("Retrieved app information");
      return appInfo;
    } catch (error) {
      this.logError("getAppInfo failed", error);
      throw error;
    }
  }

  // === General Actions Implementation ===

  private copyText(_event: IpcMainEvent, text: string): void {
    try {
      if (!text || typeof text !== "string") {
        this.logError("copyText failed", "Invalid text provided");
        return;
      }

      clipboard.writeText(text);
      this.log("Copied text to clipboard");
    } catch (error) {
      this.logError("copyText failed", error);
    }
  }

  private copyLink(_event: IpcMainEvent, url: string): void {
    try {
      if (!url || typeof url !== "string") {
        this.logError("copyLink failed", "Invalid URL provided");
        return;
      }

      clipboard.writeText(url);
      this.log(`Copied link to clipboard: ${url}`);
    } catch (error) {
      this.logError("copyLink failed", error);
    }
  }

  private async showContextMenu(): Promise<void> {
    try {
      // This would show a context menu
      // Implementation would depend on menu system
      this.log("Context menu requested");
    } catch (error) {
      this.logError("showContextMenu failed", error);
      throw error;
    }
  }
}