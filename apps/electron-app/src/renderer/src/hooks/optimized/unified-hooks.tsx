import React, { 
  useState, 
  useEffect, 
  useRef, 
  useCallback, 
  useMemo,
  useContext,
  createContext
} from "react";
import type { ChatMessage } from "@vibe/shared-types";

/**
 * Unified Hooks - Consolidated Hook System
 * 
 * Consolidates multiple hooks into optimized, focused functionality:
 * - useAgentStatus
 * - useAutoScroll  
 * - useChatInput
 * - useChatEvents
 * - useTabContext
 * - useBrowserProgress
 * - useStreamingContent
 * 
 * Benefits:
 * - Reduced hook overhead through consolidation
 * - Better performance with shared state
 * - Consistent API across all hooks
 * - Easier maintenance and debugging
 */

// === Shared Types ===

interface AgentStatus {
  isActive: boolean;
  isProcessing: boolean;
  lastActivity: number | null;
}

interface ChatState {
  messages: ChatMessage[];
  isGenerating: boolean;
  currentInput: string;
  streamingContent: {
    currentReasoningText: string;
    hasLiveReasoning: boolean;
  };
}

interface TabContextItem {
  key: string;
  title?: string;
  url?: string;
  favicon?: string;
  isLoading?: boolean;
}

interface BrowserProgress {
  isActive: boolean;
  currentAction: string;
  progressText: string;
}

// === Shared Context ===

interface AppContextType {
  agentStatus: AgentStatus;
  chatState: ChatState;
  tabContext: TabContextItem[];
  browserProgress: BrowserProgress;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Centralized state management
  const [agentStatus, setAgentStatus] = useState<AgentStatus>({
    isActive: false,
    isProcessing: false,
    lastActivity: null,
  });

  const [chatState] = useState<ChatState>({
    messages: [],
    isGenerating: false,
    currentInput: "",
    streamingContent: {
      currentReasoningText: "",
      hasLiveReasoning: false,
    },
  });

  const [tabContext, setTabContext] = useState<TabContextItem[]>([]);
  
  const [browserProgress, setBrowserProgress] = useState<BrowserProgress>({
    isActive: false,
    currentAction: "",
    progressText: "",
  });

  // Initialize global listeners
  useEffect(() => {
    const cleanupFunctions: (() => void)[] = [];

    const initializeListeners = async () => {
      try {
        // Agent status monitoring
        if (window.vibe?.chat) {
          const agentCleanup = window.vibe.chat.onAgentStatusChanged((status: any) => {
            setAgentStatus(prev => ({
              ...prev,
              isActive: status.isActive || false,
              isProcessing: status.isProcessing || false,
              lastActivity: status.lastActivity || Date.now(),
            }));
          });
          cleanupFunctions.push(agentCleanup);

          // Initial agent status
          const initialStatus = await window.vibe.chat.getAgentStatus();
          setAgentStatus({
            isActive: initialStatus?.isActive || false,
            isProcessing: initialStatus?.isProcessing || false,
            lastActivity: initialStatus?.lastActivity || null,
          });
        }

        // Tab context monitoring
        if (window.vibe?.tabs) {
          const tabCleanup = window.vibe.tabs.onTabStateUpdate((tabState: any) => {
            setTabContext(prev => {
              const existing = prev.find(tab => tab.key === tabState.key);
              if (existing) {
                return prev.map(tab => 
                  tab.key === tabState.key 
                    ? { ...tab, ...tabState }
                    : tab
                );
              } else {
                return [...prev, tabState];
              }
            });
          });
          cleanupFunctions.push(tabCleanup);

          // Initial tab context
          const tabs = await window.vibe.tabs.getTabs();
          setTabContext(tabs || []);
        }

        // Browser progress monitoring (simplified)
        if (window.vibe?.browser) {
          const progressCleanup = window.vibe.browser.onProgressUpdate?.((progress: any) => {
            setBrowserProgress({
              isActive: progress.isActive || false,
              currentAction: progress.action || "",
              progressText: progress.text || "",
            });
          });
          if (progressCleanup) cleanupFunctions.push(progressCleanup);
        }

      } catch (error) {
        console.error("Failed to initialize app context listeners:", error);
      }
    };

    initializeListeners();

    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, []);

  const contextValue = useMemo(() => ({
    agentStatus,
    chatState,
    tabContext,
    browserProgress,
  }), [agentStatus, chatState, tabContext, browserProgress]);

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  );
};

// === Unified Hooks ===

