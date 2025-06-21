import React, { useState, useEffect } from "react";
import { CHAT_PANEL } from "@vibe/shared-types";

/**
 * Layout Provider - Clean state management
 */
interface LayoutContextType {
  isChatPanelVisible: boolean;
  chatPanelWidth: number;
  setChatPanelVisible: (visible: boolean) => void;
  setChatPanelWidth: (width: number) => void;
}

const LayoutContext = React.createContext<LayoutContextType | null>(null);

export function LayoutProvider({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const [isChatPanelVisible, setChatPanelVisible] = useState(false);
  const [chatPanelWidth, setChatPanelWidth] = useState<number>(
    CHAT_PANEL.DEFAULT_WIDTH,
  );

  // Chat panel visibility monitoring using vibe APIs
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

// Export the context for use in the hook
export { LayoutContext };
