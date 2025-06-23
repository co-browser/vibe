import { IpcMainInvokeEvent, IpcMainEvent } from "electron";
import { BaseIPCHandler, IPCHandlerMap, IPCListenerMap } from "./ipc-router";

/**
 * Browser IPC Handler
 *
 * Consolidates browser-related IPC operations:
 * - Window management (windows.ts)
 * - Tab operations (tabs.ts)
 * - Navigation (navigation.ts)
 * - Content extraction (content.ts)
 *
 * Replaces 5 files from browser/ directory with focused functionality.
 */
export class BrowserIPCHandler extends BaseIPCHandler {
  protected handlerName = "BrowserIPC";

  getHandlers(): IPCHandlerMap {
    return {
      // === Window Management ===
      "browser:get-window-state": this.getWindowState,
      "browser:refresh-view-layout": this.refreshViewLayout,
      "browser:get-view-visibility-states": this.getViewVisibilityStates,
      "browser:toggle-window-devtools": this.toggleWindowDevtools,
      "browser:optimize-memory": this.optimizeMemory,
      "browser:get-memory-usage": this.getMemoryUsage,

      // === Tab Operations ===
      "create-tab": this.createTab,
      "tabs:get-all": this.getAllTabs,
      "tabs:get": this.getTab,
      "tabs:get-active-key": this.getActiveTabKey,
      "tabs:get-active": this.getActiveTab,
      "tabs:get-count": this.getTabCount,
      "tabs:get-inactive": this.getInactiveTabs,
      "tabs:update": this.updateTab,
      "remove-tab": this.removeTab,
      "switch-tab": this.switchTab,
      "tabs:set-tab-agent-status": this.setTabAgentStatus,
      "tabs:reorder-tabs": this.reorderTabs,
      "tabs:refresh-state": this.refreshTabState,
      "tabs:refresh-all-states": this.refreshAllTabStates,
      "tabs:put-to-sleep": this.putTabToSleep,
      "tabs:wake-up": this.wakeUpTab,

      // === Navigation ===
      "page:navigate": this.navigateToUrl,
      "page:goBack": this.goBack,
      "page:goForward": this.goForward,
      "page:reload": this.reloadPage,

      // === Content Extraction ===
      "content:extract": this.extractContent,
      "content:get-context": this.getContentContext,
      "content:get-saved-contexts": this.getSavedContexts,
    };
  }

  getListeners(): IPCListenerMap {
    return {
      // === Window Management ===
      "browser:create-window": this.createWindow,
      "browser:close-window": this.closeWindow,

      // === Navigation ===
      "page:stop": this.stopPage,

      // === Content ===
      "add-website-context": this.addWebsiteContext,
    };
  }

  // === Window Management Implementation ===

