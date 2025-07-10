/**
 * Enhanced NavigationBar component with DOM-injected dropdown
 * Provides browser navigation controls and intelligent omnibar using vibe APIs
 */

import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import {
  LeftOutlined,
  RightOutlined,
  ReloadOutlined,
  RobotOutlined,
  SearchOutlined,
  GlobalOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import OmniboxDropdown from "./OmniboxDropdown";
import type { SuggestionMetadata } from "../../../../types/metadata";
import { createLogger } from "@vibe/shared-types";
import { useLayout } from "@/hooks/useLayout";
import { useSearchWorker } from "../../hooks/useSearchWorker";
import "../styles/NavigationBar.css";

const logger = createLogger("NavigationBar");

// Performance monitoring utility
const performanceMonitor = {
  timers: new Map<string, number>(),

  start(label: string) {
    this.timers.set(label, performance.now());
  },

  end(label: string) {
    const startTime = this.timers.get(label);
    if (startTime) {
      const duration = performance.now() - startTime;
      logger.debug(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
      this.timers.delete(label);
      return duration;
    }
    return 0;
  },
};

// URL/Title formatting utilities
function formatSuggestionTitle(title: string, url: string): string {
  if (!title || title === url) {
    return formatUrlForDisplay(url).display;
  }

  // Remove common SEO patterns
  const patterns = [
    /\s*[|–-]\s*.*?(Official Site|Website|Home Page).*$/i,
    /^(Home|Welcome)\s*[|–-]\s*/i,
    /\s*[|–-]\s*\w+\.com$/i,
  ];

  let cleaned = title;
  for (const pattern of patterns) {
    cleaned = cleaned.replace(pattern, "");
  }

  return cleaned.trim() || formatUrlForDisplay(url).display;
}

// Format URLs for readable display
function formatUrlForDisplay(url: string): { display: string; domain: string } {
  try {
    const urlObj = new URL(url);
    const domain = urlObj.hostname.replace(/^www\./, "");

    // Special handling for search engines
    if (
      urlObj.hostname.includes("google.com") &&
      urlObj.searchParams.has("q")
    ) {
      return {
        display: `Search: "${urlObj.searchParams.get("q")}"`,
        domain: "Google",
      };
    }

    // Show clean path without query params
    const path = urlObj.pathname === "/" ? "" : urlObj.pathname.split("?")[0];
    return {
      display: domain + (path.length > 30 ? "/..." + path.slice(-25) : path),
      domain: domain,
    };
  } catch {
    return { display: url, domain: url };
  }
}

// Format last visit timestamp for display
function formatLastVisit(timestamp: number | undefined): string {
  if (!timestamp) return "Never";

  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

interface Suggestion {
  id: string;
  type:
    | "url"
    | "search"
    | "history"
    | "bookmark"
    | "context"
    | "perplexity"
    | "agent"
    | "navigation";
  text: string;
  url?: string;
  icon: React.ReactNode;
  iconType?: string;
  description?: string;
  metadata?: SuggestionMetadata;
}

interface TabNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  url: string;
  title: string;
}

// Helper function to get icon type from suggestion
function getIconType(suggestion: Suggestion): string {
  switch (suggestion.type) {
    case "url":
      return "global";
    case "search":
      return "search";
    case "history":
      return "history";
    case "bookmark":
      return "star";
    case "context":
      return "link";
    case "perplexity":
      return "robot";
    case "agent":
      return "robot";
    case "navigation":
      return "arrow-right";
    default:
      return "default";
  }
}

/**
 * Enhanced navigation bar component with direct DOM dropdown
 */
const NavigationBar: React.FC = () => {
  const [currentTabKey, setCurrentTabKey] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [originalUrl, setOriginalUrl] = useState("");
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [navigationState, setNavigationState] = useState<TabNavigationState>({
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    url: "",
    title: "",
  });
  const [agentStatus, setAgentStatus] = useState(false);

  // Use layout context for chat panel state
  const { isChatPanelVisible: chatPanelVisible, setChatPanelVisible } =
    useLayout();

  const inputRef = useRef<HTMLInputElement>(null);
  // Remove the unused variable 'handleContextMenu'

  // Use search worker for filtering suggestions
  const {
    results: workerSuggestions,
    search: searchInWorker,
    updateSuggestions: updateWorkerSuggestions,
    updateResults: updateWorkerResults,
  } = useSearchWorker([]);
  const allHistoryLoadedRef = useRef(false);

  // Performance optimization: Cache recent history queries
  const historyCache = useRef<Map<string, { data: any[]; timestamp: number }>>(
    new Map(),
  );

  // Load all history data for the worker
  const loadAllHistoryForWorker = useCallback(
    async (forceReload = false) => {
      performanceMonitor.start("loadAllHistoryForWorker");

      logger.debug("🚀 loadAllHistoryForWorker called", {
        forceReload,
        allHistoryLoaded: allHistoryLoadedRef.current,
      });

      if (allHistoryLoadedRef.current && !forceReload) {
        logger.debug(`📚 History already loaded, skipping`);
        performanceMonitor.end("loadAllHistoryForWorker");
        return;
      }

      try {
        // Check cache first
        const cacheKey = "history-worker-cache";
        const cached = historyCache.current.get(cacheKey);
        const now = Date.now();

        if (cached && !forceReload && now - cached.timestamp < 30000) {
          // 30 second cache
          logger.debug(
            `📚 Using cached history data: ${cached.data.length} items`,
          );
          updateWorkerSuggestions(cached.data);
          performanceMonitor.end("loadAllHistoryForWorker");
          return;
        }

        logger.debug(`📚 Loading history data from API...`);

        // Check if profile API is available
        if (!window.vibe?.profile?.getNavigationHistory) {
          logger.error(
            "❌ window.vibe.profile.getNavigationHistory not available",
          );
          performanceMonitor.end("loadAllHistoryForWorker");
          return;
        }

        // Load a smaller, more focused set of history items for better performance
        const allHistory =
          (await window.vibe.profile.getNavigationHistory("", 50)) || [];

        logger.debug(`📚 Loaded ${allHistory.length} history items from API`, {
          firstItem: allHistory[0],
          lastItem: allHistory[allHistory.length - 1],
        });

        // If no history from API, try to get some basic suggestions
        if (allHistory.length === 0) {
          logger.debug(`📚 No history found, creating fallback suggestions`);
          const fallbackSuggestions = [
            {
              id: "fallback-google",
              type: "search" as const,
              text: "Search with Google",
              url: "https://www.google.com",
              description: "Search the web with Google",
              visitCount: 1,
              lastVisit: Date.now(),
              metadata: { title: "Google", url: "https://www.google.com" },
            },
            {
              id: "fallback-perplexity",
              type: "search" as const,
              text: "Search with Perplexity",
              url: "https://www.perplexity.ai",
              description: "AI-powered search with Perplexity",
              visitCount: 1,
              lastVisit: Date.now(),
              metadata: {
                title: "Perplexity",
                url: "https://www.perplexity.ai",
              },
            },
          ];

          logger.debug(
            `📚 Created ${fallbackSuggestions.length} fallback suggestions`,
          );
          updateWorkerSuggestions(fallbackSuggestions);
          allHistoryLoadedRef.current = !forceReload;
          performanceMonitor.end("loadAllHistoryForWorker");
          return;
        }

        // Pre-process and cache the formatted data
        const workerSuggestions = allHistory.map((entry, index) => ({
          id: `history-${entry.url}-${index}`,
          type: "history" as const,
          text: formatSuggestionTitle(entry.title || "", entry.url || ""),
          url: entry.url || "",
          description: `${formatUrlForDisplay(entry.url || "").domain} • Visited ${entry.visitCount} time${entry.visitCount !== 1 ? "s" : ""} • ${formatLastVisit(entry.lastVisit)}`,
          visitCount: entry.visitCount,
          lastVisit: entry.lastVisit,
          metadata: entry,
        }));

        logger.debug(
          `📚 Processed ${workerSuggestions.length} history suggestions`,
          {
            firstSuggestion: workerSuggestions[0],
            lastSuggestion: workerSuggestions[workerSuggestions.length - 1],
          },
        );

        // Cache the processed data
        historyCache.current.set(cacheKey, {
          data: workerSuggestions,
          timestamp: now,
        });

        updateWorkerSuggestions(workerSuggestions);
        allHistoryLoadedRef.current = !forceReload; // Only set to true if not forcing reload
      } catch (error) {
        logger.error("Failed to load history for worker:", error);
      } finally {
        performanceMonitor.end("loadAllHistoryForWorker");
      }
    },
    [updateWorkerSuggestions],
  );

  // Handle suggestion click from dropdown
  const handleSuggestionClick = useCallback(
    async (suggestion: any) => {
      try {
        logger.info("🎯 Suggestion clicked:", suggestion);

        // Immediately hide suggestions
        setShowSuggestions(false);
        inputRef.current?.blur();

        // Reset typing state after navigation
        setIsUserTyping(false);

        // Get current tab key if not available
        let tabKey = currentTabKey;
        if (!tabKey) {
          const activeTab = await window.vibe.tabs.getActiveTab();
          if (activeTab && activeTab.key) {
            tabKey = activeTab.key;
            setCurrentTabKey(tabKey);
          }
        }

        if (!tabKey) {
          logger.error("❌ No active tab found, cannot navigate");
          return;
        }

        // Handle navigation based on suggestion type
        if (suggestion.type === "context" && suggestion.url) {
          await window.vibe.tabs.switchToTab(suggestion.url);
        } else if (suggestion.type === "agent" && suggestion.metadata) {
          if (suggestion.metadata.action === "ask-agent") {
            await window.vibe.interface.toggleChatPanel(true);
          }
        } else if (suggestion.url && tabKey) {
          await window.vibe.page.navigate(tabKey, suggestion.url);
          setInputValue(suggestion.url);
        } else if (suggestion.type === "search" && tabKey) {
          const defaultSearchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) ||
            "perplexity";
          let searchUrl = `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(suggestion.text)}`;
          if (defaultSearchEngine === "perplexity") {
            searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(suggestion.text)}`;
          } else if (defaultSearchEngine === "google") {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.text)}`;
          }
          await window.vibe.page.navigate(tabKey, searchUrl);
          setInputValue(suggestion.text);
        }
      } catch (error) {
        logger.error("Failed to handle suggestion click:", error);
      }
    },
    [currentTabKey],
  );

  // Non-history suggestions state
  const [nonHistorySuggestions, setNonHistorySuggestions] = useState<
    Suggestion[]
  >([]);

  // Create serializable suggestions for dropdown - single source of truth
  const dropdownSuggestions = useMemo(() => {
    const combined = [...workerSuggestions, ...nonHistorySuggestions];

    // Map to a serializable format for the dropdown
    return combined.map(s => ({
      ...s,
      icon: undefined, // Remove React nodes before passing down
      iconType: getIconType(s),
    }));
  }, [workerSuggestions, nonHistorySuggestions]);

  // Remove redundant suggestions state sync - we'll use dropdownSuggestions directly

  const handleDeleteHistory = useCallback(
    async (suggestionId: string) => {
      try {
        logger.info("🗑️ Deleting history item:", suggestionId);

        const suggestionToDelete = dropdownSuggestions.find(
          s => s.id === suggestionId,
        );

        // Optimistically update the UI by removing from worker results
        // This will trigger a re-render of dropdownSuggestions
        const workerFiltered = workerSuggestions.filter(
          s => s.id !== suggestionId,
        );
        const nonHistoryFiltered = nonHistorySuggestions.filter(
          s => s.id !== suggestionId,
        );

        // Update the worker's data
        updateWorkerResults(workerFiltered);
        setNonHistorySuggestions(nonHistoryFiltered);

        if (suggestionToDelete?.url) {
          await window.vibe.profile?.deleteFromHistory?.(
            suggestionToDelete.url,
          );
          // Clear cache to force a reload on next query
          historyCache.current.clear();
          // Optionally, you can trigger a re-fetch of history here
          loadAllHistoryForWorker(true); // Pass a flag to force reload
        }
      } catch (error) {
        logger.error("Failed to delete history item:", error);
      }
    },
    [
      dropdownSuggestions,
      loadAllHistoryForWorker,
      updateWorkerResults,
      workerSuggestions,
    ],
  );

  // Get current active tab and load history
  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        // Debug: Check if vibe APIs are available
        logger.debug("🔍 Checking vibe APIs availability:", {
          hasVibe: !!window.vibe,
          hasProfile: !!window.vibe?.profile,
          hasGetNavigationHistory: !!window.vibe?.profile?.getNavigationHistory,
          hasTabs: !!window.vibe?.tabs,
          hasGetActiveTabKey: !!window.vibe?.tabs?.getActiveTabKey,
        });

        if (!window.vibe?.tabs?.getActiveTabKey) {
          logger.error("❌ window.vibe.tabs.getActiveTabKey not available");
          return;
        }

        const activeTabKey = await window.vibe.tabs.getActiveTabKey();
        logger.debug("🔍 Active tab key:", activeTabKey);

        if (activeTabKey) {
          setCurrentTabKey(activeTabKey);

          const activeTab = await window.vibe.tabs.getActiveTab();
          logger.debug("🔍 Active tab:", activeTab);

          if (activeTab) {
            setInputValue(activeTab.url || "");
            setOriginalUrl(activeTab.url || "");
            setNavigationState(prev => ({
              ...prev,
              url: activeTab.url || "",
              title: activeTab.title || "",
              canGoBack: activeTab.canGoBack || false,
              canGoForward: activeTab.canGoForward || false,
              isLoading: activeTab.isLoading || false,
            }));
          }
        }
      } catch (error) {
        logger.error("Failed to get active tab:", error);
      }
    };

    getCurrentTab();
  }, []);

  // Load history data for the worker on mount
  useEffect(() => {
    // Preload history data in background for better performance
    const preloadHistory = async () => {
      try {
        await loadAllHistoryForWorker();
      } catch (error) {
        logger.error("Failed to preload history:", error);
      }
    };

    // Use requestIdleCallback for better performance if available
    if (window.requestIdleCallback) {
      window.requestIdleCallback(() => preloadHistory());
    } else {
      // Fallback to setTimeout for browsers without requestIdleCallback
      setTimeout(preloadHistory, 100);
    }
  }, [loadAllHistoryForWorker]);

  // Test effect to check APIs on mount
  useEffect(() => {
    const testAPIs = async () => {
      logger.debug("🧪 Testing APIs on mount...");

      try {
        // Test if window.vibe exists
        if (!window.vibe) {
          logger.error("❌ window.vibe is not available");
          return;
        }

        logger.debug("✅ window.vibe is available");

        // Test profile API
        if (!window.vibe.profile) {
          logger.error("❌ window.vibe.profile is not available");
          return;
        }

        logger.debug("✅ window.vibe.profile is available");

        // Test getNavigationHistory
        if (!window.vibe.profile.getNavigationHistory) {
          logger.error(
            "❌ window.vibe.profile.getNavigationHistory is not available",
          );
          return;
        }

        logger.debug(
          "✅ window.vibe.profile.getNavigationHistory is available",
        );

        // Test tabs API
        if (!window.vibe.tabs) {
          logger.error("❌ window.vibe.tabs is not available");
          return;
        }

        logger.debug("✅ window.vibe.tabs is available");

        // Test getActiveTabKey
        if (!window.vibe.tabs.getActiveTabKey) {
          logger.error("❌ window.vibe.tabs.getActiveTabKey is not available");
          return;
        }

        logger.debug("✅ window.vibe.tabs.getActiveTabKey is available");

        // Try to get active tab
        const activeTabKey = await window.vibe.tabs.getActiveTabKey();
        logger.debug("🧪 Active tab key:", activeTabKey);

        // Try to get navigation history
        const history = await window.vibe.profile.getNavigationHistory("", 5);
        logger.debug("🧪 Navigation history sample:", history);
      } catch (error) {
        logger.error("❌ API test failed:", error);
      }
    };

    testAPIs();
  }, []);

  // Monitor tab state changes
  useEffect(() => {
    if (!window.vibe?.tabs?.onTabStateUpdate) {
      return;
    }

    const cleanup = window.vibe.tabs.onTabStateUpdate(tabState => {
      if (tabState.key === currentTabKey) {
        // Only update input value if user is not typing
        if (!isUserTyping) {
          setInputValue(tabState.url || "");
          setOriginalUrl(tabState.url || "");
        }
        setNavigationState(prev => ({
          ...prev,
          url: tabState.url || "",
          title: tabState.title || "",
          canGoBack: tabState.canGoBack || false,
          canGoForward: tabState.canGoForward || false,
          isLoading: tabState.isLoading || false,
        }));
      }
    });

    return cleanup;
  }, [currentTabKey, isUserTyping]);

  // Listen for tab switching events
  useEffect(() => {
    const cleanup = window.vibe.tabs.onTabSwitched(switchData => {
      const newTabKey = switchData.to;
      if (newTabKey && newTabKey !== currentTabKey) {
        setCurrentTabKey(newTabKey);

        window.vibe.tabs
          .getTab(newTabKey)
          .then(newTab => {
            if (newTab) {
              // Only update input value if user is not typing
              if (!isUserTyping) {
                setInputValue(newTab.url || "");
                setOriginalUrl(newTab.url || "");
              }
              setNavigationState(prev => ({
                ...prev,
                url: newTab.url || "",
                title: newTab.title || "",
                canGoBack: newTab.canGoBack || false,
                canGoForward: newTab.canGoForward || false,
                isLoading: newTab.isLoading || false,
              }));
            }
          })
          .catch(error => {
            logger.error("Failed to get switched tab details:", error);
          });
      }
    });

    return cleanup;
  }, [currentTabKey]);

  // Monitor agent status
  useEffect(() => {
    const checkAgentStatus = async () => {
      try {
        const status = await window.vibe.chat.getAgentStatus();
        setAgentStatus(status);
      } catch (error) {
        logger.error("Failed to check agent status:", error);
      }
    };

    checkAgentStatus();

    const cleanup = window.vibe.chat.onAgentStatusChanged(status => {
      setAgentStatus(status);
    });

    return cleanup;
  }, []);

  // Validation helpers
  const isValidURL = (string: string): boolean => {
    try {
      const searchIndicators =
        /\s|^(what|when|where|why|how|who|is|are|do|does|can|will|should)/i;
      if (searchIndicators.test(string.trim())) {
        return false;
      }

      const withProtocol = string.includes("://")
        ? string
        : `https://${string}`;

      const url = new URL(withProtocol);

      if (!url.hostname.includes(".") || url.hostname.includes(" ")) {
        return false;
      }

      const hostnamePattern =
        /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$/;
      return hostnamePattern.test(url.hostname);
    } catch {
      return false;
    }
  };

  // Generate non-history suggestions (URL, search, tabs)
  const generateNonHistorySuggestions = useCallback(
    async (input: string): Promise<Suggestion[]> => {
      const suggestions: Suggestion[] = [];

      if (!input.trim()) return [];

      const inputType = isValidURL(input) ? "url" : "search";
      const inputLower = input.toLowerCase();

      try {
        // Add primary suggestion based on input type
        if (inputType === "url") {
          suggestions.push({
            id: "navigate-url",
            type: "url",
            text: input,
            url: input.includes("://") ? input : `https://${input}`,
            icon: <GlobalOutlined />,
            description: "Navigate to URL",
          });
        } else {
          const defaultSearchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) ||
            "perplexity";

          let searchUrl;
          let searchDescription;

          if (defaultSearchEngine === "perplexity") {
            searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(input)}`;
            searchDescription = "AI-powered search with Perplexity";
          } else if (defaultSearchEngine === "google") {
            searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
            searchDescription = "Search with Google";
          } else {
            searchUrl = `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(input)}`;
            searchDescription = `Search with ${defaultSearchEngine}`;
          }

          suggestions.push({
            id: "search-query",
            type: "search",
            text: input,
            url: searchUrl,
            icon: <SearchOutlined />,
            description: searchDescription,
          });
        }

        // Get open tabs
        const tabs = await window.vibe.tabs.getTabs();
        const tabMatches = tabs
          .filter(
            tab =>
              tab.key !== currentTabKey &&
              ((tab.title && tab.title.toLowerCase().includes(inputLower)) ||
                (tab.url && tab.url.toLowerCase().includes(inputLower))),
          )
          .slice(0, 2)
          .map((tab, index) => ({
            id: `tab-${index}`,
            type: "context" as const,
            text: `Switch to: ${tab.title || "Untitled"}`,
            url: tab.key,
            icon: <LinkOutlined />,
            description: tab.url || "No URL",
          }));

        suggestions.push(...tabMatches);
      } catch (error) {
        logger.error("Failed to generate non-history suggestions:", error);
      }

      return suggestions;
    },
    [currentTabKey],
  );

  // Navigation handlers
  const handleBack = useCallback(async () => {
    if (currentTabKey && navigationState.canGoBack) {
      try {
        await window.vibe.page.goBack(currentTabKey);
      } catch (error) {
        logger.error("Failed to go back:", error);
      }
    }
  }, [currentTabKey, navigationState.canGoBack]);

  const handleForward = useCallback(async () => {
    if (currentTabKey && navigationState.canGoForward) {
      try {
        await window.vibe.page.goForward(currentTabKey);
      } catch (error) {
        logger.error("Failed to go forward:", error);
      }
    }
  }, [currentTabKey, navigationState.canGoForward]);

  const handleReload = useCallback(async () => {
    if (currentTabKey) {
      try {
        await window.vibe.page.reload(currentTabKey);
      } catch (error) {
        logger.error("Failed to reload:", error);
      }
    }
  }, [currentTabKey]);

  const handleToggleChat = useCallback(async () => {
    try {
      const newVisibility = !chatPanelVisible;
      window.vibe.interface.toggleChatPanel(newVisibility);
      setChatPanelVisible(newVisibility);
    } catch (error) {
      logger.error("Failed to toggle chat:", error);
    }
  }, [chatPanelVisible, setChatPanelVisible]);

  // Simplified input handling
  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputValue(value);
      setIsUserTyping(true);
      setShowSuggestions(true);

      // Search in worker immediately
      searchInWorker(value);

      // Generate non-history suggestions in parallel
      generateNonHistorySuggestions(value).then(setNonHistorySuggestions);
    },
    [searchInWorker, generateNonHistorySuggestions],
  );

  const handleInputFocus = () => {
    inputRef.current?.select();
    setIsUserTyping(true);
    setShowSuggestions(true);
    setOriginalUrl(inputValue);

    // Pre-load necessary data
    loadAllHistoryForWorker();
    searchInWorker(inputValue);
    generateNonHistorySuggestions(inputValue).then(setNonHistorySuggestions);
  };

  const handleInputBlur = () => {
    // Use a short timeout to allow clicks on the dropdown to register
    setTimeout(() => {
      setIsUserTyping(false);
      setShowSuggestions(false);
    }, 150);
  };

  useEffect(() => {}, [showSuggestions]);

  // Log OmniboxDropdown props before rendering
  // Remove all console.log calls from this file

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions && e.key !== "Enter") return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev => {
          // If nothing selected, select first item
          if (prev === -1) return 0;
          // Otherwise move down
          const newIndex =
            prev < dropdownSuggestions.length - 1 ? prev + 1 : prev;
          return newIndex;
        });
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => {
          const newIndex = prev > 0 ? prev - 1 : -1;
          return newIndex;
        });
        break;
      case "Tab":
        e.preventDefault();
        if (showSuggestions && selectedIndex >= 0) {
          handleSuggestionClick(dropdownSuggestions[selectedIndex]);
        }
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && dropdownSuggestions[selectedIndex]) {
          handleSuggestionClick(dropdownSuggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case "Escape":
        // Restore original URL
        setInputValue(originalUrl);
        setIsUserTyping(false);
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSubmit = async () => {
    if (!currentTabKey) return;

    try {
      let finalUrl = inputValue;

      if (!inputValue.includes("://")) {
        if (isValidURL(inputValue)) {
          finalUrl = `https://${inputValue}`;
        } else {
          const searchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) || "google";

          if (searchEngine === "perplexity") {
            finalUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(inputValue)}`;
          } else if (searchEngine === "google") {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`;
          }
        }
      }

      if (finalUrl) {
        await window.vibe.page.navigate(currentTabKey, finalUrl);
        setInputValue(finalUrl);
        setOriginalUrl(finalUrl);
      }
    } catch (error) {
      logger.error("Failed to handle input submit:", error);
    }
  };

  return (
    <div className="navigation-bar">
      <div className="navigation-bar-left">
        <button onClick={handleBack} disabled={!navigationState.canGoBack}>
          <LeftOutlined />
        </button>
        <button onClick={handleReload} disabled={navigationState.isLoading}>
          <ReloadOutlined />
        </button>
        <button
          onClick={handleForward}
          disabled={!navigationState.canGoForward}
        >
          <RightOutlined />
        </button>
      </div>
      <div className="navigation-bar-center">
        <input
          type="text"
          placeholder="Search or type URL"
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onKeyDown={handleKeyDown}
          ref={inputRef}
        />
        <OmniboxDropdown
          suggestions={dropdownSuggestions}
          onSuggestionClick={handleSuggestionClick}
          onDeleteHistory={handleDeleteHistory}
          selectedIndex={selectedIndex}
          isVisible={showSuggestions}
          omnibarRef={inputRef}
        />
      </div>
      <div className="navigation-bar-right">
        <button onClick={handleToggleChat} disabled={agentStatus}>
          <RobotOutlined />
        </button>
      </div>
    </div>
  );
};

export default NavigationBar;
