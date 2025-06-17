/**
 * TabBar component - Uses @sinm/react-chrome-tabs library for proper Chrome styling
 */

import React, { useMemo, useEffect } from "react";
import { Tabs } from "@sinm/react-chrome-tabs";
import "@sinm/react-chrome-tabs/css/chrome-tabs.css";
import type { TabState } from "@vibe/shared-types";
import { GMAIL_CONFIG } from "@vibe/shared-types";
import "../styles/TabBar.css";

// Default favicon for tabs that don't have one
const DEFAULT_FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ccircle cx='8' cy='8' r='7' fill='%23f0f0f0' stroke='%23cccccc' stroke-width='1'/%3E%3C/svg%3E";

/**
 * Gets a favicon URL with special handling for OAuth tabs
 */
const getFaviconUrl = (_url: string, providedFavicon?: string, tabKey?: string): string => {
  // Special handling for OAuth tabs
  if (tabKey?.startsWith('oauth-')) {
    if (tabKey === 'oauth-gmail') {
      return GMAIL_CONFIG.FAVICON_URL;
    }
    return DEFAULT_FAVICON;
  }
  
  if (providedFavicon && providedFavicon.trim() !== "") {
    // Check if it's already a data URL or proper URL
    if (providedFavicon.startsWith('data:') || providedFavicon.startsWith('http')) {
      return providedFavicon;
    }
    // For other strings (like emojis), fall back to default
    return DEFAULT_FAVICON;
  }
  return DEFAULT_FAVICON;
};

/**
 * Tab item properties for the Chrome-style tabs
 */
interface TabBarItemProperties {
  id: string;
  title: string;
  favicon?: string;
  url?: string;
  closable?: boolean;
  active?: boolean;
}

