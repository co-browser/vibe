/**
 * Enhanced NavigationBar component
 * Provides browser navigation controls and intelligent omnibar using vibe APIs
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
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
  description?: string;
  metadata?: any;
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

  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize overlay hook early to avoid initialization errors
  const overlayCallbacks = {
    onSuggestionClick: (suggestion: any) => {
      // This will be properly defined later via handleSuggestionClick
      if (suggestion.type === "context" && suggestion.url) {
        window.vibe.tabs.switchToTab(suggestion.url);
      } else if (suggestion.type === "agent" && suggestion.metadata) {
        if (suggestion.metadata.action === "ask-agent") {
          window.vibe.interface.toggleChatPanel(true);
        }
      } else if (suggestion.url && currentTabKey) {
        window.vibe.page.navigate(currentTabKey, suggestion.url);
        setInputValue(suggestion.text);
      }
      setShowSuggestions(false);
      inputRef.current?.blur();
    },
    onEscape: () => {
      setShowSuggestions(false);
      inputRef.current?.blur();
    },
    onDeleteHistory: (suggestionId: string) => {
      setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
      // TODO: Implement actual history deletion
    },
  };

  const {
    showSuggestions: showOverlaySuggestions,
    hideSuggestions: hideOverlaySuggestions,
  } = useOmniboxOverlay(overlayCallbacks);

  // Use overlay system for suggestions
  useEffect(() => {
    if (showSuggestions && suggestions.length > 0 && inputRef.current) {
      const bounds = inputRef.current.getBoundingClientRect();

      // Convert suggestions to serializable format (remove React components)
      const serializableSuggestions = suggestions.map(s => ({
        ...s,
        icon: undefined, // Remove React component
        iconType: getIconType(s), // Add icon type for overlay to recreate
      }));

      showOverlaySuggestions(serializableSuggestions, bounds);
    } else {
      hideOverlaySuggestions();
    }
  }, [
    showSuggestions,
    suggestions,
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
      new URL(string.includes("://") ? string : `https://${string}`);
      return true;
    } catch {
      return false;
    }
  };

  const isDomain = (string: string): boolean => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    return domainRegex.test(string);
  };

  const detectInputType = (input: string): "url" | "domain" | "search" => {
    if (isValidURL(input)) return "url";
    if (isDomain(input)) return "domain";
    return "search";
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
      if (!input.trim()) return [];

      console.log("[NavigationBar] Generating suggestions for:", input);
      const suggestions: Suggestion[] = [];
      const inputType = detectInputType(input);
      const inputLower = input.toLowerCase();
      console.log("[NavigationBar] Input type detected:", inputType);

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
        } else if (inputType === "domain") {
          suggestions.push({
            id: "navigate-domain",
            type: "url",
            text: input,
            url: `https://${input}`,
            icon: <GlobalOutlined />,
            description: "Go to website",
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
            text: `Search for "${input}"`,
            url: searchUrl,
            icon: <SearchOutlined />,
            description: searchDescription,
          });
        }

        // Get browsing history from user profile
        try {
          console.log("[NavigationBar] Checking for profile API...");
          const profileHistory =
            (await (window.vibe as any).profile?.getNavigationHistory(
              input,
              5,
            )) || [];
          console.log("[NavigationBar] Profile history:", profileHistory);
          if (profileHistory.length === 0) {
            console.log(
              "[NavigationBar] No profile history found, profile might not be active",
            );
          }
          const historyMatches = profileHistory.map((entry, index) => ({
            id: `history-${index}`,
            type: "history" as const,
            text: entry.title || entry.url || "Untitled",
            url: entry.url || "",
            icon: <ClockCircleOutlined />,
            description: `${entry.url} - Visited ${entry.visitCount} times`,
            metadata: entry,
          }));

          suggestions.push(...historyMatches);
        } catch (error) {
          console.error("Failed to get profile history:", error);

          // Fallback to saved contexts if profile history fails
          const contexts = await window.vibe.content.getSavedContexts();
          const historyMatches = contexts
            .filter(
              ctx =>
                (ctx.url && ctx.url.toLowerCase().includes(inputLower)) ||
                (ctx.title && ctx.title.toLowerCase().includes(inputLower)),
            )
            .slice(0, 3)
            .map((ctx, index) => ({
              id: `history-${index}`,
              type: "history" as const,
              text: ctx.title || ctx.url || "Untitled",
              url: ctx.url || "",
              icon: <ClockCircleOutlined />,
              description: ctx.url,
            }));

          suggestions.push(...historyMatches);
        }

        // Get current tabs for "switch to tab" suggestions
        const tabs = await window.vibe.tabs.getTabs();
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
        if (inputType === "search") {
          const agentSuggestions = await getLocalAgentSuggestions(input);
          suggestions.push(...agentSuggestions);
        }

        // Fetch Perplexity suggestions for search queries
        if (inputType === "search" && input.length > 2) {
          console.log("[NavigationBar] Fetching Perplexity suggestions...");
          try {
            const perplexityResponse = await fetchPerplexitySuggestions(input);
            console.log(
              "[NavigationBar] Perplexity response:",
              perplexityResponse,
            );
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
      } catch (error) {
        console.error("Failed to generate suggestions:", error);

        // Fallback to basic search suggestion
        if (suggestions.length === 0) {
          suggestions.push({
            id: "fallback-search",
            type: "search",
            text: `Search for "${input}"`,
            url: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
            icon: <SearchOutlined />,
            description: "Search with Google",
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
    [currentTabKey, detectInputType],
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

  // Input handling with debouncing
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    console.log("[NavigationBar] Input changed to:", value);

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    if (value.trim()) {
      // Show immediate feedback that we're loading
      setShowSuggestions(true);
      setSuggestions([]); // Clear old suggestions

      // Debounce API calls
      debounceTimerRef.current = setTimeout(async () => {
        console.log(
          "[NavigationBar] Debounce timer fired, generating suggestions...",
        );
        const newSuggestions = await generateRealSuggestions(value);
        console.log("[NavigationBar] Setting suggestions:", newSuggestions);
        setSuggestions(newSuggestions);
        setShowSuggestions(newSuggestions.length > 0);
        setSelectedIndex(-1);
      }, 200);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(-1);
    }
  };

  const handleInputFocus = async () => {
    // Select all text when focusing the input
    inputRef.current?.select();

    if (inputValue.trim() && suggestions.length === 0) {
      const newSuggestions = await generateRealSuggestions(inputValue);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    } else if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
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
          // Only navigate directly if it's a valid domain/URL
          const trimmedInput = inputValue.trim();
          if (isDomain(trimmedInput) || isValidURL(trimmedInput)) {
            // It's a domain/URL, navigate to it
            handleSubmit();
          }
          // If it's not a domain/URL, do nothing on Tab
          // User must press Enter to search
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
        if (isDomain(inputValue) || isValidURL(inputValue)) {
          finalUrl = `https://${inputValue}`;
        } else {
          // Search query
          const searchEngine =
            (await window.vibe.settings.get("defaultSearchEngine")) ||
            "perplexity";

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
        isSearch:
          !isDomain(inputValue) &&
          !isValidURL(inputValue) &&
          !inputValue.includes("://"),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to navigate:", error);
    }
  };

  const handleSuggestionClick = useCallback(
    async (suggestion: Suggestion) => {
      try {
        if (suggestion.type === "context" && suggestion.url) {
          // Switch to existing tab
          await window.vibe.tabs.switchToTab(suggestion.url);
        } else if (suggestion.type === "agent" && suggestion.metadata) {
          // Handle agent action
          if (suggestion.metadata.action === "ask-agent") {
            // Open chat panel and send query
            await window.vibe.interface.toggleChatPanel(true);
            // In a real implementation, you would send the query to the agent
            console.log("Asking agent:", suggestion.metadata.query);
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

        setShowSuggestions(false);
        inputRef.current?.blur();
      } catch (error) {
        console.error("Failed to handle suggestion click:", error);
      }
    },
    [currentTabKey],
  );

  // Removed old dropdown IPC listeners - now handled by overlay hook

  return (
    <div className="navigation-bar">
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

          {/* Suggestions now rendered in separate WebContentsView via overlay */}
        </div>
      </div>
    </div>
  );
};

export default NavigationBar;
