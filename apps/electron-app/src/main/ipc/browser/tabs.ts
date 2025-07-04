import { ipcMain } from "electron";
import { browser } from "@/index";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("TabsIPC");

/**
 * Tab management IPC handlers
 * Window-specific approach using event.sender.id auto-detection
 */

// Tab creation
ipcMain.handle("create-tab", async (event, url?: string) => {
  try {
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      throw new Error("No application window found");
    }

    const tabKey = appWindow.tabManager.createTab(url);

    if (!appWindow.window.webContents.isDestroyed()) {
      appWindow.window.webContents.send("tab-created", tabKey);
    }

    return tabKey;
  } catch (error) {
    logger.error("Failed to create tab:", error);
    throw error;
  }
});

// Tab queries
ipcMain.handle("tabs:get-all", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getAllTabs() || [];
});

ipcMain.handle("tabs:get", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getTab(tabKey) || null;
});

ipcMain.handle("tabs:get-active-key", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getActiveTabKey() || null;
});

ipcMain.handle("tabs:get-active", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getActiveTab() || null;
});

ipcMain.handle("tabs:get-count", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getTabCount() || 0;
});

ipcMain.handle("tabs:get-inactive", async (event, maxCount?: number) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.getInactiveTabs(maxCount) || [];
});

// Tab operations
ipcMain.handle("tabs:update", async (event, tabKey: string, _updates: any) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return false;

  // TabManager doesn't expose direct property updates - trigger state refresh instead
  return appWindow.tabManager.updateTabState(tabKey);
});

ipcMain.handle("remove-tab", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  appWindow?.tabManager.closeTab(tabKey);
});

ipcMain.handle("switch-tab", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  appWindow?.tabManager.setActiveTab(tabKey);
});

ipcMain.handle(
  "tabs:move-tab",
  async (event, tabKey: string, newPosition: number) => {
    try {
      const appWindow = browser?.getApplicationWindow(event.sender.id);
      if (!appWindow) {
        throw new Error("No application window found");
      }

      const result = appWindow.tabManager.moveTab(tabKey, newPosition);
      if (!result) {
        throw new Error(`Failed to move tab ${tabKey}`);
      }

      return result;
    } catch (error) {
      logger.error("Failed to move tab:", error);
      throw error;
    }
  },
);

ipcMain.handle("tabs:reorder-tabs", async (event, orderedKeys: string[]) => {
  try {
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      throw new Error("No application window found");
    }

    const result = appWindow.tabManager.reorderTabs(orderedKeys);
    if (!result) {
      throw new Error("Failed to reorder tabs");
    }

    return result;
  } catch (error) {
    logger.error("Failed to reorder tabs:", error);
    throw error;
  }
});

// Tab state management
ipcMain.handle("tabs:refresh-state", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.updateTabState(tabKey);
});

ipcMain.handle("tabs:refresh-all-states", async event => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  if (!appWindow) return false;

  const tabs = appWindow.tabManager.getAllTabs();
  for (const tab of tabs) {
    appWindow.tabManager.updateTabState(tab.key);
  }
  return true;
});

// Sleep management
ipcMain.handle("tabs:put-to-sleep", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.putTabToSleep(tabKey);
});

ipcMain.handle("tabs:wake-up", async (event, tabKey: string) => {
  const appWindow = browser?.getApplicationWindow(event.sender.id);
  return appWindow?.tabManager.wakeUpTab(tabKey);
});

// Context menu tab creation handler
ipcMain.on("tab:create", async (event, url?: string) => {
  try {
    const appWindow = browser?.getApplicationWindow(event.sender.id);
    if (!appWindow) {
      logger.error("No application window found for context menu tab creation");
      return;
    }

    const tabKey = appWindow.tabManager.createTab(url);

    if (!appWindow.window.webContents.isDestroyed()) {
      appWindow.window.webContents.send("tab-created", tabKey);
    }

    logger.debug("Tab created from context menu", { url, tabKey });
  } catch (error) {
    logger.error("Failed to create tab from context menu:", error);
  }
});
