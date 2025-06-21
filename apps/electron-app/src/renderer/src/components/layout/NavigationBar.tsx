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
  SettingOutlined,
  SafetyCertificateTwoTone,
  LinkOutlined,
} from "@ant-design/icons";
import "../styles/NavigationBar.css";
import { AutoComplete, Input, Tooltip } from "antd";
import type { InputRef } from "antd";
import { useLayout } from "../../hooks/useLayout";
import { GlowingEffect } from "../ui/glowing-effect";

interface OptionType {
  value: string;
  label: string;
  icon?: React.ReactNode;
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
  const [value, setValue] = useState<string>("");
  const [options, setOptions] = useState<OptionType[]>([]);
  const [currentTabKey, setCurrentTabKey] = useState<string>("");
  const [navigationState, setNavigationState] = useState<TabNavigationState>({
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    url: "",
    title: "",
  });
  const [agentStatus, setAgentStatus] = useState<boolean>(false);

  // Use LayoutContext instead of local state for chat panel
  const { isChatPanelVisible, setChatPanelVisible } = useLayout();

  const inputRef = useRef<InputRef>(null);

  // Clean up event listeners on component unmount
  useEffect(() => {
    // Listen for window opened events
    const unsubscribeOpened = window.vibe?.interface?.onPopupWindowOpened?.(
      (data: any) => {
        console.log(`${data.type} window opened with ID: ${data.windowId}`);
      },
    );

    // Listen for window closed events
    const unsubscribeClosed = window.vibe?.interface?.onPopupWindowClosed?.(
      (data: any) => {
        console.log(`${data.type} window closed`);
      },
    );

    return () => {
      unsubscribeOpened?.();
      unsubscribeClosed?.();
    };
  }, []);

