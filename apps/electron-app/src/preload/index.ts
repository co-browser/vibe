/**
 * Preload script for Electron
 * Provides secure communication between renderer and main processes
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";
import { electronAPI } from "@electron-toolkit/preload";
import "@sentry/electron/preload";

// Import shared vibe types
import { TabState, createLogger } from "@vibe/shared-types";

// Import vibe API interfaces
import { VibeAppAPI } from "@vibe/shared-types";
import { VibeActionsAPI } from "@vibe/shared-types";

const logger = createLogger("preload");
import { VibeBrowserAPI } from "@vibe/shared-types";
import { VibeTabsAPI } from "@vibe/shared-types";
import { VibePageAPI } from "@vibe/shared-types";
import { VibeContentAPI } from "@vibe/shared-types";
import { VibeInterfaceAPI } from "@vibe/shared-types";
import { VibeChatAPI } from "@vibe/shared-types";
import { VibeSettingsAPI } from "@vibe/shared-types";
import { VibeSessionAPI } from "@vibe/shared-types";
import { VibeUpdateAPI } from "@vibe/shared-types";

/**
 * Gets the window type from command line arguments
 * Used to determine if this is a popup window (onboarding, settings, about)
 */
function getWindowType(): string | null {
  try {
    // Check process.argv for --window-type=<type>
    const args = process.argv || [];
    for (const arg of args) {
      if (arg.startsWith("--window-type=")) {
        const windowType = arg.split("=")[1];
        if (["onboarding", "settings", "about"].includes(windowType)) {
          return windowType;
        }
      }
    }
    return null;
  } catch (error) {
    logger.error("Error getting window type:", error);
    return null;
  }
}

/**
 * Gets the detected browsers from command line arguments
 * Used in onboarding window to show only available browsers
 */
function getDetectedBrowsers(): any[] {
  try {
    // Check process.argv for --detected-browsers=<json>
    const args = process.argv || [];
    for (const arg of args) {
      if (arg.startsWith("--detected-browsers=")) {
        const browsersJson = arg.split("=")[1];
        return JSON.parse(browsersJson);
      }
    }
    return [];
  } catch (error) {
    logger.error("Error getting detected browsers:", error);
    return [];
  }
}

/**
 * Validates if a key is a non-empty string
 * @param key The key to validate
 * @returns True if the key is a valid string, false otherwise
 */
function isValidKey(key: unknown): key is string {
  return typeof key === "string" && key.trim().length > 0;
}

/**
 * Validates if a URL is properly formatted
 * @param url The URL to validate
 * @returns True if the URL is valid, false otherwise
 */
function isValidUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;

  try {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      new URL(url);
      return true;
    }
    new URL(`https://${url}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates an event listener helper
 */
function createEventListener(
  channel: string,
  callback: (...args: any[]) => void,
): () => void {
  const listener = (_event: IpcRendererEvent, ...args: any[]): void => {
    callback(...args);
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

// APP API IMPLEMENTATION
const appAPI: VibeAppAPI = {
  getAppInfo: async () => {
    return ipcRenderer.invoke("app:get-info");
  },
  getPlatform: () => process.platform,
  writeToClipboard: (text: string) => {
    ipcRenderer.send("app:write-clipboard", text);
  },
  readFromClipboard: async () => {
    return ipcRenderer.invoke("app:read-clipboard");
  },
  showNotification: (title: string, body: string) => {
    ipcRenderer.send("app:show-notification", title, body);
  },
  getProcessVersions: () => {
    return {
      electron: process.versions.electron || "",
      chrome: process.versions.chrome || "",
      node: process.versions.node || "",
      ...Object.fromEntries(
        Object.entries(process.versions).map(([key, value]) => [
          key,
          value || "",
        ]),
      ),
    };
  },
  gmail: {
    checkAuth: () => ipcRenderer.invoke("gmail-check-auth"),
    startAuth: () => ipcRenderer.invoke("gmail-start-auth"),
    clearAuth: () => ipcRenderer.invoke("gmail-clear-auth"),
  },
  apiKeys: {
    get: (keyName: string) => ipcRenderer.invoke("get-api-key", keyName),
    set: (keyName: string, value: string) =>
      ipcRenderer.invoke("set-api-key", keyName, value),
  },
};

// ACTIONS API IMPLEMENTATION
const actionsAPI: VibeActionsAPI = {
  copyText: async (text: string) => {
    ipcRenderer.send("actions:copy-text", text);
  },
  copyLink: async (url: string) => {
    ipcRenderer.send("actions:copy-link", url);
  },
  showContextMenu: async items => {
    return ipcRenderer.invoke("actions:show-context-menu", items);
  },
  executeAction: async (actionId: string, ...args: any[]) => {
    return ipcRenderer.invoke("actions:execute", actionId, ...args);
  },
  onAction: (actionId: string, callback: (...args: any[]) => void) => {
    return createEventListener(`action:${actionId}`, callback);
  },
};

// BROWSER API IMPLEMENTATION
const browserAPI: VibeBrowserAPI = {
  createWindow: () => {
    ipcRenderer.send("browser:create-window");
  },
  getWindowState: async () => {
    return ipcRenderer.invoke("browser:get-window-state");
  },
  closeWindow: () => {
    ipcRenderer.send("browser:close-window");
  },

  // Additional methods to match VibeBrowserAPI interface
  refreshViewLayout: async () => {
    return ipcRenderer.invoke("browser:refresh-view-layout");
  },

  getViewVisibilityStates: async () => {
    return ipcRenderer.invoke("browser:get-view-visibility-states");
  },

  setViewVisibility: async (tabKey: string, visible: boolean) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("browser:set-view-visibility", tabKey, visible);
  },

  optimizeMemory: async () => {
    return ipcRenderer.invoke("browser:optimize-memory");
  },

  getMemoryUsage: async () => {
    return ipcRenderer.invoke("browser:get-memory-usage");
  },
};

// TABS API IMPLEMENTATION
const tabsAPI: VibeTabsAPI = {
  createTab: async (url?: string) => {
    return ipcRenderer.invoke("create-tab", url);
  },
  closeTab: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("remove-tab", tabKey);
  },
  getTabs: async () => {
    return ipcRenderer.invoke("tabs:get-all");
  },
  switchToTab: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("switch-tab", tabKey);
  },
  setActiveTab: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("switch-tab", tabKey);
  },
  updateTab: async (tabKey: string, updates: Partial<TabState>) => {
    return ipcRenderer.invoke("tabs:update", tabKey, updates);
  },
  moveTab: async (tabKey: string, newPosition: number) => {
    if (!isValidKey(tabKey) || typeof newPosition !== "number") {
      throw new Error("Invalid tab key or position provided");
    }
    return ipcRenderer.invoke("tabs:move-tab", tabKey, newPosition);
  },
  reorderTabs: async (orderedKeys: string[]) => {
    if (!Array.isArray(orderedKeys) || !orderedKeys.every(isValidKey)) {
      throw new Error("Invalid ordered keys array provided");
    }
    return ipcRenderer.invoke("tabs:reorder-tabs", orderedKeys);
  },
  putTabToSleep: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("tabs:put-to-sleep", tabKey);
  },
  wakeUpTab: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("tabs:wake-up", tabKey);
  },
  getInactiveTabs: async (maxCount?: number) => {
    return ipcRenderer.invoke("tabs:get-inactive", maxCount);
  },

  // Additional methods to match VibeTabsAPI interface
  refreshTabState: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("tabs:refresh-state", tabKey);
  },

  getActiveTabKey: async () => {
    return ipcRenderer.invoke("tabs:get-active-key");
  },

  getActiveTab: async () => {
    return ipcRenderer.invoke("tabs:get-active");
  },

  performMaintenance: async () => {
    return ipcRenderer.invoke("tabs:perform-maintenance");
  },

  refreshAllTabStates: async () => {
    return ipcRenderer.invoke("tabs:refresh-all-states");
  },

  getTabCount: async () => {
    return ipcRenderer.invoke("tabs:get-count");
  },

  getTab: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("tabs:get", tabKey);
  },

  // Event listeners
  onTabsReordered: (callback: (tabs: TabState[]) => void) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onTabsReordered");
    }
    const listener = (_event: IpcRendererEvent, tabs: TabState[]): void => {
      if (Array.isArray(tabs)) {
        callback(tabs);
      }
    };
    ipcRenderer.on("browser-tabs-reordered", listener);
    return () => {
      ipcRenderer.removeListener("browser-tabs-reordered", listener);
    };
  },

  onTabCreated: (callback: (tabKey: string) => void) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onTabCreated");
    }
    const listener = (_event: IpcRendererEvent, key: string): void => {
      if (isValidKey(key)) {
        callback(key);
      }
    };
    ipcRenderer.on("tab-created", listener);
    return () => {
      ipcRenderer.removeListener("tab-created", listener);
    };
  },

  onTabStateUpdate: (callback: (state: TabState) => void) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onTabStateUpdate");
    }
    const listener = (_event: IpcRendererEvent, state: TabState): void => {
      if (state && typeof state === "object" && isValidKey(state.key)) {
        callback(state);
      }
    };
    ipcRenderer.on("update-tab-state", listener);
    return () => {
      ipcRenderer.removeListener("update-tab-state", listener);
    };
  },

  onTabSwitched: (
    callback: (switchData: { from: string | null; to: string }) => void,
  ) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onTabSwitched");
    }
    const listener = (
      _event: IpcRendererEvent,
      switchData: { from: string | null; to: string },
    ): void => {
      if (
        switchData &&
        typeof switchData === "object" &&
        isValidKey(switchData.to)
      ) {
        callback(switchData);
      }
    };
    ipcRenderer.on("tab-switched", listener);
    return () => {
      ipcRenderer.removeListener("tab-switched", listener);
    };
  },

  onTabClosed: (callback: (tabKey: string) => void) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onTabClosed");
    }
    const listener = (_event: IpcRendererEvent, tabKey: string): void => {
      if (isValidKey(tabKey)) {
        callback(tabKey);
      }
    };
    ipcRenderer.on("tab-closed", listener);
    return () => {
      ipcRenderer.removeListener("tab-closed", listener);
    };
  },

  // OAuth events
  onOAuthTabStarted: (
    callback: (data: { tabKey: string; url: string; title: string }) => void,
  ) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onOAuthTabStarted");
    }
    const listener = (
      _event: IpcRendererEvent,
      data: { tabKey: string; url: string; title: string },
    ): void => {
      if (data && typeof data === "object" && isValidKey(data.tabKey)) {
        callback(data);
      }
    };
    ipcRenderer.on("oauth-tab-started", listener);
    return () => {
      ipcRenderer.removeListener("oauth-tab-started", listener);
    };
  },

  onOAuthTabCompleted: (callback: (tabKey: string) => void) => {
    if (typeof callback !== "function") {
      throw new Error("Invalid callback provided to onOAuthTabCompleted");
    }
    const listener = (_event: IpcRendererEvent, tabKey: string): void => {
      if (isValidKey(tabKey)) {
        callback(tabKey);
      }
    };
    ipcRenderer.on("oauth-tab-completed", listener);
    return () => {
      ipcRenderer.removeListener("oauth-tab-completed", listener);
    };
  },
};

// PAGE API IMPLEMENTATION

const pageAPI: VibePageAPI = {
  navigate: async (tabKey: string, url: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    if (!isValidUrl(url)) {
      throw new Error("Invalid URL provided");
    }
    return ipcRenderer.invoke("page:navigate", tabKey, url);
  },
  goBack: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("page:goBack", tabKey);
  },
  goForward: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("page:goForward", tabKey);
  },
  reload: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    return ipcRenderer.invoke("page:reload", tabKey);
  },
  stop: async (tabKey: string) => {
    if (!isValidKey(tabKey)) {
      throw new Error("Invalid tab key provided");
    }
    ipcRenderer.send("page:stop", tabKey);
  },
};

// CONTENT API IMPLEMENTATION
const contentAPI: VibeContentAPI = {
  extractContent: async (tabKey: string) => {
    return ipcRenderer.invoke("content:extract", tabKey);
  },
  getContext: async (url: string) => {
    return ipcRenderer.invoke("content:get-context", url);
  },
  generateSummary: async (content: string) => {
    return ipcRenderer.invoke("content:generate-summary", content);
  },
  // saveContext removed - websiteContexts replaced by MCP memory system
  getSavedContexts: async () => {
    return ipcRenderer.invoke("content:get-saved-contexts");
  },
};

// INTERFACE API IMPLEMENTATION
const interfaceAPI: VibeInterfaceAPI = {
  minimizeWindow: () => {
    ipcRenderer.send("app:minimize");
  },
  maximizeWindow: () => {
    ipcRenderer.send("app:maximize");
  },
  closeWindow: () => {
    ipcRenderer.send("app:close");
  },
  setFullscreen: (fullscreen: boolean) => {
    ipcRenderer.send("app:set-fullscreen", fullscreen);
  },
  getWindowState: async () => {
    return ipcRenderer.invoke("interface:get-window-state");
  },
  moveWindowTo: (x: number, y: number) => {
    ipcRenderer.send("interface:move-window-to", x, y);
  },
  resizeWindowTo: (width: number, height: number) => {
    ipcRenderer.send("interface:resize-window-to", width, height);
  },
  setWindowBounds: bounds => {
    ipcRenderer.send("interface:set-window-bounds", bounds);
  },
  toggleChatPanel: (isVisible: boolean) => {
    ipcRenderer.send("toggle-custom-chat-area", isVisible);
  },
  getChatPanelState: async () => {
    return ipcRenderer.invoke("interface:get-chat-panel-state");
  },
  setChatPanelWidth: (widthPercentage: number) => {
    ipcRenderer.send("interface:set-chat-panel-width", widthPercentage);
  },
  onChatPanelVisibilityChanged: (callback: (isVisible: boolean) => void) => {
    return createEventListener("chat-area-visibility-changed", callback);
  },

  // Popup window methods
  openOnboardingWindow: async () => {
    return ipcRenderer.invoke("window:open-onboarding");
  },
  openSettingsWindow: async () => {
    return ipcRenderer.invoke("window:open-settings");
  },
  openAboutWindow: async () => {
    return ipcRenderer.invoke("window:open-about");
  },
  getPopupWindows: async () => {
    return ipcRenderer.invoke("window:get-popup-windows");
  },
  closeAllPopupWindows: async () => {
    return ipcRenderer.invoke("window:close-all-popups");
  },
  isPopupWindowOpen: async (windowType: string) => {
    return ipcRenderer.invoke("window:is-popup-open", windowType);
  },
  onPopupWindowOpened: (
    callback: (data: { type: string; windowId: number }) => void,
  ) => {
    return createEventListener("popup-window-opened", callback);
  },
  onPopupWindowClosed: (
    callback: (data: { type: string; windowId: number }) => void,
  ) => {
    return createEventListener("popup-window-closed", callback);
  },
};

// Chat API implementation
const chatAPI: VibeChatAPI = {
  sendMessage: async (message: string) => {
    if (typeof message !== "string" || message.trim().length === 0) {
      throw new Error("Invalid message provided");
    }

    // Send message via modern vibe API channel
    ipcRenderer.send("chat:send-message", message.trim());
  },
  getChatHistory: async () => {
    return ipcRenderer.invoke("chat:get-history");
  },
  clearHistory: async () => {
    ipcRenderer.send("chat:clear-history");
  },
  getAgentStatus: async () => {
    return ipcRenderer.invoke("chat:get-agent-status");
  },
  initializeAgent: async (apiKey?: string) => {
    return ipcRenderer.invoke("chat:initialize-agent", apiKey);
  },

  onMessage: callback => {
    return createEventListener("chat:message", callback);
  },
  onAgentProgress: callback => {
    return createEventListener("agent-progress-update", callback);
  },
  onAgentStatusChanged: callback => {
    return createEventListener("agent:status-changed", callback);
  },
};

// UPDATER
const updateAPI: VibeUpdateAPI = {
  checkForUpdate: async () => {
    return ipcRenderer.invoke("app:check-for-update");
  },
  showUpdateDialog: async () => {
    return ipcRenderer.invoke("app:show-update-dialog");
  },
};

// SETTINGS API IMPLEMENTATION
const settingsAPI: VibeSettingsAPI = {
  get: async (key: string) => {
    return ipcRenderer.invoke("settings:get", key);
  },
  set: async (key: string, value: any) => {
    return ipcRenderer.invoke("settings:set", key, value);
  },
  remove: async (key: string) => {
    return ipcRenderer.invoke("settings:remove", key);
  },
  getAll: async () => {
    return ipcRenderer.invoke("settings:get-all");
  },
  reset: async () => {
    return ipcRenderer.invoke("settings:reset");
  },
  export: async () => {
    return ipcRenderer.invoke("settings:export");
  },
  import: async (data: string) => {
    return ipcRenderer.invoke("settings:import", data);
  },
  onChange: callback => {
    return createEventListener("settings:changed", callback);
  },
};

/**
 * Legacy event listeners for backward compatibility
 */
const legacyListeners = {
  onTabCreated: (callback: (key: string) => void): (() => void) => {
    if (typeof callback !== "function") {
      logger.error("Invalid callback provided to onTabCreated");
      return () => {};
    }
    const listener = (_event: IpcRendererEvent, key: string): void => {
      if (isValidKey(key)) {
        callback(key);
      }
    };
    ipcRenderer.on("tab-created", listener);
    return () => {
      ipcRenderer.removeListener("tab-created", listener);
    };
  },

  onTabStateUpdate: (callback: (state: TabState) => void): (() => void) => {
    if (typeof callback !== "function") {
      logger.error("Invalid callback provided to onTabStateUpdate");
      return () => {};
    }
    const listener = (_event: IpcRendererEvent, state: TabState): void => {
      if (state && typeof state === "object" && isValidKey(state.key)) {
        callback(state);
      }
    };
    ipcRenderer.on("update-tab-state", listener);
    return () => {
      ipcRenderer.removeListener("update-tab-state", listener);
    };
  },

  onTabSwitched: (
    callback: (switchData: { from: string | null; to: string }) => void,
  ): (() => void) => {
    if (typeof callback !== "function") {
      logger.error("Invalid callback provided to onTabSwitched");
      return () => {};
    }
    const listener = (
      _event: IpcRendererEvent,
      switchData: { from: string | null; to: string },
    ): void => {
      if (
        switchData &&
        typeof switchData === "object" &&
        isValidKey(switchData.to)
      ) {
        callback(switchData);
      }
    };
    ipcRenderer.on("tab-switched", listener);
    return () => {
      ipcRenderer.removeListener("tab-switched", listener);
    };
  },

  onShortcutSwitchTab: (callback: (key: string) => void): (() => void) => {
    return createEventListener("shortcut-switch-tab", callback);
  },

  onShortcutCreateTab: (callback: (key: string) => void): (() => void) => {
    return createEventListener("shortcut-create-tab", callback);
  },

  onSendTabAgent: (callback: (key: string) => void): (() => void) => {
    return createEventListener("tab-send-agent", callback);
  },
};

/**
 * Store bridge for state synchronization
 */
const storeBridge = {
  getState: (): Promise<any> => ipcRenderer.invoke("zustand-getState"),
  subscribe: (callback: (state: any) => void): (() => void) => {
    if (typeof callback !== "function") {
      logger.error("Invalid callback provided to storeBridge.subscribe");
      return () => {};
    }
    const listener = (_event: IpcRendererEvent, state: any): void => {
      callback(state);
    };
    ipcRenderer.on("zustand-update", listener);
    return () => {
      ipcRenderer.removeListener("zustand-update", listener);
    };
  },
};

/**
 * Additional APIs for backward compatibility
 */
const additionalAPIs = {
  // Gmail OAuth
  gmailAuth: {
    checkAuth: () => ipcRenderer.invoke("gmail-check-auth"),
    startAuth: () => ipcRenderer.invoke("gmail-start-auth"),
    clearAuth: () => ipcRenderer.invoke("gmail-clear-auth"),
  },

  // API Keys
  apiKeys: {
    get: (keyName: string) => ipcRenderer.invoke("get-api-key", keyName),
    set: (keyName: string, value: string) =>
      ipcRenderer.invoke("set-api-key", keyName, value),
  },

  // Legacy API bridge - deprecated, use window.vibe.chat instead
  api: {
    initializeAgent: async (apiKey: string) => {
      logger.warn("DEPRECATED: Use window.vibe.chat.initializeAgent() instead");
      return ipcRenderer.invoke("chat:initialize-agent", apiKey);
    },
    processAgentInput: async (input: string) => {
      logger.warn("DEPRECATED: Use window.vibe.chat.sendMessage() instead");
      return ipcRenderer.invoke("process-agent-input", input);
    },
  },
};

// SESSION API IMPLEMENTATION
const sessionAPI: VibeSessionAPI = {
  getState: async () => {
    return ipcRenderer.invoke("session:get-state");
  },
  setState: async state => {
    ipcRenderer.send("session:set-state", state);
  },
  save: async () => {
    return ipcRenderer.invoke("session:save");
  },
  load: async () => {
    return ipcRenderer.invoke("session:load");
  },
  clear: async () => {
    return ipcRenderer.invoke("session:clear");
  },
  onStateChanged: callback => {
    return createEventListener("session:state-changed", callback);
  },
  stateBridge: {
    getState: (): Promise<any> => ipcRenderer.invoke("zustand-getState"),
    subscribe: (callback: (state: any) => void): (() => void) => {
      if (typeof callback !== "function") {
        logger.error("Invalid callback provided to stateBridge.subscribe");
        return () => {};
      }
      const listener = (_event: IpcRendererEvent, state: any): void => {
        callback(state);
      };
      ipcRenderer.on("zustand-update", listener);
      return () => {
        ipcRenderer.removeListener("zustand-update", listener);
      };
    },
  },
};

const vibeAPI = {
  app: appAPI,
  actions: actionsAPI,
  browser: browserAPI,
  tabs: tabsAPI,
  page: pageAPI,
  content: contentAPI,
  interface: interfaceAPI,
  chat: chatAPI,
  settings: settingsAPI,
  session: sessionAPI,
  update: updateAPI,
};

// Expose APIs to the renderer process
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("vibe", vibeAPI);
    contextBridge.exposeInMainWorld("electronAPI", {
      ...electronAPI,
      platform: process.platform,
      getWindowType: getWindowType, // Add window type detection
      getDetectedBrowsers: getDetectedBrowsers, // Add detected browsers
      ipcRenderer: {
        on: (
          channel: string,
          callback: (event: any, ...args: any[]) => void,
        ) => {
          ipcRenderer.on(channel, callback);
        },
        removeListener: (channel: string, callback: any) => {
          ipcRenderer.removeListener(channel, callback);
        },
        invoke: (channel: string, ...args: any[]) => {
          return ipcRenderer.invoke(channel, ...args);
        },
      },
      // Legacy methods for backward compatibility
      ...legacyListeners,
      // Legacy individual methods - deprecated, functionality removed
      sendContextToAgent: (_key: string) => {
        logger.warn(
          "DEPRECATED: This functionality has been removed. Website contexts are now automatically available to the agent.",
        );
      },
      storeFavicon: async (hostname: string, faviconUrl: string) => {
        if (!hostname?.trim() || !faviconUrl?.trim()) {
          return { success: false, error: "Invalid hostname or favicon URL" };
        }
        try {
          return await ipcRenderer.invoke(
            "store-favicon",
            hostname,
            faviconUrl,
          );
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      },
    });
    contextBridge.exposeInMainWorld("electron", {
      ...electronAPI,
      platform: process.platform,
      getWindowType: getWindowType, // Also expose on legacy electron object
      getDetectedBrowsers: getDetectedBrowsers, // Also expose on legacy electron object
      // Legacy methods for backward compatibility
      ...legacyListeners,
    });
    contextBridge.exposeInMainWorld("storeBridge", storeBridge);
    contextBridge.exposeInMainWorld("gmailAuth", additionalAPIs.gmailAuth);
    contextBridge.exposeInMainWorld("apiKeys", additionalAPIs.apiKeys);
    contextBridge.exposeInMainWorld("api", additionalAPIs.api);
  } catch (error) {
    logger.error(
      "Failed to expose APIs:",
      error instanceof Error ? error.message : String(error),
    );
  }
} else {
  logger.warn(
    "Context isolation is disabled! This is not recommended for production.",
  );
}
