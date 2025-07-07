/**
 * Context Menu Provider
 * Handles context menu actions and IPC communication
 */

import React, { useEffect, useCallback } from "react";
import {
  ContextMenuContext,
  type ContextMenuContextValue,
} from "../contexts/ContextMenuContext";

interface ContextMenuProviderProps {
  children: React.ReactNode;
}

export function ContextMenuProvider({ children }: ContextMenuProviderProps) {
  // Handle tab-related actions
  const handleTabAction = useCallback((actionId: string, data?: any) => {
    console.log("Tab action:", actionId, data);

    switch (actionId) {
      case "new-tab":
        window.electron?.tabs?.create?.("https://www.google.com");
        break;
      case "duplicate-tab":
        if (data?.tabKey) {
          // Get current tab URL and create new tab with same URL
          // This would need to be implemented based on your tab state management
        }
        break;
      case "close-tab":
        if (data?.tabKey) {
          window.electron?.tabs?.close?.(data.tabKey);
        }
        break;
      case "close-other-tabs":
        // Implement close other tabs logic
        break;
      case "close-tabs-to-right":
        // Implement close tabs to right logic
        break;
      case "reopen-closed-tab":
        // Implement reopen closed tab logic
        break;
      case "pin-tab":
        // Implement pin tab logic
        break;
      case "unpin-tab":
        // Implement unpin tab logic
        break;
      case "mute-tab":
        // Implement mute tab logic
        break;
      case "unmute-tab":
        // Implement unmute tab logic
        break;
      default:
        console.warn("Unknown tab action:", actionId);
    }
  }, []);

  // Handle navigation-related actions
  const handleNavigationAction = useCallback((actionId: string, data?: any) => {
    console.log("Navigation action:", actionId, data);

    switch (actionId) {
      case "nav-back":
        window.electron?.page?.goBack?.();
        break;
      case "nav-forward":
        window.electron?.page?.goForward?.();
        break;
      case "nav-reload":
        window.electron?.page?.reload?.();
        break;
      case "copy-url":
        if (data?.url) {
          window.electron?.app?.writeToClipboard?.(data.url);
        }
        break;
      default:
        console.warn("Unknown navigation action:", actionId);
    }
  }, []);

  // Handle chat-related actions
  const handleChatAction = useCallback((actionId: string, data?: any) => {
    console.log("Chat action:", actionId, data);

    switch (actionId) {
      case "clear-chat":
        // Implement clear chat logic
        break;
      case "export-chat":
        // Implement export chat logic
        break;
      case "copy-message":
        if (data?.message) {
          window.electron?.app?.writeToClipboard?.(data.message);
        }
        break;
      case "copy-code":
        if (data?.code) {
          window.electron?.app?.writeToClipboard?.(data.code);
        }
        break;
      case "regenerate":
        // Implement regenerate response logic
        break;
      default:
        console.warn("Unknown chat action:", actionId);
    }
  }, []);

  // Set up IPC listener for context menu actions
  useEffect(() => {
    const handleContextMenuAction = (event: any) => {
      const { id, context, data } = event.detail || event;

      console.log("Context menu action received:", { id, context, data });

      // Route to appropriate handler based on context
      switch (context) {
        case "tab":
          handleTabAction(id, data);
          break;
        case "navigation":
          handleNavigationAction(id, data);
          break;
        case "chat":
          handleChatAction(id, data);
          break;
        default:
          // Try to determine action type from ID
          if (id.startsWith("nav-")) {
            handleNavigationAction(id, data);
          } else if (id.includes("tab")) {
            handleTabAction(id, data);
          } else if (id.includes("chat")) {
            handleChatAction(id, data);
          } else {
            console.warn("Unknown context menu action:", { id, context, data });
          }
      }
    };

    // Listen for context menu events from main process
    let removeListener: (() => void) | undefined;

    if (window.electron?.ipcRenderer?.on) {
      window.electron.ipcRenderer.on(
        "context-menu-item-clicked",
        handleContextMenuAction,
      );
      removeListener = () => {
        window.electron?.ipcRenderer?.removeListener?.(
          "context-menu-item-clicked",
          handleContextMenuAction,
        );
      };
    }

    return () => {
      removeListener?.();
    };
  }, [handleTabAction, handleNavigationAction, handleChatAction]);

  const value: ContextMenuContextValue = {
    handleTabAction,
    handleNavigationAction,
    handleChatAction,
  };

  return (
    <ContextMenuContext.Provider value={value}>
      {children}
    </ContextMenuContext.Provider>
  );
}