  // Get current active tab
  useEffect(() => {
    const getCurrentTab = async (): Promise<void> => {
      try {
        // Check if vibe API is available
        if (!window.vibe?.tabs?.getActiveTabKey) {
          return;
        }

        // Use active tab API instead of tabs[0]
        const activeTabKey = await window.vibe.tabs.getActiveTabKey();
        if (activeTabKey) {
          setCurrentTabKey(activeTabKey);

          // Get the active tab details
          const activeTab = await window.vibe.tabs.getActiveTab();
          if (activeTab) {
            setValue(activeTab.url || "");
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

    const cleanup = window.vibe.tabs.onTabStateUpdate((tabState: any) => {
      if (tabState.key === currentTabKey) {
        setValue(tabState.url || "");
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
    if (!window.vibe?.tabs?.onTabSwitched) {
      return;
    }

    const cleanup = window.vibe.tabs.onTabSwitched((switchData: any) => {
      // Update to the new active tab
      const newTabKey = switchData.to;
      if (newTabKey && newTabKey !== currentTabKey) {
        setCurrentTabKey(newTabKey);

        // Get the new tab's details
        window.vibe.tabs
          .getTab(newTabKey)
          .then((newTab: any) => {
            if (newTab) {
              setValue(newTab.url || "");
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
          .catch((error: Error) => {
            console.error("Failed to get switched tab details:", error);
          });
      }
    });

    return cleanup;
  }, [currentTabKey]);

  // Monitor agent status
  useEffect(() => {
    const checkAgentStatus = async (): Promise<void> => {
      try {
        const status = await window.vibe?.chat?.getAgentStatus?.();
        setAgentStatus(status || false);
      } catch (error) {
        console.error("Failed to check agent status:", error);
      }
    };

    checkAgentStatus();

    // Listen for agent status changes
    const cleanup = window.vibe?.chat?.onAgentStatusChanged?.(
      (status: boolean) => {
        setAgentStatus(status);
      },
    );

    return cleanup;
  }, []);

  // Validation helpers
  const isValidURL = useCallback((string: string): boolean => {
    try {
      new URL(string.includes("://") ? string : `https://${string}`);
      return true;
    } catch {
      return false;
    }
  }, []);

  const isDomain = useCallback((string: string): boolean => {
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-_.]*[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    return domainRegex.test(string);
  }, []);

  const detectInputType = useCallback(
    (input: string): "url" | "domain" | "search" => {
      if (isValidURL(input)) return "url";
      if (isDomain(input)) return "domain";
      return "search";
    },
    [isValidURL, isDomain],
  );

  // Generate intelligent suggestions using vibe APIs
  const generateSuggestions = useCallback(
    async (input: string): Promise<OptionType[]> => {
      if (!input.trim()) return [];

      console.log("Generating suggestions for:", input);
      const suggestions: OptionType[] = [];
      const inputType = detectInputType(input);
      const inputLower = input.toLowerCase();

      try {
        // Add Perplexity search suggestions for every keystroke
        if (input.trim().length > 0) {
          const perplexitySearchUrl = `https://www.perplexity.ai/?q=${encodeURIComponent(input)}`;
          suggestions.push({
            value: perplexitySearchUrl,
            label: `Search Perplexity: "${input}"`,
            icon: <SearchOutlined />,
            description: "AI-powered search with Perplexity",
          });
        }

        // Add primary suggestion based on input type
        if (inputType === "url") {
          suggestions.push({
            value: input,
            label: input,
            icon: <GlobalOutlined />,
            description: "Navigate to URL",
          });
        } else if (inputType === "domain") {
          const url = `https://${input}`;
          suggestions.push({
            value: url,
            label: input,
            icon: <GlobalOutlined />,
            description: "Go to website",
          });
        } else {
          // Add search suggestion
          const defaultSearchEngine =
            (await window.vibe?.settings?.get?.("defaultSearchEngine")) ||
            "google";
          const searchUrl = `https://www.${defaultSearchEngine}.com/search?q=${encodeURIComponent(input)}`;
          suggestions.push({
            value: searchUrl,
            label: `Search for "${input}"`,
            icon: <SearchOutlined />,
            description: `Search with ${defaultSearchEngine}`,
          });
        }

        // Get real browsing history from saved contexts
        const contexts =
          (await window.vibe?.content?.getSavedContexts?.()) || [];
        console.log("Found contexts:", contexts.length);
        const historyMatches = contexts
          .filter(
            (ctx: any) =>
              (ctx.url && ctx.url.toLowerCase().includes(inputLower)) ||
              (ctx.title && ctx.title.toLowerCase().includes(inputLower)),
          )
          .slice(0, 3)
          .map((ctx: any) => ({
            value: ctx.url || "",
            label: ctx.title || ctx.url || "Untitled",
            icon: <ClockCircleOutlined />,
            description: ctx.url,
          }));

        suggestions.push(...historyMatches);

        // Get current tabs for "switch to tab" suggestions
        const tabs = (await window.vibe?.tabs?.getTabs?.()) || [];
        console.log("Found tabs:", tabs.length);
        const tabMatches = tabs
          .filter(
            (tab: any) =>
              tab.key !== currentTabKey && // Don't suggest current tab
              ((tab.title && tab.title.toLowerCase().includes(inputLower)) ||
                (tab.url && tab.url.toLowerCase().includes(inputLower))),
          )
          .slice(0, 2)
          .map((tab: any) => ({
            value: tab.key, // Use tab key as value for tab switching
            label: `Switch to: ${tab.title || "Untitled"}`,
            icon: <LinkOutlined />,
            description: tab.url || "No URL",
          }));

        suggestions.push(...tabMatches);

        console.log("Generated suggestions:", suggestions.length, suggestions);
      } catch (error) {
        console.error("Failed to generate suggestions:", error);

        // Fallback to basic search suggestion
        if (suggestions.length === 0) {
          suggestions.push({
            value: `https://www.google.com/search?q=${encodeURIComponent(input)}`,
            label: `Search for "${input}"`,
            icon: <SearchOutlined />,
            description: "Search with Google",
          });
        }
      }

      return suggestions.slice(0, 8); // Increased limit to accommodate Perplexity suggestions
    },
    [currentTabKey, detectInputType],
  );

  // Navigation handlers using vibe APIs
  const handleBack = useCallback(async (): Promise<void> => {
    if (currentTabKey && navigationState.canGoBack) {
      try {
        await window.vibe?.page?.goBack?.(currentTabKey);

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

  const handleForward = useCallback(async (): Promise<void> => {
    if (currentTabKey && navigationState.canGoForward) {
      try {
        await window.vibe?.page?.goForward?.(currentTabKey);

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

  const handleReload = useCallback(async (): Promise<void> => {
    if (currentTabKey) {
      try {
        await window.vibe?.page?.reload?.(currentTabKey);

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

  const handleToggleChat = useCallback(async (): Promise<void> => {
    try {
      const newVisibility = !isChatPanelVisible;
      await window.vibe?.interface?.toggleChatPanel?.(newVisibility);
      setChatPanelVisible(newVisibility);
    } catch (error) {
      console.error("Failed to toggle chat:", error);
    }
  }, [isChatPanelVisible, setChatPanelVisible]);

  const openSettings = useCallback(async (): Promise<void> => {
    try {
      const result = await window.vibe?.interface?.openSettingsWindow?.();
      if (result?.success) {
        console.log("Settings window opened with ID:", result.windowId);
      } else {
        console.error("Failed to open settings:", result?.error);
      }
    } catch (error) {
      console.error("Error opening settings window:", error);
    }
  }, []);

  // Input handling
  const handleSearch = useCallback(
    async (searchText: string): Promise<void> => {
      console.log("handleSearch called with:", searchText);
      setValue(searchText);

      // Generate suggestions for any non-empty input (including single characters for Perplexity)
      if (searchText.trim()) {
        try {
          const newOptions = await generateSuggestions(searchText);
          console.log("Setting options:", newOptions.length, newOptions);
          setOptions(newOptions);
        } catch (error) {
          console.error("Failed to generate suggestions:", error);
          setOptions([]);
        }
      } else {
        console.log("Clearing options - empty search text");
        setOptions([]);
      }
    },
    [generateSuggestions],
  );

  const handleValueChange = useCallback(
    (newValue: string): void => {
      console.log("handleValueChange called with:", newValue);
      setValue(newValue);

      // Always trigger search when value changes (for Perplexity suggestions)
      if (newValue.trim()) {
        handleSearch(newValue);
      } else {
        setOptions([]);
      }
    },
    [handleSearch],
  );

  const handleSubmit = useCallback(async (): Promise<void> => {
    if (!currentTabKey) return;

    try {
      let finalUrl = value;

      if (!value.includes("://")) {
        if (isDomain(value) || isValidURL(value)) {
          finalUrl = `https://${value}`;
        } else {
          // Search query
          const searchEngine =
            (await window.vibe?.settings?.get?.("defaultSearchEngine")) ||
            "google";
          finalUrl = `https://www.${searchEngine}.com/search?q=${encodeURIComponent(value)}`;
        }
      }

      await window.vibe?.page?.navigate?.(currentTabKey, finalUrl);
      inputRef.current?.input?.blur();
      setOptions([]); // Clear options after navigation

      // Track navigation
      (window as any).umami?.track?.("page-navigated", {
        action: "url-entered",
        isSearch:
          !isDomain(value) && !isValidURL(value) && !value.includes("://"),
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error("Failed to navigate:", error);
    }
  }, [currentTabKey, value, isDomain, isValidURL]);

  const onSelect = useCallback(
    async (selectedValue: string): Promise<void> => {
      console.log("Selected:", selectedValue);
      setValue(selectedValue);
      setOptions([]); // Clear options after selection

      try {
        if (currentTabKey) {
          // Check if this is a tab switch (tab keys are usually UUIDs)
          if (selectedValue.length > 20 && !selectedValue.includes("://")) {
            // Likely a tab key, switch to that tab
            await window.vibe?.tabs?.switchToTab?.(selectedValue);
          } else {
            // Navigate to URL
            await window.vibe?.page?.navigate?.(currentTabKey, selectedValue);
          }

          inputRef.current?.input?.blur();
        }
      } catch (error) {
        console.error("Failed to handle selection:", error);
      }
    },
    [currentTabKey],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === "Enter") {
        event.preventDefault();
        handleSubmit();
      } else if (event.key === "Tab") {
        if (options.length > 0) {
          event.preventDefault();
          onSelect(options[0].value);
        }
      }
    },
    [options, handleSubmit, onSelect],
  );

  // Determine if popover should be open
  const isPopoverOpen = value.trim().length > 0 && options.length > 0;

  console.log("Popover state:", {
    value: value,
    valueTrimmed: value.trim(),
    optionsLength: options.length,
    isPopoverOpen: isPopoverOpen,
    hasValue: value.trim().length > 0,
    hasOptions: options.length > 0,
  });

  // Debug: Log when options change
  useEffect(() => {
    console.log("Options changed:", options);
  }, [options]);

  // Debug: Log when value changes
  useEffect(() => {
    console.log("Value changed:", value);
  }, [value]);

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
        <div id="show-agent-chat-onboarding">
          <button
            id="toggle-chat-button"
            className={`nav-button ${isChatPanelVisible ? "active" : ""} ${agentStatus ? "enabled" : ""}`}
            onClick={handleToggleChat}
            title={
              agentStatus ? "Toggle AI assistant" : "AI assistant not available"
            }
            disabled={!agentStatus}
          >
            <RobotOutlined />
          </button>
        </div>
      </div>

      <div className="omnibar-container">
        <div className="omnibar-wrapper">
          <div className="relative">
            <GlowingEffect
              blur={10}
              inactiveZone={0.8}
              proximity={100}
              spread={30}
              variant="default"
              glow={true}
              disabled={false}
              movementDuration={1.5}
              borderWidth={2}
              className="rounded-lg"
            />
            <AutoComplete
              value={value}
              options={options}
              style={{ width: "100%" }}
              onSearch={handleSearch}
              onSelect={onSelect}
              onChange={handleValueChange}
              filterOption={false}
              placeholder="Search or enter URL..."
              open={isPopoverOpen}
              dropdownStyle={{
                zIndex: 3000,
                backgroundColor: "var(--input-background)",
                border: "1px solid var(--nav-border)",
                borderRadius: "12px",
                boxShadow:
                  "0 8px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.05)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
              dropdownClassName="omnibar-autocomplete-dropdown"
              notFoundContent={null}
              backfill={false}
            >
              <Input
                ref={inputRef}
                size="middle"
                className="relative z-10 bg-white/90 backdrop-blur-sm border-transparent hover:border-transparent focus:border-transparent"
                prefix={
                  <Tooltip title="Security info">
                    <SafetyCertificateTwoTone twoToneColor="#D4D4D8" />
                  </Tooltip>
                }
                onKeyDown={handleKeyDown}
                onPressEnter={handleSubmit}
              />
            </AutoComplete>
          </div>
        </div>
      </div>

      <button
        className="nav-button"
        onClick={openSettings}
        title="Open Settings"
      >
        <SettingOutlined />
      </button>
    </div>
  );
};

export default NavigationBar;
