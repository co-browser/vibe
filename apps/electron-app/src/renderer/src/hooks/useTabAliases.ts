import { useState, useEffect, useCallback, useMemo } from "react";
import type { ParsedPrompt, TabState } from "@vibe/shared-types";

interface TabAliasSuggestion {
  alias: string;
  tabKey: string;
  title: string;
  url: string;
  favicon?: string;
}

interface UseTabAliasesReturn {
  // Parse prompt and extract aliases
  parsePrompt: (prompt: string) => ParsedPrompt;
  // Get suggestions for partial alias
  getSuggestions: (partial: string) => TabAliasSuggestion[];
  // Set custom alias for current tab
  setCustomAlias: (alias: string) => Promise<boolean>;
  // Get all current aliases
  aliases: Record<string, string>;
  // Check if an alias exists
  hasAlias: (alias: string) => boolean;
  // Get visual indicators for tabs with aliases
  getTabAliasDisplay: (tabKey: string) => string | null;
}

/**
 * React hook for tab alias functionality in the renderer
 */
export function useTabAliases(): UseTabAliasesReturn {
  const [tabs, setTabs] = useState<TabState[]>([]);
  const [aliases, setAliases] = useState<Record<string, string>>({});

  // Local alias pattern matching (mirrors backend)
  // Updated to include dots for domain names like @google.com, @bbc.co.uk
  // Uses negative lookbehind to exclude email addresses (e.g., user@domain.com)
  const aliasPattern = useMemo(
    () => /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_.-]+(?:-\d+)?)/g,
    [],
  );

  /**
   * Parse prompt locally for immediate UI feedback
   */
  const parsePrompt = useCallback(
    (prompt: string): ParsedPrompt => {
      const extractedAliases: string[] = [];
      const aliasPositions: Array<{
        alias: string;
        start: number;
        end: number;
      }> = [];
      let cleanPrompt = prompt;

      // Reset regex state
      aliasPattern.lastIndex = 0;

      let match;
      while ((match = aliasPattern.exec(prompt)) !== null) {
        const fullMatch = match[0];
        const alias = match[1].toLowerCase();

        extractedAliases.push(alias);
        aliasPositions.push({
          alias,
          start: match.index,
          end: match.index + fullMatch.length,
        });
      }

      // Remove @mentions from clean prompt (but not email addresses)
      cleanPrompt = prompt
        .replace(/(?<![a-zA-Z0-9._-])@[a-zA-Z0-9_.-]+(?:-\d+)?/g, "")
        .trim();

      return {
        originalPrompt: prompt,
        cleanPrompt,
        extractedAliases: [...new Set(extractedAliases)],
        aliasPositions,
      };
    },
    [aliasPattern],
  );

  /**
   * Get suggestions based on current tabs
   */
  const getSuggestions = useCallback(
    (partial: string): TabAliasSuggestion[] => {
      console.log("[useTabAliases] getSuggestions called:", {
        partial,
        tabsCount: tabs.length,
        tabs: tabs.map(t => ({ key: t.key, title: t.title, url: t.url })),
        aliases,
      });

      if (!partial || partial.length === 0) {
        // Return all available aliases
        const allSuggestions = tabs.map((tab: TabState) => {
          const alias = aliases[tab.key] || getDefaultAlias(tab.url);
          return {
            alias,
            tabKey: tab.key,
            title: tab.title,
            url: tab.url,
            favicon: tab.favicon,
          };
        });
        console.log(
          "[useTabAliases] Returning all suggestions:",
          allSuggestions,
        );
        return allSuggestions;
      }

      const lowerPartial = partial.toLowerCase();
      const filteredSuggestions = tabs
        .map((tab: TabState) => {
          const alias = aliases[tab.key] || getDefaultAlias(tab.url);
          return {
            alias,
            tabKey: tab.key,
            title: tab.title,
            url: tab.url,
            favicon: tab.favicon,
          };
        })
        .filter(suggestion =>
          suggestion.alias.toLowerCase().startsWith(lowerPartial),
        );

      console.log(
        "[useTabAliases] Returning filtered suggestions:",
        filteredSuggestions,
      );
      return filteredSuggestions;
    },
    [tabs, aliases],
  );

  /**
   * Set custom alias for a tab
   */
  const setCustomAlias = useCallback(
    async (alias: string): Promise<boolean> => {
      const activeTab = tabs.find((tab: TabState) => tab.visible);
      const activeTabKey = activeTab?.key;
      if (!activeTabKey) return false;

      try {
        const result = await window.electron?.ipcRenderer.invoke(
          "tab:set-custom-alias",
          activeTabKey,
          alias,
        );

        if (result?.success) {
          // Update local state
          setAliases(prev => ({
            ...prev,
            [activeTabKey]: alias,
          }));
        }

        return result?.success || false;
      } catch (error) {
        console.error("Failed to set custom alias:", error);
        return false;
      }
    },
    [tabs],
  );

  /**
   * Check if an alias exists
   */
  const hasAlias = useCallback(
    (alias: string): boolean => {
      const lowerAlias = alias.toLowerCase();
      return Object.values(aliases).some(a => a.toLowerCase() === lowerAlias);
    },
    [aliases],
  );

  /**
   * Get display string for a tab's alias
   */
  const getTabAliasDisplay = useCallback(
    (tabKey: string): string | null => {
      const alias = aliases[tabKey];
      return alias ? `@${alias}` : null;
    },
    [aliases],
  );

  /**
   * Fetch tabs from main process
   */
  useEffect(() => {
    const fetchTabs = async () => {
      try {
        const allTabs =
          (await window.electron?.ipcRenderer.invoke("tabs:get-all")) || [];
        console.log("[useTabAliases] Fetched tabs from main process:", allTabs);
        setTabs(allTabs);
      } catch (error) {
        console.error("Failed to fetch tabs:", error);
      }
    };

    fetchTabs();

    // Listen for tab updates
    const handleTabUpdate = () => {
      fetchTabs();
    };

    window.electron?.ipcRenderer.on("tab-created", handleTabUpdate);
    window.electron?.ipcRenderer.on("update-tab-state", handleTabUpdate);
    window.electron?.ipcRenderer.on("tab-closed", handleTabUpdate);
    window.electron?.ipcRenderer.on("browser-tabs-reordered", handleTabUpdate);

    return () => {
      window.electron?.ipcRenderer.removeListener(
        "tab-created",
        handleTabUpdate,
      );
      window.electron?.ipcRenderer.removeListener(
        "update-tab-state",
        handleTabUpdate,
      );
      window.electron?.ipcRenderer.removeListener(
        "tab-closed",
        handleTabUpdate,
      );
      window.electron?.ipcRenderer.removeListener(
        "browser-tabs-reordered",
        handleTabUpdate,
      );
    };
  }, []);

  /**
   * Update aliases when tabs change
   */
  useEffect(() => {
    const updateAliases = async () => {
      try {
        const aliasMapping =
          (await window.electron?.ipcRenderer.invoke("tab:get-aliases")) || {};
        console.log("[useTabAliases] Fetched alias mapping:", aliasMapping);
        setAliases(aliasMapping);
      } catch (error) {
        console.error("Failed to fetch aliases:", error);
      }
    };

    updateAliases();
  }, [tabs]);

  /**
   * Listen for alias updates from main process
   */
  useEffect(() => {
    const handleAliasUpdate = (
      _event: any,
      data: { tabKey: string; alias: string },
    ) => {
      setAliases(prev => ({
        ...prev,
        [data.tabKey]: data.alias,
      }));
    };

    window.electron?.ipcRenderer.on("tab:alias-updated", handleAliasUpdate);

    return () => {
      window.electron?.ipcRenderer.removeListener(
        "tab:alias-updated",
        handleAliasUpdate,
      );
    };
  }, []);

  return {
    parsePrompt,
    getSuggestions,
    setCustomAlias,
    aliases,
    hasAlias,
    getTabAliasDisplay,
  };
}

/**
 * Helper to generate default alias from URL
 */
function getDefaultAlias(url: string): string {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.replace("www.", "").toLowerCase();
    console.log("[useTabAliases] Generated default alias:", { url, hostname });
    return hostname;
  } catch {
    return "unknown";
  }
}