export const ChromeTabBar: React.FC = () => {
  const [tabs, setTabs] = React.useState<TabState[]>([]);
  const [activeTabKey, setActiveTabKey] = React.useState<string | null>(null);
  const [isMacos, setIsMacos] = React.useState(false);

  // Platform detection
  useEffect(() => {
    if (window.vibe?.app?.getPlatform) {
      const platform = window.vibe.app.getPlatform();
      setIsMacos(platform === "darwin");
    }
  }, []);

  // Initialize tabs
  useEffect(() => {
    const loadTabs = async (): Promise<void> => {
      try {
        // Check if vibe API is available
        if (!window.vibe?.tabs?.getTabs) {
          return;
        }

        const tabData = await window.vibe.tabs.getTabs();
        const sortedTabs = tabData.sort(
          (a, b) => (a.position || 0) - (b.position || 0),
        );
        setTabs(sortedTabs);

        const activeKey = await window.vibe.tabs.getActiveTabKey();
        setActiveTabKey(activeKey);
      } catch (error) {
        console.error("Failed to load tabs:", error);
      }
    };
    loadTabs();
  }, []);

  // Tab events
  useEffect(() => {
    if (!window.vibe?.tabs?.onTabCreated) {
      return;
    }

    const cleanupCreated = window.vibe.tabs.onTabCreated(() => {
      window.vibe.tabs
        .getTabs()
        .then(allTabs => {
          const sortedTabs = allTabs.sort(
            (a, b) => (a.position || 0) - (b.position || 0),
          );
          setTabs(sortedTabs);
        })
        .catch(console.error);
    });

    const cleanupUpdated = window.vibe.tabs.onTabStateUpdate(
      (tabState: TabState) => {
        setTabs(prevTabs =>
          prevTabs.map(tab =>
            tab.key === tabState.key ? { ...tab, ...tabState } : tab,
          ),
        );
      },
    );

    const cleanupSwitched = window.vibe.tabs.onTabSwitched(switchData => {
      setActiveTabKey(switchData.to);
    });

    const cleanupClosed = window.vibe.tabs.onTabClosed(closedTabKey => {
      setTabs(prevTabs => prevTabs.filter(tab => tab.key !== closedTabKey));
    });

    // Handle OAuth tab events
    const cleanupOAuthStarted = window.vibe?.tabs?.onOAuthTabStarted?.((data) => {
      const oauthTab: TabState = {
        key: data.tabKey,
        title: data.title,
        url: data.url,
        favicon: "",
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        position: 999,
      };
      
      setTabs(prevTabs => [...prevTabs, oauthTab]);
      setActiveTabKey(data.tabKey);
    });

    const cleanupOAuthCompleted = window.vibe?.tabs?.onOAuthTabCompleted?.((tabKey) => {
      setTabs(prevTabs => {
        const remainingTabs = prevTabs.filter(tab => tab.key !== tabKey);
        
        const firstRegularTab = remainingTabs.find(tab => !tab.key.startsWith("oauth-"));
        if (firstRegularTab) {
          setActiveTabKey(firstRegularTab.key);
          window.vibe.tabs.switchToTab(firstRegularTab.key).catch(console.error);
        }
        
        return remainingTabs;
      });
    });

    return () => {
      cleanupCreated();
      cleanupUpdated();
      cleanupSwitched();
      cleanupClosed();
      cleanupOAuthStarted?.();
      cleanupOAuthCompleted?.();
    };
  }, []);

  // Transform tabs to library format
  const tabPropertiesForLibrary: TabBarItemProperties[] = useMemo(() => {
    if (!Array.isArray(tabs)) {
      return [];
    }
    
    
    return tabs.map(tab => ({
      id: tab.key,
      title: tab.title || tab.url || "New Tab",
      favicon: getFaviconUrl(tab.url || "", tab.favicon, tab.key),
      url: tab.url,
      closable: tab.key !== "oauth-gmail", // OAuth tabs are not closable
      active: tab.key === activeTabKey,
    }));
  }, [tabs, activeTabKey]);

  // Event handlers
  const handleTabActive = async (tabId: string): Promise<void> => {
    // OAuth tabs are handled by the OAuth service, not the tab manager
    if (tabId === "oauth-gmail") {
      setActiveTabKey(tabId);
      return;
    }
    
    try {
      await window.vibe.tabs.switchToTab(tabId);
    } catch (error) {
      console.error("Failed to switch tab:", error);
    }
  };

  const handleTabClose = async (tabId: string): Promise<void> => {
    // Prevent closing OAuth tabs - they close automatically
    if (tabId === "oauth-gmail") {
      return;
    }
    
    try {
      await window.vibe.tabs.closeTab(tabId);
    } catch (error) {
      console.error("Failed to close tab:", error);
    }
  };

  const handleNewTab = async (): Promise<void> => {
    try {
      await window.vibe.tabs.createTab();
    } catch (error) {
      console.error("Failed to create tab:", error);
    }
  };

  const handleTabReorder = async (
    _tabId: string,
    fromIndex: number,
    toIndex: number,
  ): Promise<void> => {
    try {
      // Create reordered array
      const reorderedTabs = [...tabs];
      const [movedTab] = reorderedTabs.splice(fromIndex, 1);
      reorderedTabs.splice(toIndex, 0, movedTab);

      // Update optimistically
      setTabs(reorderedTabs);

      // Sync with backend
      const orderedKeys = reorderedTabs.map(tab => tab.key);
      await window.vibe.tabs.reorderTabs(orderedKeys);
    } catch (error) {
      console.error("Failed to reorder tabs:", error);
      // Revert on error
      const tabData = await window.vibe.tabs.getTabs();
      const sortedTabs = tabData.sort(
        (a, b) => (a.position || 0) - (b.position || 0),
      );
      setTabs(sortedTabs);
    }
  };

  return (
    <div
      className={`custom-tab-bar-wrapper ${isMacos ? "macos-tabs-container-padded" : ""}`}
    >
      <Tabs
        darkMode={false}
        draggable={true}
        onTabActive={handleTabActive}
        onTabClose={handleTabClose}
        onTabReorder={handleTabReorder}
        tabs={tabPropertiesForLibrary}
        pinnedRight={
          <button
            onClick={handleNewTab}
            className="add-tab-button"
            aria-label="Add new tab"
          >
            +
          </button>
        }
      />
    </div>
  );
};

export default ChromeTabBar;
