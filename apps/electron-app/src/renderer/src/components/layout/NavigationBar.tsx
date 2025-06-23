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
import "../styles/NavigationBar.css";

interface Suggestion {
  id: string;
  type: "url" | "search" | "history" | "bookmark" | "context";
  text: string;
  url?: string;
  icon: React.ReactNode;
  description?: string;
}

interface TabNavigationState {
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  url: string;
  title: string;
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
  const suggestionsRef = useRef<HTMLDivElement>(null);

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

  const detectInputType = useCallback((input: string): "url" | "domain" | "search" => {
    if (isValidURL(input)) return "url";
    if (isDomain(input)) return "domain";
    return "search";
  }, []);

  // Generate intelligent suggestions using vibe APIs
  const generateRealSuggestions = useCallback(
    async (input: string): Promise<Suggestion[]> => {
      if (!input.trim()) return [];

      const suggestions: Suggestion[] = [];
      const inputType = detectInputType(input);
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
            (await window.vibe.settings.get("defaultSearchEngine")) || "google";
          suggestions.push({
            id: "search-query",
            type: "search",
            text: `Search for "${input}"`,
            url: `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(input)}`,
            icon: <SearchOutlined />,
            description: `Search with ${defaultSearchEngine}`,
          });
        }

        // Get real browsing history from saved contexts
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

      return suggestions.slice(0, 6); // Limit to 6 suggestions
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

  // Telemetry handlers are now passed as props from BrowserUI

  // Input handling
  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);

    if (value.trim()) {
      const newSuggestions = await generateRealSuggestions(value);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
    }
    setSelectedIndex(-1);
  };

  const handleInputFocus = async () => {
    if (inputValue.trim()) {
      const newSuggestions = await generateRealSuggestions(inputValue);
      setSuggestions(newSuggestions);
      setShowSuggestions(newSuggestions.length > 0);
    }
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => setShowSuggestions(false), 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions) return;

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
            (await window.vibe.settings.get("defaultSearchEngine")) || "google";
          finalUrl = `https://www.${searchEngine}.com/search?q=${encodeURIComponent(inputValue)}`;
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

  const handleSuggestionClick = async (suggestion: Suggestion) => {
    try {
      if (suggestion.type === "context" && suggestion.url) {
        // Switch to existing tab
        await window.vibe.tabs.switchToTab(suggestion.url);
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
  };

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

          {showSuggestions && suggestions.length > 0 && (
            <div ref={suggestionsRef} className="omnibar-suggestions">
              {suggestions.map((suggestion, index) => (
                <div
                  key={suggestion.id}
                  className={`suggestion-item ${index === selectedIndex ? "selected" : ""}`}
                  onClick={() => handleSuggestionClick(suggestion)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <div className="suggestion-icon">{suggestion.icon}</div>
                  <div className="suggestion-content">
                    <div className="suggestion-text">{suggestion.text}</div>
                    {suggestion.description && (
                      <div className="suggestion-description">
                        {suggestion.description}
                      </div>
                    )}
                  </div>
                  <div className="suggestion-type">{suggestion.type}</div>
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