/**
 * Base hook for accessing app context
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used within AppContextProvider");
  }
  return context;
};

/**
 * Agent Status Hook - Consolidated from useAgentStatus
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAgentStatus = () => {
  const { agentStatus } = useAppContext();
  
  const initializeAgent = useCallback(async () => {
    try {
      await window.vibe?.chat?.initializeAgent?.();
    } catch (error) {
      console.error("Failed to initialize agent:", error);
    }
  }, []);

  return {
    ...agentStatus,
    initializeAgent,
  };
};

/**
 * Auto Scroll Hook - Enhanced from useAutoScroll
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useAutoScroll = (dependencies: any[] = []) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);
  const [isNearBottom, setIsNearBottom] = useState(true);

  // Check if user is near bottom
  const checkScrollPosition = useCallback(() => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const nearBottom = distanceFromBottom < 100;
    
    setIsNearBottom(nearBottom);
    setShouldAutoScroll(nearBottom);
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback((smooth = true) => {
    messagesEndRef.current?.scrollIntoView({ 
      behavior: smooth ? "smooth" : "instant" 
    });
  }, []);

  // Auto-scroll on dependency changes
  useEffect(() => {
    if (shouldAutoScroll && isNearBottom) {
      scrollToBottom();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, shouldAutoScroll, isNearBottom, scrollToBottom]);

  // Setup scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("scroll", checkScrollPosition);
    return () => container.removeEventListener("scroll", checkScrollPosition);
  }, [checkScrollPosition]);

  return {
    messagesEndRef,
    containerRef,
    scrollToBottom,
    shouldAutoScroll,
    isNearBottom,
  };
};

/**
 * Chat Input Hook - Consolidated from useChatInput
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useChatInput = () => {
  const [input, setInput] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = useCallback((value: string) => {
    setInput(value);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!input.trim() || isComposing) return;

    const messageText = input.trim();
    setInput("");

    try {
      await window.vibe?.chat?.sendMessage?.(messageText);
    } catch (error) {
      console.error("Failed to send message:", error);
      // Restore input on error
      setInput(messageText);
    }
  }, [input, isComposing]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit, isComposing]);

  const focusInput = useCallback(() => {
    textareaRef.current?.focus();
  }, []);

  return {
    input,
    setInput: handleInputChange,
    handleSubmit,
    handleKeyDown,
    isComposing,
    setIsComposing,
    textareaRef,
    focusInput,
  };
};

/**
 * Tab Context Hook - Consolidated from useTabContext and useTabContextUtils
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useTabContext = () => {
  const { tabContext } = useAppContext();

  const processedContext = useMemo(() => {
    const loadingTabs = tabContext.filter(tab => tab.isLoading);
    const completedTabs = tabContext.filter(tab => !tab.isLoading && tab.title);
    const regularTabs = tabContext.filter(tab => !tab.isLoading && !tab.title);

    const sharedLoadingEntry = loadingTabs.length > 0 ? {
      loadingTabs,
      type: "shared-loading"
    } : undefined;

    const hasMoreTabs = completedTabs.length + regularTabs.length > 5;
    const visibleCompleted = completedTabs.slice(0, 3);
    const visibleRegular = regularTabs.slice(0, Math.max(0, 5 - visibleCompleted.length));
    const moreTabsCount = Math.max(0, (completedTabs.length + regularTabs.length) - 5);

    // Determine global status
    let globalStatus: "loading" | "connected" | "disconnected" = "disconnected";
    let globalStatusTitle = "No active tabs";

    if (loadingTabs.length > 0) {
      globalStatus = "loading";
      globalStatusTitle = `Loading ${loadingTabs.length} tab${loadingTabs.length > 1 ? 's' : ''}`;
    } else if (completedTabs.length > 0 || regularTabs.length > 0) {
      globalStatus = "connected";
      globalStatusTitle = `${completedTabs.length + regularTabs.length} tab${completedTabs.length + regularTabs.length > 1 ? 's' : ''} available`;
    }

    return {
      globalStatus,
      globalStatusTitle,
      shouldShowStatus: tabContext.length > 0,
      sharedLoadingEntry,
      completedTabs: visibleCompleted,
      regularTabs: visibleRegular,
      hasMoreTabs,
      moreTabsCount,
      allTabs: tabContext,
    };
  }, [tabContext]);

  return processedContext;
};

/**
 * Browser Progress Hook - Consolidated from useBrowserProgressTracking  
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useBrowserProgress = () => {
  const { browserProgress } = useAppContext();
  
  const clearProgress = useCallback(() => {
    // Implementation would depend on how progress clearing works
  }, []);

  return {
    ...browserProgress,
    clearProgress,
  };
};

/**
 * Streaming Content Hook - Consolidated from useStreamingContent
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useStreamingContent = () => {
  const { chatState } = useAppContext();
  
  return chatState.streamingContent;
};

/**
 * Chat Events Hook - Consolidated from useChatEvents  
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useChatEvents = () => {
  const [isRestoring, setIsRestoring] = useState(false);

  const restoreChat = useCallback(async () => {
    setIsRestoring(true);
    try {
      await window.vibe?.chat?.restoreHistory?.();
    } catch (error) {
      console.error("Failed to restore chat:", error);
    } finally {
      setIsRestoring(false);
    }
  }, []);

  const clearChat = useCallback(async () => {
    try {
      await window.vibe?.chat?.clearHistory?.();
    } catch (error) {
      console.error("Failed to clear chat:", error);
    }
  }, []);

  return {
    isRestoring,
    restoreChat,
    clearChat,
  };
};

/**
 * Unified Chat Hook - Combines multiple chat-related hooks
 */
// eslint-disable-next-line react-refresh/only-export-components
export const useChat = () => {
  const { chatState } = useAppContext();
  const input = useChatInput();
  const scroll = useAutoScroll([chatState.messages, chatState.streamingContent]);
  const events = useChatEvents();
  const streaming = useStreamingContent();

  return {
    ...chatState,
    input,
    scroll,
    events,
    streaming,
  };
};

// === Export All Hooks ===

// eslint-disable-next-line react-refresh/only-export-components
export const UnifiedHooks = {
  useAppContext,
  useAgentStatus,
  useAutoScroll,
  useChatInput,
  useTabContext,
  useBrowserProgress,
  useStreamingContent,
  useChatEvents,
  useChat,
};

 
export default UnifiedHooks;