import React, { useState, useEffect, useRef } from "react";
import NavigationBar from "../layout/NavigationBar";
import ChromeTabBar from "../layout/TabBar";
import { ChatPage } from "../../pages/chat/ChatPage";
import { ChatErrorBoundary } from "../ui/error-boundary";
import { SettingsModal } from "../modals/SettingsModal";
import { DownloadsModal } from "../modals/DownloadsModal";
import { DraggableDivider } from "../ui/DraggableDivider";

import {
  CHAT_PANEL,
  CHAT_PANEL_RECOVERY,
  IPC_EVENTS,
  type LayoutContextType,
  createLogger,
} from "@vibe/shared-types";

const logger = createLogger("MainApp");

// Window interface is defined in env.d.ts

// Type guard for chat panel state
function isChatPanelState(value: unknown): value is { isVisible: boolean } {
  return (
    value !== null &&
    typeof value === "object" &&
    "isVisible" in value &&
    typeof (value as any).isVisible === "boolean"
  );
}

// Custom hook for chat panel health monitoring
function useChatPanelHealthCheck(
  isChatPanelVisible: boolean,
  setChatPanelKey: React.Dispatch<React.SetStateAction<number>>,
  setChatPanelVisible: React.Dispatch<React.SetStateAction<boolean>>,
): void {
  useEffect(() => {
    if (!isChatPanelVisible) return;

    const healthCheckInterval = setInterval(async () => {
      try {
        const chatPanel = document.querySelector(".chat-panel-sidebar");
        const chatContent = document.querySelector(".chat-panel-content");
        const chatBody = document.querySelector(".chat-panel-body");

        if (chatPanel && chatContent && chatBody) {
          const hasVisibleElements = Array.from(
            chatBody.querySelectorAll("*"),
          ).some(el => {
            const computed = window.getComputedStyle(el);
            return (
              computed.display !== "none" && computed.visibility !== "hidden"
            );
          });

          if (!hasVisibleElements) {
            try {
              const authoritativeState =
                await window.vibe?.interface?.getChatPanelState?.();
              if (
                isChatPanelState(authoritativeState) &&
                authoritativeState.isVisible
              ) {
                setChatPanelKey(prev => prev + 1);
              }
            } catch {
              // Silent fallback
            }
          }
        } else if (isChatPanelVisible) {
          try {
            const authoritativeState =
              await window.vibe?.interface?.getChatPanelState?.();
            if (
              isChatPanelState(authoritativeState) &&
              authoritativeState.isVisible
            ) {
              setChatPanelKey(prev => prev + 1);
            } else {
              setChatPanelVisible(false);
            }
          } catch {
            // Silent fallback
          }
        }
      } catch {
        // Silent fallback
      }
    }, CHAT_PANEL_RECOVERY.HEALTH_CHECK_INTERVAL_MS);

    return () => {
      clearInterval(healthCheckInterval);
    };
  }, [isChatPanelVisible, setChatPanelKey, setChatPanelVisible]);
}

const LayoutContext = React.createContext<LayoutContextType | null>(null);

function useLayout(): LayoutContextType {
  const context = React.useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within a LayoutProvider");
  }
  return context;
}

function LayoutProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [isChatPanelVisible, setChatPanelVisible] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState<number>(
    CHAT_PANEL.DEFAULT_WIDTH,
  );
  const [chatPanelKey, setChatPanelKey] = useState(0);
  const [isRecovering, setIsRecovering] = useState(false);

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
  const pendingState = useRef<boolean | null>(null);
  const currentVisibilityRef = useRef(isChatPanelVisible);

  useEffect(() => {
    currentVisibilityRef.current = isChatPanelVisible;
  }, [isChatPanelVisible]);

  useEffect(() => {
    const handleStateSyncEvent = (
      _event: any,
      receivedState: { isVisible: boolean },
    ) => {
      const currentVisibility = currentVisibilityRef.current;

      if (receivedState.isVisible !== currentVisibility) {
        pendingState.current = receivedState.isVisible;

        if (!debounceTimeout.current) {
          debounceTimeout.current = setTimeout(() => {
            const finalState = pendingState.current;
            setChatPanelVisible(finalState!);
            setChatPanelKey(prev => prev + 1);

            setIsRecovering(true);
            setTimeout(
              () => setIsRecovering(false),
              CHAT_PANEL_RECOVERY.RECOVERY_OVERLAY_MS,
            );

            debounceTimeout.current = null;
            pendingState.current = null;
          }, CHAT_PANEL_RECOVERY.DEBOUNCE_MS);
        }
      }
    };

    if (typeof window !== "undefined" && window.electron?.ipcRenderer) {
      const ipcRenderer = window.electron.ipcRenderer;
      ipcRenderer.on(IPC_EVENTS.CHAT_PANEL.SYNC_STATE, handleStateSyncEvent);

      return () => {
        ipcRenderer.removeListener(
          IPC_EVENTS.CHAT_PANEL.SYNC_STATE,
          handleStateSyncEvent,
        );
        if (debounceTimeout.current) {
          clearTimeout(debounceTimeout.current);
          debounceTimeout.current = null;
        }
      };
    }

    return undefined;
  }, []);

  // Use custom hook for health check monitoring
  useChatPanelHealthCheck(
    isChatPanelVisible,
    setChatPanelKey,
    setChatPanelVisible,
  );

  useEffect(() => {
    const requestInitialState = async () => {
      try {
        const authoritativeState =
          await window.vibe?.interface?.getChatPanelState?.();
        if (isChatPanelState(authoritativeState)) {
          const isVisible = authoritativeState.isVisible;
          if (isVisible !== isChatPanelVisible) {
            setChatPanelVisible(isVisible);
          }
        }
      } catch {
        // Silent fallback
      }
    };

    requestInitialState();
  }, [isChatPanelVisible]);

  useEffect(() => {
    const cleanup = window.vibe?.interface?.onChatPanelVisibilityChanged?.(
      isVisible => {
        setChatPanelVisible(isVisible);
      },
    );

    return cleanup;
  }, []);

  const contextValue: LayoutContextType = {
    isChatPanelVisible,
    chatPanelWidth,
    setChatPanelVisible,
    setChatPanelWidth,
    chatPanelKey,
    isRecovering,
  };

  return (
    <LayoutContext.Provider value={contextValue}>
      <div
        className="browser-layout-root"
        style={
          {
            "--chat-panel-width": `${chatPanelWidth}px`,
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </LayoutContext.Provider>
  );
}

function ChatPanelSidebar(): React.JSX.Element | null {
  const {
    isChatPanelVisible,
    chatPanelWidth,
    chatPanelKey,
    isRecovering,
    setChatPanelWidth,
    setChatPanelVisible,
  } = useLayout();

  if (!isChatPanelVisible) {
    return null;
  }

  const handleResize = (newWidth: number) => {
    setChatPanelWidth(newWidth);
    // Persist the width preference
    window.vibe?.interface?.setChatPanelWidth?.(newWidth);
  };

  const handleMinimize = () => {
    setChatPanelVisible(false);
    window.vibe?.interface?.toggleChatPanel?.(false);
  };

  return (
    <div
      className="chat-panel-sidebar"
      style={{
        width: `${chatPanelWidth}px`,
        minWidth: `${CHAT_PANEL.MIN_WIDTH}px`,
        maxWidth: `${CHAT_PANEL.MAX_WIDTH}px`,
        position: "relative",
      }}
    >
      <DraggableDivider
        onResize={handleResize}
        minWidth={CHAT_PANEL.MIN_WIDTH}
        maxWidth={CHAT_PANEL.MAX_WIDTH}
        currentWidth={chatPanelWidth}
        onMinimize={handleMinimize}
      />
      <div className="chat-panel-content">
        {isRecovering && (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(255, 255, 255, 0.9)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1000,
              backdropFilter: "blur(2px)",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  border: "3px solid #f3f3f3",
                  borderTop: "3px solid #3498db",
                  borderRadius: "50%",
                  animation: "spin 1s linear infinite",
                  margin: "0 auto 12px auto",
                }}
              />
              <div style={{ fontSize: "14px", color: "#666" }}>
                🔄 Refreshing chat...
              </div>
            </div>
          </div>
        )}

        <div className="chat-panel-body">
          <ChatErrorBoundary key={chatPanelKey}>
            <ChatPage key={chatPanelKey} />
          </ChatErrorBoundary>
        </div>
      </div>
    </div>
  );
}