  private async getWindowState(event: IpcMainInvokeEvent): Promise<any> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return {
        id: appWindow.window.id,
        bounds: appWindow.window.getBounds(),
        isMaximized: appWindow.window.isMaximized(),
        isMinimized: appWindow.window.isMinimized(),
        isFocused: appWindow.window.isFocused(),
      };
    } catch (error) {
      this.logError("getWindowState failed", error);
      throw error;
    }
  }

  private async refreshViewLayout(event: IpcMainInvokeEvent): Promise<void> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      appWindow.viewManager.updateBounds();
      this.log("View layout refreshed");
    } catch (error) {
      this.logError("refreshViewLayout failed", error);
      throw error;
    }
  }

  private async getViewVisibilityStates(
    event: IpcMainInvokeEvent,
  ): Promise<any> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const visibleViews = appWindow.viewManager.getVisibleViews();
      return { visibleViews };
    } catch (error) {
      this.logError("getViewVisibilityStates failed", error);
      throw error;
    }
  }

  private async toggleWindowDevtools(event: IpcMainInvokeEvent): Promise<void> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const { webContents } = appWindow.window;

      if (webContents.isDevToolsOpened()) {
        webContents.closeDevTools();
      } else {
        webContents.openDevTools();
      }
    } catch (error) {
      this.logError("toggleWindowDevtools failed", error);
      throw error;
    }
  }

  private async optimizeMemory(event: IpcMainInvokeEvent): Promise<any> {
    try {
      // Simple memory optimization - put inactive tabs to sleep
      const appWindow = this.getApplicationWindow(event.sender.id);
      const inactiveTabs = appWindow.tabManager.getInactiveTabs(5);

      let optimizedCount = 0;
      for (const tabKey of inactiveTabs) {
        if (appWindow.tabManager.putTabToSleep(tabKey)) {
          optimizedCount++;
        }
      }

      this.log(
        `Memory optimization completed: ${optimizedCount} tabs optimized`,
      );
      return { optimizedTabCount: optimizedCount };
    } catch (error) {
      this.logError("optimizeMemory failed", error);
      throw error;
    }
  }

  private async getMemoryUsage(_event: IpcMainInvokeEvent): Promise<any> {
    try {
      const memInfo = process.memoryUsage();
      return {
        heapUsed: Math.round(memInfo.heapUsed / 1024 / 1024), // MB
        heapTotal: Math.round(memInfo.heapTotal / 1024 / 1024), // MB
        external: Math.round(memInfo.external / 1024 / 1024), // MB
        rss: Math.round(memInfo.rss / 1024 / 1024), // MB
      };
    } catch (error) {
      this.logError("getMemoryUsage failed", error);
      throw error;
    }
  }

  private createWindow(): void {
    try {
      const browser = this.getBrowser();
      browser.createWindow();
      this.log("New window created");
    } catch (error) {
      this.logError("createWindow failed", error);
    }
  }

  private closeWindow(event: IpcMainEvent): void {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      appWindow.window.close();
      this.log("Window closed");
    } catch (error) {
      this.logError("closeWindow failed", error);
    }
  }

  // === Tab Operations Implementation ===

  private async createTab(
    event: IpcMainInvokeEvent,
    url?: string,
  ): Promise<string> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const tabKey = appWindow.tabManager.createTab(url);
      this.log(`Created tab: ${tabKey}`);
      return tabKey;
    } catch (error) {
      this.logError("createTab failed", error);
      throw error;
    }
  }

  private async getAllTabs(event: IpcMainInvokeEvent): Promise<any[]> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return appWindow.tabManager.getAllTabs();
    } catch (error) {
      this.logError("getAllTabs failed", error);
      throw error;
    }
  }

  private async getTab(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<any> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const tab = appWindow.tabManager.getTab(tabKey);
      if (!tab) {
        throw new Error(`Tab not found: ${tabKey}`);
      }
      return tab;
    } catch (error) {
      this.logError("getTab failed", error);
      throw error;
    }
  }

  private async getActiveTabKey(
    event: IpcMainInvokeEvent,
  ): Promise<string | null> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return appWindow.tabManager.getActiveTabKey();
    } catch (error) {
      this.logError("getActiveTabKey failed", error);
      throw error;
    }
  }

  private async getActiveTab(event: IpcMainInvokeEvent): Promise<any> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return appWindow.tabManager.getActiveTab();
    } catch (error) {
      this.logError("getActiveTab failed", error);
      throw error;
    }
  }

  private async getTabCount(event: IpcMainInvokeEvent): Promise<number> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return appWindow.tabManager.getTabCount();
    } catch (error) {
      this.logError("getTabCount failed", error);
      throw error;
    }
  }

  private async getInactiveTabs(
    event: IpcMainInvokeEvent,
    maxCount?: number,
  ): Promise<string[]> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      return appWindow.tabManager.getInactiveTabs(maxCount);
    } catch (error) {
      this.logError("getInactiveTabs failed", error);
      throw error;
    }
  }

  private async updateTab(
    event: IpcMainInvokeEvent,
    tabKey: string,
    _updates: any,
  ): Promise<void> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      appWindow.tabManager.updateTabState(tabKey);
      this.log(`Updated tab: ${tabKey}`);
    } catch (error) {
      this.logError("updateTab failed", error);
      throw error;
    }
  }

  private async removeTab(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.closeTab(tabKey);
      this.log(`Removed tab: ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("removeTab failed", error);
      throw error;
    }
  }

  private async switchTab(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.setActiveTab(tabKey);
      this.log(`Switched to tab: ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("switchTab failed", error);
      throw error;
    }
  }

  private async setTabAgentStatus(
    event: IpcMainInvokeEvent,
    tabKey: string,
    isActive: boolean,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.updateAgentStatus(tabKey, isActive);
      this.log(`Set agent status for tab ${tabKey}: ${isActive}`);
      return success;
    } catch (error) {
      this.logError("setTabAgentStatus failed", error);
      throw error;
    }
  }

  private async reorderTabs(
    event: IpcMainInvokeEvent,
    orderedKeys: string[],
  ): Promise<boolean> {
    try {
      if (!Array.isArray(orderedKeys)) {
        throw new Error("orderedKeys must be an array");
      }
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.reorderTabs(orderedKeys);
      this.log(`Reordered tabs, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("reorderTabs failed", error);
      throw error;
    }
  }

  private async refreshTabState(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.updateTabState(tabKey);
      return success;
    } catch (error) {
      this.logError("refreshTabState failed", error);
      throw error;
    }
  }

  private async refreshAllTabStates(event: IpcMainInvokeEvent): Promise<void> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const tabs = appWindow.tabManager.getAllTabs();

      for (const tab of tabs) {
        appWindow.tabManager.updateTabState(tab.key);
      }

      this.log(`Refreshed ${tabs.length} tab states`);
    } catch (error) {
      this.logError("refreshAllTabStates failed", error);
      throw error;
    }
  }

  private async putTabToSleep(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.putTabToSleep(tabKey);
      this.log(`Put tab to sleep: ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("putTabToSleep failed", error);
      throw error;
    }
  }

  private async wakeUpTab(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.wakeUpTab(tabKey);
      this.log(`Woke up tab: ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("wakeUpTab failed", error);
      throw error;
    }
  }

  // === Navigation Implementation ===

  private async navigateToUrl(
    event: IpcMainInvokeEvent,
    tabKey: string,
    url: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      if (!url || typeof url !== "string") {
        throw new Error("Invalid URL provided");
      }

      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = await appWindow.tabManager.loadUrl(tabKey, url);
      this.log(`Navigate to ${url} in tab ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("navigateToUrl failed", error);
      throw error;
    }
  }

  private async goBack(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.goBack(tabKey);
      this.log(`Go back in tab ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("goBack failed", error);
      throw error;
    }
  }

  private async goForward(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.goForward(tabKey);
      this.log(`Go forward in tab ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("goForward failed", error);
      throw error;
    }
  }

  private async reloadPage(
    event: IpcMainInvokeEvent,
    tabKey: string,
  ): Promise<boolean> {
    try {
      this.validateTabKey(tabKey);
      const appWindow = this.getApplicationWindow(event.sender.id);
      const success = appWindow.tabManager.refresh(tabKey);
      this.log(`Reload tab ${tabKey}, success: ${success}`);
      return success;
    } catch (error) {
      this.logError("reloadPage failed", error);
      throw error;
    }
  }

  private stopPage(event: IpcMainEvent): void {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const activeTab = appWindow.tabManager.getActiveTab();
      if (activeTab) {
        // Stop loading for active tab - implementation would depend on ViewManager
        this.log(`Stop loading for active tab: ${activeTab.key}`);
      }
    } catch (error) {
      this.logError("stopPage failed", error);
    }
  }

  // === Content Extraction Implementation ===

  private async extractContent(event: IpcMainInvokeEvent): Promise<any> {
    try {
      const appWindow = this.getApplicationWindow(event.sender.id);
      const activeTab = appWindow.tabManager.getActiveTab();

      if (!activeTab) {
        throw new Error("No active tab to extract content from");
      }

      // This would use the content extraction service
      // For now, return basic tab information
      return {
        url: activeTab.url,
        title: activeTab.title,
        extractedAt: Date.now(),
        // Additional content extraction would be implemented here
      };
    } catch (error) {
      this.logError("extractContent failed", error);
      throw error;
    }
  }

  private async getContentContext(
    _event: IpcMainInvokeEvent,
    url: string,
  ): Promise<any> {
    try {
      if (!url || typeof url !== "string") {
        throw new Error("Invalid URL provided");
      }

      // This would integrate with content context service
      // For now, return placeholder
      return {
        url,
        context: "Content context placeholder",
        retrievedAt: Date.now(),
      };
    } catch (error) {
      this.logError("getContentContext failed", error);
      throw error;
    }
  }

  private async getSavedContexts(_event: IpcMainInvokeEvent): Promise<any[]> {
    try {
      // This would retrieve saved contexts from storage
      // For now, return empty array
      return [];
    } catch (error) {
      this.logError("getSavedContexts failed", error);
      throw error;
    }
  }

  private addWebsiteContext(_event: IpcMainEvent, context: any): void {
    try {
      // This would save website context
      this.log("Added website context:", context?.url || "unknown");
    } catch (error) {
      this.logError("addWebsiteContext failed", error);
    }
  }
}
