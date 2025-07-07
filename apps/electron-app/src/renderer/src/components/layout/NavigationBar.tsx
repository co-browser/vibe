/**
 * Enhanced NavigationBar component
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
  ClockCircleOutlined,
  GlobalOutlined,
  LinkOutlined,
} from "@ant-design/icons";
import { useOmniboxOverlay } from "../../hooks/useOmniboxOverlay";
import {
  useContextMenu,
  NavigationContextMenuItems,
} from "../../hooks/useContextMenu";
import type { SuggestionMetadata } from "../../../../types/metadata";
import { MetadataHelpers } from "../../../../types/metadata";
import "../styles/NavigationBar.css";

interface Suggestion {
  id: string;
  type:
    | "url"
    | "search"
    | "history"
    | "bookmark"
    | "context"
    | "perplexity"
    | "agent";
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

interface PerplexityResponse {
  query: string;
  suggestions: Array<{
    text: string;
    url?: string;
    snippet?: string;
  }>;
}

/**
 * Enhanced navigation bar component with direct vibe API integration
 */
const NavigationBar: React.FC = () => {
  const [currentTabKey, setCurrentTabKey] = useState<string>("");
  const [inputValue, setInputValue] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
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
  const [chatPanelVisible, setChatPanelVisible] = useState(false);
  const [overlaySystemWorking, setOverlaySystemWorking] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const blurTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastOperationRef = useRef<number>(0);
  const { handleContextMenu } = useContextMenu();

  // Performance optimization: Cache recent history queries
  const historyCache = useRef<Map<string, { data: any[]; timestamp: number }>>(
    new Map(),
  );
  const CACHE_DURATION = 30000; // 30 seconds cache

  // Cache cleanup function to prevent memory leaks
  const cleanupHistoryCache = useCallback(() => {
    const now = Date.now();
    const entries = Array.from(historyCache.current.entries());

    // Remove entries older than cache duration
    entries.forEach(([key, value]) => {
      if (now - value.timestamp > CACHE_DURATION) {
        historyCache.current.delete(key);
      }
    });

    // Limit cache size more aggressively to prevent unbounded growth
    if (historyCache.current.size > 20) {
      const sortedEntries = entries
        .filter(([, value]) => now - value.timestamp <= CACHE_DURATION)
        .sort((a, b) => b[1].timestamp - a[1].timestamp);
      const toKeep = sortedEntries.slice(0, 15);
      historyCache.current.clear();
      toKeep.forEach(([key, value]) => historyCache.current.set(key, value));
    }
  }, [CACHE_DURATION]);

  // --- Performance Improvement: Stabilize overlay callbacks ---
  // By wrapping callbacks in useCallback, we prevent them from being recreated on every render,
  // which makes the useOmniboxOverlay hook more efficient.
  const handleOverlaySuggestionClick = useCallback(
    (suggestion: any) => {
      try {
        console.log("[NavigationBar] Overlay suggestion clicked:", suggestion);

        // Immediately hide suggestions and blur for instant UI response
        setShowSuggestions(false);
        inputRef.current?.blur();

        // Clear any pending blur timeout when suggestion is clicked
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = null;
        }

        // Handle navigation asynchronously without blocking UI
        setTimeout(async () => {
          try {
            if (suggestion.type === "context" && suggestion.url) {
              await window.vibe.tabs.switchToTab(suggestion.url);
            } else if (suggestion.type === "agent" && suggestion.metadata) {
              if (suggestion.metadata.action === "ask-agent") {
                await window.vibe.interface.toggleChatPanel(true);
              }
            } else if (suggestion.url && currentTabKey) {
              await window.vibe.page.navigate(currentTabKey, suggestion.url);
              setInputValue(suggestion.text);
            } else if (suggestion.type === "search" && currentTabKey) {
              const defaultSearchEngine =
                (await window.vibe.settings.get("defaultSearchEngine")) ||
                "perplexity";
              let searchUrl = `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(suggestion.text)}`;
              if (defaultSearchEngine === "perplexity") {
                searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(suggestion.text)}`;
              } else if (defaultSearchEngine === "google") {
                searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.text)}`;
              }
              await window.vibe.page.navigate(currentTabKey, searchUrl);
              setInputValue(suggestion.text);
            }
          } catch (error) {
            console.error("Failed to handle navigation:", error);
          }
        }, 0);
      } catch (error) {
        console.error("Failed to handle overlay suggestion click:", error);
        setShowSuggestions(false);
      }
    },
    [currentTabKey],
  );

  const handleOverlayEscape = useCallback(() => {
    setShowSuggestions(false);
    inputRef.current?.blur();
  }, []);

  const handleDeleteHistory = useCallback(
    async (suggestionId: string) => {
      try {
        console.log("[NavigationBar] Deleting history item:", suggestionId);
        const suggestionToDelete = suggestions.find(s => s.id === suggestionId);
        setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
        if (suggestionToDelete?.url) {
          await window.vibe.profile?.deleteFromHistory?.(
            suggestionToDelete.url,
          );
          historyCache.current.clear();
        }
      } catch (error) {
        console.error("Failed to delete history item:", error);
      }
    },
    [suggestions],
  );

  // Initialize overlay hook early to avoid initialization errors
  const overlayCallbacks = useMemo(
    () => ({
      onSuggestionClick: handleOverlaySuggestionClick,
      onEscape: handleOverlayEscape,
      onDeleteHistory: handleDeleteHistory,
      onNavigateAndClose: (url: string) => {
        if (currentTabKey) {
          window.vibe.page.navigate(currentTabKey, url);
        }
        setShowSuggestions(false);
        inputRef.current?.blur();
      },
    }),
    [
      handleOverlaySuggestionClick,
      handleOverlayEscape,
      handleDeleteHistory,
      currentTabKey,
    ],
  );
  // -------------------------------------------------------------

  const {
    showSuggestions: showOverlaySuggestions,
    hideOverlay: hideOverlaySuggestions,
    clearOverlay: forceClearOverlay,
    reEnableOverlay: reEnableOverlaySystem,
  } = useOmniboxOverlay(overlayCallbacks);

  // Global keyboard listener for force clearing stuck overlays
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Force clear stuck overlay with Ctrl+Shift+Escape from anywhere
      if (e.ctrlKey && e.shiftKey && e.key === "Escape") {
        forceClearOverlay();
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }

      // Debug overlay state with Ctrl+Shift+D
      if (e.ctrlKey && e.shiftKey && e.key === "D") {
        // Debug overlay state (silent)
      }

      // Re-enable overlay system with Ctrl+Shift+R
      if (e.ctrlKey && e.shiftKey && e.key === "R") {
        reEnableOverlaySystem();
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [
    forceClearOverlay,
    showSuggestions,
    suggestions.length,
    selectedIndex,
    inputValue,
    currentTabKey,
    reEnableOverlaySystem,
  ]);

  // Periodic check for stuck overlays
  useEffect(() => {
    const checkForStuckOverlay = () => {
      // If suggestions should be hidden but overlay might still be showing
      if (!showSuggestions && suggestions.length === 0) {
        // Force clear any stuck overlay
        forceClearOverlay();
      }
    };

    const interval = setInterval(checkForStuckOverlay, 5000); // Check every 5 seconds

    return () => {
      clearInterval(interval);
    };
  }, [showSuggestions, suggestions.length, forceClearOverlay]);

  // Periodic cache cleanup to prevent memory leaks
  useEffect(() => {
    const interval = setInterval(cleanupHistoryCache, 60000); // Clean every minute
    return () => clearInterval(interval);
  }, [cleanupHistoryCache]);

  // Cleanup timeouts and overlay on unmount
  useEffect(() => {
    return () => {
      // Clear all timeout refs and nullify them
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (blurTimeoutRef.current) {
        clearTimeout(blurTimeoutRef.current);
        blurTimeoutRef.current = null;
      }

      // Clear history cache to prevent memory leaks - copy ref to avoid React warning
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const cache = historyCache.current;
      cache.clear();

      // Reset operation counter
      lastOperationRef.current = 0;

      // Ensure overlay is cleared on unmount
      hideOverlaySuggestions();
    };
  }, [hideOverlaySuggestions, cleanupHistoryCache]);

  // Use overlay system for suggestions
  useEffect(() => {
    // Check if overlay system is available
    if (!window.electron?.ipcRenderer) {
      setOverlaySystemWorking(false);
      return;
    }

    if (showSuggestions && suggestions.length > 0) {
      // Convert suggestions to serializable format (remove React components)
      const serializableSuggestions = suggestions.map(s => ({
        ...s,
        icon: undefined, // Remove React component
        iconType: getIconType(s), // Add icon type for overlay to recreate
      }));

      console.log(
        "[NavigationBar] Showing suggestions to overlay:",
        serializableSuggestions.length,
        "suggestions",
      );

      // Call the overlay hook with the correct parameters
      const overlaySuccess = showOverlaySuggestions(serializableSuggestions);

      if (!overlaySuccess) {
        console.warn(
          "[NavigationBar] Overlay system failed, suggestions will show in fallback dropdown",
        );
        setOverlaySystemWorking(false);
      } else {
        setOverlaySystemWorking(true);
      }
    } else if (!showSuggestions) {
      console.log("[NavigationBar] Hiding suggestions from overlay");
      hideOverlaySuggestions();
    }
  }, [
    showSuggestions,
    suggestions,
    selectedIndex,
    showOverlaySuggestions,
    hideOverlaySuggestions,
  ]);

  // Helper to get icon type from suggestion
  const getIconType = (suggestion: Suggestion): string => {
    switch (suggestion.type) {
      case "search":
      case "perplexity":
        return "search";
      case "history":
        return "clock";
      case "url":
        return "global";
      case "context":
        return "link";
      case "agent":
        return "robot";
      default:
        return "search";
    }
  };

  // Get current active tab
  useEffect(() => {
    const getCurrentTab = async () => {
      try {
        // Check if vibe API is available
        if (!window.vibe?.tabs?.getActiveTabKey) {
          return;
        }

        // ✅ FIX: Use active tab API instead of tabs[0]
        const activeTabKey = await window.vibe.tabs.getActiveTabKey();
        if (activeTabKey) {
          setCurrentTabKey(activeTabKey);

          // Get the active tab details
          const activeTab = await window.vibe.tabs.getActiveTab();
          if (activeTab) {
            setInputValue(activeTab.url || "");
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
        console.error("Failed to get active tab:", error);
      }
    };

    getCurrentTab();
  }, []);

  // Monitor tab state changes
  useEffect(() => {
    if (!window.vibe?.tabs?.onTabStateUpdate) {
      return;
    }

    const cleanup = window.vibe.tabs.onTabStateUpdate(tabState => {
      if (tabState.key === currentTabKey) {
        setInputValue(tabState.url || "");
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
  }, [currentTabKey]);

  // Listen for tab switching events to update current tab
  useEffect(() => {
    const cleanup = window.vibe.tabs.onTabSwitched(switchData => {
      // Update to the new active tab
      const newTabKey = switchData.to;
      if (newTabKey && newTabKey !== currentTabKey) {
        setCurrentTabKey(newTabKey);

        // Get the new tab's details
        window.vibe.tabs
          .getTab(newTabKey)
          .then(newTab => {
            if (newTab) {
              setInputValue(newTab.url || "");
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
            console.error("Failed to get switched tab details:", error);
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
        console.error("Failed to check agent status:", error);
      }
    };

    checkAgentStatus();

    // Listen for agent status changes
    const cleanup = window.vibe.chat.onAgentStatusChanged(status => {
      setAgentStatus(status);
    });

    return cleanup;
  }, []);

  // Monitor chat panel visibility
  useEffect(() => {
    const getChatPanelState = async () => {
      try {
        const state = await window.vibe.interface.getChatPanelState();
        setChatPanelVisible(state.isVisible);
      } catch (error) {
        console.error("Failed to get chat panel state:", error);
      }
    };

    getChatPanelState();

    // Listen for chat panel visibility changes
    const cleanup = window.vibe.interface.onChatPanelVisibilityChanged(
      isVisible => {
        setChatPanelVisible(isVisible);
      },
    );

    return cleanup;
  }, []);

  // This useEffect will be moved after handleSuggestionClick is defined

  // Validation helpers
  const isValidURL = (string: string): boolean => {
    try {
      // First check if it's obviously a search query (contains spaces or question words)
      const searchIndicators =
        /\s|^(what|when|where|why|how|who|is|are|do|does|can|will|should)/i;
      if (searchIndicators.test(string.trim())) {
        return false;
      }

      const withProtocol = string.includes("://")
        ? string
        : `https://${string}`;

      // Try to create URL
      const url = new URL(withProtocol);

      // Additional validation: must have a valid hostname with at least one dot
      // and shouldn't contain spaces in the hostname
      if (!url.hostname.includes(".") || url.hostname.includes(" ")) {
        return false;
      }

      // Check if hostname looks like a real domain (basic validation)
      const hostnamePattern =
        /^[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*(\.[a-zA-Z0-9][a-zA-Z0-9-]*[a-zA-Z0-9]*)*\.[a-zA-Z]{2,}$/;
      return hostnamePattern.test(url.hostname);
    } catch {
      return false;
    }
  };

  // Helper to format last visit time in a user-friendly way
  const formatLastVisit = (lastVisit: number): string => {
    const now = Date.now();
    const diff = now - lastVisit;
    const minutes = Math.floor(diff / (1000 * 60));
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return new Date(lastVisit).toLocaleDateString();
  };

  // Perplexity API call for search suggestions
  const fetchPerplexitySuggestions = async (
    query: string,
  ): Promise<PerplexityResponse> => {
    try {
      // For suggestions, we'll use a simpler approach - just search for the query
      // Note: In production, you'd want to handle authentication properly
      const searchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`;

      // For now, we'll generate suggestions based on the query
      // In a real implementation, you might want to:
      // 1. Use a proper API endpoint if Perplexity provides one
      // 2. Handle authentication
      // 3. Parse actual search results

      // Generate intelligent suggestions based on query
      const suggestions: Array<{
        text: string;
        url?: string;
        snippet?: string;
      }> = [];

      // Add direct Perplexity search
      suggestions.push({
        text: `Search "${query}" on Perplexity`,
        url: searchUrl,
        snippet: `Get AI-powered answers about ${query}`,
      });

      // Add common search variations
      if (query.split(" ").length === 1) {
        suggestions.push({
          text: `What is ${query}?`,
          url: `https://www.perplexity.ai/search?q=${encodeURIComponent(`What is ${query}`)}`,
          snippet: `Learn about ${query} with AI-powered search`,
        });

        suggestions.push({
          text: `${query} news`,
          url: `https://www.perplexity.ai/search?q=${encodeURIComponent(`${query} news`)}`,
          snippet: `Latest news and updates about ${query}`,
        });
      }

      // Add domain-specific suggestions based on query patterns
      if (query.toLowerCase().includes("how to")) {
        suggestions.push({
          text: `${query} tutorial`,
          url: `https://www.perplexity.ai/search?q=${encodeURIComponent(`${query} tutorial`)}`,
          snippet: `Step-by-step guide for ${query}`,
        });
      }

      return {
        query,
        suggestions: suggestions.slice(0, 3), // Limit to 3 suggestions
      };
    } catch (error) {
      console.error("Failed to fetch Perplexity suggestions:", error);
      // Fallback to basic suggestion
      return {
        query,
        suggestions: [
          {
            text: `Search "${query}" on Perplexity`,
            url: `https://www.perplexity.ai/search?q=${encodeURIComponent(query)}`,
            snippet: `Get AI-powered answers about ${query}`,
          },
        ],
      };
    }
  };

  // Mock local agent suggestions
  const getLocalAgentSuggestions = async (
    query: string,
  ): Promise<Suggestion[]> => {
    // Mock implementation - in real app, this would query the local agent
    await new Promise(resolve => setTimeout(resolve, 100));

    return [
      {
        id: "agent-1",
        type: "agent",
        text: `Ask agent about "${query}"`,
        icon: <RobotOutlined />,
        description: "Get AI-powered insights from your local agent",
        metadata: { action: "ask-agent", query },
      },
    ];
  };

  // Generate intelligent suggestions using vibe APIs
  const generateRealSuggestions = useCallback(
    async (input: string): Promise<Suggestion[]> => {
      const suggestions: Suggestion[] = [];

      // Show most frequently visited sites for empty input
      if (!input.trim()) {
        try {
          console.log("[NavigationBar] Getting top sites for empty input");
          const topSites =
            (await window.vibe.profile?.getNavigationHistory?.("", 10)) || [];
          console.log(
            "[NavigationBar] Top sites result:",
            topSites.length,
            "entries",
          );

          // Sort by visit count and recency for better ranking
          const sortedSites = topSites.sort((a, b) => {
            const now = Date.now();
            const aRecency = Math.pow(
              0.95,
              (now - a.lastVisit) / (1000 * 60 * 60 * 24),
            );
            const bRecency = Math.pow(
              0.95,
              (now - b.lastVisit) / (1000 * 60 * 60 * 24),
            );
            const aScore = Math.pow(a.visitCount, 2) * aRecency;
            const bScore = Math.pow(b.visitCount, 2) * bRecency;
            return bScore - aScore;
          });

          return sortedSites.map((entry, index) => ({
            id: `top-site-${index}`,
            type: "history" as const,
            text: entry.title || entry.url || "Untitled",
            url: entry.url || "",
            icon: <ClockCircleOutlined />,
            description: `Visited ${entry.visitCount} times • ${formatLastVisit(entry.lastVisit)}`,
            metadata: entry,
          }));
        } catch (error) {
          console.error("Failed to get top sites:", error);
        }
        return [];
      }

      console.log("[NavigationBar] Generating suggestions for:", input);

      // Detect input type
      const detectInputType = (input: string): "url" | "search" => {
        if (isValidURL(input)) return "url";
        return "search";
      };

      const inputType = detectInputType(input);
      const inputLower = input.toLowerCase();
      console.log("[NavigationBar] Input type detected:", inputType);

      // --- Performance Improvement: Parallelize async data fetching ---
      // Start fetching non-dependent data sources concurrently.
      const tabsPromise = window.vibe.tabs.getTabs();
      const agentPromise =
        inputType === "search"
          ? getLocalAgentSuggestions(input)
          : Promise.resolve([]);
      const perplexityPromise =
        inputType === "search" && input.length > 2
          ? fetchPerplexitySuggestions(input)
          : Promise.resolve(null);
      // ----------------------------------------------------------------

      try {
        // Get browsing history FIRST with high priority
        let historySuggestions: Suggestion[] = [];
        try {
          // Check cache first for performance
          const cacheKey = input.toLowerCase();
          const cached = historyCache.current.get(cacheKey);
          let profileHistory: any[] = [];

          if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            profileHistory = cached.data;
            console.log("[NavigationBar] Using cached history for:", input);
          } else {
            console.log("[NavigationBar] Fetching fresh history for:", input);
            // Get more history entries for better coverage
            profileHistory =
              (await window.vibe.profile?.getNavigationHistory?.(
                input,
                12, // Increased to 12 for better coverage
              )) || [];

            console.log(
              "[NavigationBar] Profile history result:",
              profileHistory.length,
              "entries",
            );

            // Cache the result
            historyCache.current.set(cacheKey, {
              data: profileHistory,
              timestamp: Date.now(),
            });

            // Clean old cache entries (keep cache size manageable)
            if (historyCache.current.size > 50) {
              const oldestKey = historyCache.current.keys().next().value;
              if (oldestKey) {
                historyCache.current.delete(oldestKey);
              }
            }
          }

          if (profileHistory.length > 0) {
            const historyMatches = profileHistory
              .filter(entry => entry.url !== navigationState.url) // Filter out current page
              .map((entry, index) => ({
                id: `history-${entry.url}-${index}`,
                type: "history" as const,
                text: entry.title || entry.url || "Untitled",
                url: entry.url ?? "",
                icon: <ClockCircleOutlined />,
                description: `Visited ${entry.visitCount} time${entry.visitCount !== 1 ? "s" : ""} • ${formatLastVisit(entry.lastVisit)}`,
                metadata: entry,
              }));

            console.log(
              "[NavigationBar] History matches:",
              historyMatches.length,
              "items",
            );

            // Enhanced scoring: heavily weight visit count and recency
            historyMatches.sort((a, b) => {
              const aEntry = a.metadata;
              const bEntry = b.metadata;
              const now = Date.now();

              // Calculate recency factor (more recent = much higher score)
              const aRecency = Math.pow(
                0.95,
                (now - aEntry.lastVisit) / (1000 * 60 * 60 * 24),
              );
              const bRecency = Math.pow(
                0.95,
                (now - bEntry.lastVisit) / (1000 * 60 * 60 * 24),
              );

              // Heavily weight visit count (squared for exponential importance)
              const aScore = Math.pow(aEntry.visitCount, 2) * aRecency;
              const bScore = Math.pow(bEntry.visitCount, 2) * bRecency;

              return bScore - aScore;
            });

            historySuggestions = historyMatches;
          } else {
            console.log("[NavigationBar] No history matches found for:", input);
          }
        } catch (error) {
          console.error("Failed to get profile history:", error);
        }

        // Add history suggestions FIRST (highest priority)
        suggestions.push(...historySuggestions);

        // Add primary suggestion based on input type (after history)
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
          // Add search suggestion
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

        // Fallback to saved contexts if no history found
        if (historySuggestions.length === 0) {
          try {
            const contexts = await window.vibe.content.getSavedContexts();
            const contextMatches = contexts
              .filter(
                ctx =>
                  (ctx.url && ctx.url.toLowerCase().includes(inputLower)) ||
                  (ctx.title && ctx.title.toLowerCase().includes(inputLower)),
              )
              .slice(0, 3)
              .map((ctx, index) => ({
                id: `context-${index}`,
                type: "history" as const,
                text: ctx.title || ctx.url || "Untitled",
                url: ctx.url || "",
                icon: <ClockCircleOutlined />,
                description: ctx.url,
              }));

            suggestions.push(...contextMatches);
          } catch (fallbackError) {
            console.error("Fallback context retrieval failed:", fallbackError);
          }
        }

        // --- Performance Improvement: Await parallel fetches ---
        const [tabs, agentSuggestions, perplexityResponse] = await Promise.all([
          tabsPromise,
          agentPromise,
          perplexityPromise,
        ]);

        // Process tab suggestions
        const tabMatches = tabs
          .filter(
            tab =>
              tab.key !== currentTabKey && // Don't suggest current tab
              ((tab.title && tab.title.toLowerCase().includes(inputLower)) ||
                (tab.url && tab.url.toLowerCase().includes(inputLower))),
          )
          .slice(0, 2)
          .map((tab, index) => ({
            id: `tab-${index}`,
            type: "context" as const,
            text: `Switch to: ${tab.title || "Untitled"}`,
            url: tab.key, // Use tab key as URL for tab switching
            icon: <LinkOutlined />,
            description: tab.url || "No URL",
          }));

        suggestions.push(...tabMatches);

        // Add local agent suggestions
        suggestions.push(...agentSuggestions);

        // Process Perplexity suggestions
        if (perplexityResponse) {
          try {
            const perplexitySuggestions = perplexityResponse.suggestions.map(
              (s, index) => ({
                id: `perplexity-${index}`,
                type: "perplexity" as const,
                text: s.text,
                url: s.url,
                icon: <SearchOutlined />,
                description: s.snippet || s.url,
              }),
            );
            suggestions.push(...perplexitySuggestions);
          } catch (error) {
            console.error("Failed to fetch Perplexity suggestions:", error);
          }
        }
        // ---------------------------------------------------------
      } catch (error) {
        console.error("Failed to generate suggestions:", error);

        // Fallback to basic search suggestion using default search engine
        if (suggestions.length === 0) {
          const defaultSearchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) ||
            "perplexity";

          let fallbackSearchUrl;
          let fallbackDescription;

          if (defaultSearchEngine === "perplexity") {
            fallbackSearchUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(input)}`;
            fallbackDescription = "AI-powered search with Perplexity";
          } else if (defaultSearchEngine === "google") {
            fallbackSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(input)}`;
            fallbackDescription = "Search with Google";
          } else {
            fallbackSearchUrl = `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(input)}`;
            fallbackDescription = `Search with ${defaultSearchEngine}`;
          }

          suggestions.push({
            id: "fallback-search",
            type: "search",
            text: input,
            url: fallbackSearchUrl,
            icon: <SearchOutlined />,
            description: fallbackDescription,
          });
        }
      }

      console.log(
        "[NavigationBar] Total suggestions generated:",
        suggestions.length,
        suggestions,
      );
      return suggestions;
    },
    [currentTabKey, navigationState.url],
  );

  // Navigation handlers using vibe APIs
  const handleBack = useCallback(async () => {
    if (currentTabKey && navigationState.canGoBack) {
      try {
        await window.vibe.page.goBack(currentTabKey);

        // Track navigation
        (window as any).umami?.track?.("page-navigated", {
          action: "back",
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Failed to go back:", error);
      }
    }
  }, [currentTabKey, navigationState.canGoBack]);

  const handleForward = useCallback(async () => {
    if (currentTabKey && navigationState.canGoForward) {
      try {
        await window.vibe.page.goForward(currentTabKey);

        // Track navigation
        (window as any).umami?.track?.("page-navigated", {
          action: "forward",
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Failed to go forward:", error);
      }
    }
  }, [currentTabKey, navigationState.canGoForward]);

  const handleReload = useCallback(async () => {
    if (currentTabKey) {
      try {
        await window.vibe.page.reload(currentTabKey);

        // Track navigation
        (window as any).umami?.track?.("page-navigated", {
          action: "reload",
          timestamp: Date.now(),
        });
      } catch (error) {
        console.error("Failed to reload:", error);
      }
    }
  }, [currentTabKey]);

  const handleToggleChat = useCallback(async () => {
    try {
      const newVisibility = !chatPanelVisible;
      window.vibe.interface.toggleChatPanel(newVisibility);
      setChatPanelVisible(newVisibility);
    } catch (error) {
      console.error("Failed to toggle chat:", error);
    }
  }, [chatPanelVisible]);

  // Input handling with debouncing and race condition prevention
  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      const operationId = Date.now();
      lastOperationRef.current = operationId;

      setInputValue(value);
      console.log("[NavigationBar] Input changed to:", value);

      // Clear existing timer and nullify ref
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }

      if (value.trim()) {
        // Show immediate feedback that we're loading
        setShowSuggestions(true);
        setSuggestions([]); // Clear old suggestions

        // Reduced debounce for more responsive autocomplete
        debounceTimerRef.current = setTimeout(async () => {
          // Check if operation is still current
          if (lastOperationRef.current !== operationId) return;

          try {
            console.log(
              "[NavigationBar] Debounce timer fired, generating suggestions...",
            );
            const newSuggestions = await generateRealSuggestions(value);

            // Double-check operation is still current after async operation
            if (lastOperationRef.current === operationId) {
              console.log(
                "[NavigationBar] Setting suggestions:",
                newSuggestions,
              );
              setSuggestions(newSuggestions);
              setShowSuggestions(newSuggestions.length > 0);
              setSelectedIndex(-1);
            }
          } catch (error) {
            console.error("Failed to generate suggestions:", error);
            // Only update state if operation is still current
            if (lastOperationRef.current === operationId) {
              setSuggestions([]);
              setShowSuggestions(false);
            }
          } finally {
            // Clear timer ref if this is still the current operation
            if (lastOperationRef.current === operationId) {
              debounceTimerRef.current = null;
            }
          }
        }, 100); // Reduced from 200ms to 100ms for better responsiveness
      } else {
        setSuggestions([]);
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    },
    [generateRealSuggestions],
  );

  const handleInputFocus = async () => {
    // Select all text when focusing the input
    inputRef.current?.select();

    if (inputValue.trim() && suggestions.length === 0) {
      const newSuggestions = await generateRealSuggestions(inputValue);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    } else if (suggestions.length > 0) {
      setShowSuggestions(true);
    } else {
      // Show top sites when focusing empty input
      const topSites = await generateRealSuggestions("");
      if (topSites.length > 0) {
        setSuggestions(topSites);
        setShowSuggestions(true);
      }
    }
  };

  const handleInputBlur = useCallback(() => {
    // Clear any existing blur timeout to prevent multiple timeouts
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }

    // Delay hiding suggestions to allow for clicks on suggestions
    blurTimeoutRef.current = setTimeout(() => {
      console.log("[NavigationBar] Blur timeout fired, hiding suggestions");
      setShowSuggestions(false);
      setSelectedIndex(-1);
      blurTimeoutRef.current = null;
    }, 150); // Reduced timeout for better responsiveness
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Force clear stuck overlay with Ctrl+Shift+Escape
    if (e.ctrlKey && e.shiftKey && e.key === "Escape") {
      e.preventDefault();
      console.log("[NavigationBar] Force clearing stuck overlay");
      forceClearOverlay();
      setShowSuggestions(false);
      setSelectedIndex(-1);
      return;
    }

    if (!showSuggestions && e.key !== "Enter") return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev,
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIndex(prev => (prev > 0 ? prev - 1 : -1));
        break;
      case "Tab":
        e.preventDefault();
        if (showSuggestions && selectedIndex >= 0) {
          // If a suggestion is selected, use it
          handleSuggestionClick(suggestions[selectedIndex]);
        } else if (inputValue.trim()) {
          // Only navigate directly if it's a valid URL
          const trimmedInput = inputValue.trim();
          if (isValidURL(trimmedInput)) {
            // It's a valid URL, navigate to it
            handleSubmit();
          } else {
            // It's not a valid URL - do nothing on Tab
            // User must press Enter to search
            console.log(
              "[NavigationBar] Tab pressed but input is not a valid URL, not navigating",
            );
          }
        }
        break;
      case "Enter":
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else {
          handleSubmit();
        }
        break;
      case "Escape":
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
          // Search query
          const searchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) || "google";

          if (searchEngine === "perplexity") {
            finalUrl = `https://www.perplexity.ai/search?q=${encodeURIComponent(inputValue)}`;
          } else if (searchEngine === "google") {
            finalUrl = `https://www.google.com/search?q=${encodeURIComponent(inputValue)}`;
          } else {
            finalUrl = `https://www.${searchEngine}.com/search?q=${encodeURIComponent(inputValue)}`;
          }
        }
      }

      await window.vibe.page.navigate(currentTabKey, finalUrl);
      setShowSuggestions(false);
      inputRef.current?.blur();

      // Track navigation
      (window as any).umami?.track?.("page-navigated", {
        action: "url-entered",
        isSearch: !isValidURL(inputValue) && !inputValue.includes("://"),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to navigate:", error);
    }
  };

  const handleSuggestionClick = useCallback(
    async (suggestion: Suggestion) => {
      try {
        console.log("[NavigationBar] Suggestion clicked:", suggestion);

        // Immediately hide suggestions to prevent stuck overlay
        setShowSuggestions(false);

        // Clear any pending blur timeout when suggestion is clicked
        if (blurTimeoutRef.current) {
          clearTimeout(blurTimeoutRef.current);
          blurTimeoutRef.current = null;
        }

        if (suggestion.type === "context" && suggestion.url) {
          // Switch to existing tab
          await window.vibe.tabs.switchToTab(suggestion.url);
        } else if (suggestion.type === "agent" && suggestion.metadata) {
          // Handle agent action using type-safe metadata access
          if (MetadataHelpers.isAgentActionMetadata(suggestion.metadata)) {
            if (suggestion.metadata.action === "ask-agent") {
              // Open chat panel and send query
              await window.vibe.interface.toggleChatPanel(true);
              // In a real implementation, you would send the query to the agent
              console.log("Asking agent:", suggestion.metadata.query);
            }
          }
        } else if (suggestion.url && currentTabKey) {
          // Navigate to URL
          await window.vibe.page.navigate(currentTabKey, suggestion.url);
          setInputValue(suggestion.text);

          // Track navigation via suggestion
          (window as any).umami?.track?.("page-navigated", {
            action: "suggestion-clicked",
            suggestionType: suggestion.type,
            timestamp: Date.now(),
          });
        }

        inputRef.current?.blur();
      } catch (error) {
        console.error("Failed to handle suggestion click:", error);
        // Ensure suggestions are hidden even on error
        setShowSuggestions(false);
      }
    },
    [currentTabKey],
  );

  // Removed old dropdown IPC listeners - now handled by overlay hook

  // Context menu items for navigation
  const getNavigationContextMenuItems = () => [
    { ...NavigationContextMenuItems.back, enabled: navigationState.canGoBack },
    {
      ...NavigationContextMenuItems.forward,
      enabled: navigationState.canGoForward,
    },
    NavigationContextMenuItems.reload,
    NavigationContextMenuItems.separator,
    {
      ...NavigationContextMenuItems.copyUrl,
      data: { url: navigationState.url },
    },
  ];

  return (
    <div
      className="navigation-bar"
      onContextMenu={handleContextMenu(getNavigationContextMenuItems())}
    >
      <div className="nav-controls">
        <button
          className={`nav-button ${navigationState.canGoBack ? "enabled" : ""}`}
          onClick={handleBack}
          disabled={!navigationState.canGoBack}
          title="Go back"
        >
          <LeftOutlined />
        </button>
        <button
          className={`nav-button ${navigationState.canGoForward ? "enabled" : ""}`}
          onClick={handleForward}
          disabled={!navigationState.canGoForward}
          title="Go forward"
        >
          <RightOutlined />
        </button>
        <button
          className="nav-button"
          onClick={handleReload}
          title="Reload page"
        >
          <ReloadOutlined spin={navigationState.isLoading} />
        </button>
        <button
          className={`nav-button ${chatPanelVisible ? "active" : ""} ${agentStatus ? "enabled" : ""}`}
          onClick={handleToggleChat}
          title={
            agentStatus ? "Toggle AI assistant" : "AI assistant not available"
          }
          disabled={!agentStatus}
        >
          <RobotOutlined />
        </button>
      </div>

      <div className="omnibar-container">
        <div className="omnibar-wrapper">
          <input
            ref={inputRef}
            className="omnibar-input"
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder="Search or enter URL"
            aria-label="Search or enter URL"
            spellCheck={false}
            autoComplete="off"
          />

          {/* Overlay status indicator */}
          {showSuggestions && !overlaySystemWorking && (
            <div
              className="overlay-status-indicator"
              title="Overlay system disabled - Using fallback dropdown"
              onClick={() => {
                console.log("[NavigationBar] Overlay system is disabled");
              }}
            >
              <span style={{ fontSize: "10px", color: "#FF6B6B" }}>⚠</span>
            </div>
          )}

          {/* Fallback suggestions dropdown when overlay is disabled */}
          {showSuggestions &&
            suggestions.length > 0 &&
            !overlaySystemWorking && (
              <div className="omnibar-suggestions-fallback">
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.id}
                    className={`suggestion-item-fallback ${index === selectedIndex ? "selected" : ""}`}
                    onClick={() => handleSuggestionClick(suggestion)}
                  >
                    <div className="suggestion-icon-fallback">
                      {suggestion.iconType === "search" && "🔍"}
                      {suggestion.iconType === "clock" && "🕐"}
                      {suggestion.iconType === "global" && "🌐"}
                      {suggestion.iconType === "link" && "🔗"}
                      {suggestion.iconType === "robot" && "🤖"}
                      {!suggestion.iconType && "📄"}
                    </div>
                    <div className="suggestion-content-fallback">
                      <div className="suggestion-text-fallback">
                        {suggestion.text}
                      </div>
                      {suggestion.description && (
                        <div className="suggestion-description-fallback">
                          {suggestion.description}
                        </div>
                      )}
                    </div>
                    <div className="suggestion-type-fallback">
                      {suggestion.type}
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;