function BrowserContentArea(): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(false);
  const [currentUrl, setCurrentUrl] = useState("");

  useEffect(() => {
    const unsubscribe = window.vibe?.tabs?.onTabStateUpdate?.(state => {
      setIsLoading(state.isLoading || false);
      setCurrentUrl(state.url || "");
    });

    return () => {
      unsubscribe?.();
    };
  }, []);

  return (
    <div className="browser-view-content">
      {isLoading ? (
        <div className="loading-state">
          <div className="loading-spinner animate-spin-custom"></div>
          <span>Loading...</span>
        </div>
      ) : currentUrl ? (
        <div className="ready-state" style={{ display: "none" }}></div>
      ) : (
        <div className="ready-state">
          <div className="welcome-message">
            <h2>Welcome to Vibe Browser</h2>
            <p>Enter a URL in the address bar to get started</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ChromeAreas(): React.JSX.Element {
  return (
    <>
      <div className="tab-bar-container">
        <ChromeTabBar />
      </div>
      <div className="navigation-bar-container">
        <NavigationBar />
      </div>
    </>
  );
}

function MainContentWrapper(): React.JSX.Element {
  return (
    <div className="main-content-wrapper">
      <BrowserContentArea />
      <ChatPanelSidebar />
    </div>
  );
}

function BrowserLayout(): React.JSX.Element {
  return (
    <div className="browser-window">
      <ChromeAreas />
      <MainContentWrapper />
    </div>
  );
}

export function MainApp(): React.JSX.Element {
  const [isReady, setIsReady] = useState(false);
  const [vibeAPIReady, setVibeAPIReady] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isDownloadsModalOpen, setIsDownloadsModalOpen] = useState(false);

  // Debug logging for modal states
  useEffect(() => {
    logger.debug("Settings modal state changed:", isSettingsModalOpen);
  }, [isSettingsModalOpen]);

  useEffect(() => {
    logger.debug("Downloads modal state changed:", isDownloadsModalOpen);
  }, [isDownloadsModalOpen]);

  useEffect(() => {
    const checkVibeAPI = () => {
      if (
        typeof window !== "undefined" &&
        window.vibe &&
        window.vibe.tabs &&
        window.vibe.app
      ) {
        setVibeAPIReady(true);
      } else {
        setTimeout(checkVibeAPI, 50);
      }
    };

    checkVibeAPI();
  }, []);

  // Handle modal IPC events
  useEffect(() => {
    const handleShowSettingsModal = () => {
      logger.info("Received app:show-settings-modal event");
      setIsSettingsModalOpen(true);
    };

    const handleShowDownloadsModal = () => {
      logger.info("Received app:show-downloads-modal event");
      setIsDownloadsModalOpen(true);
    };

    if (typeof window !== "undefined" && window.electron?.ipcRenderer) {
      const ipcRenderer = window.electron.ipcRenderer;
      ipcRenderer.on("app:show-settings-modal", handleShowSettingsModal);
      ipcRenderer.on("app:show-downloads-modal", handleShowDownloadsModal);

      return () => {
        ipcRenderer.removeListener(
          "app:show-settings-modal",
          handleShowSettingsModal,
        );
        ipcRenderer.removeListener(
          "app:show-downloads-modal",
          handleShowDownloadsModal,
        );
      };
    }

    return undefined;
  }, []);

  useEffect(() => {
    if (vibeAPIReady) {
      setTimeout(() => {
        setIsReady(true);
      }, 100);
    }
  }, [vibeAPIReady]);

  return (
    <LayoutProvider>
      <div className={`glass-background-root ${isReady ? "ready" : ""}`}>
        <div className="glass-content-wrapper">
          <div className="browser-ui-root">
            {vibeAPIReady ? (
              <BrowserLayout />
            ) : (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  height: "100vh",
                  flexDirection: "column",
                  background: "var(--app-background)",
                  color: "var(--text-primary)",
                }}
              >
                <div style={{ fontSize: "18px", marginBottom: "10px" }}>
                  ⏳ Initializing Vibe Browser...
                </div>
                <div
                  style={{ fontSize: "14px", color: "var(--text-secondary)" }}
                >
                  Loading interface components
                </div>
              </div>
            )}
          </div>
        </div>

        <SettingsModal
          isOpen={isSettingsModalOpen}
          onClose={() => {
            logger.debug("Closing settings modal");
            setIsSettingsModalOpen(false);
          }}
        />
        <DownloadsModal
          isOpen={isDownloadsModalOpen}
          onClose={() => {
            logger.debug("Closing downloads modal");
            setIsDownloadsModalOpen(false);
          }}
        />
      </div>
    </LayoutProvider>
  );
}
