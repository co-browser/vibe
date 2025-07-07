/**
 * Context Menu Hook
 * Provides access to context menu actions and common menu items
 */

import { useContext, useCallback } from "react";
import { ContextMenuContext } from "../contexts/ContextMenuContext";

export function useContextMenuActions() {
  const context = useContext(ContextMenuContext);
  if (!context) {
    throw new Error(
      "useContextMenuActions must be used within a ContextMenuProvider",
    );
  }
  return context;
}

// Export from the .tsx file
export interface ContextMenuItem {
  id: string;
  label: string;
  enabled?: boolean;
  type?: "normal" | "separator";
  data?: any;
}

export interface UseContextMenuReturn {
  showContextMenu: (
    items: ContextMenuItem[],
    event: React.MouseEvent,
  ) => Promise<void>;
  handleContextMenu: (
    items: ContextMenuItem[],
  ) => (event: React.MouseEvent) => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const showContextMenu = useCallback(
    async (items: ContextMenuItem[], event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      try {
        if (window.vibe?.actions?.showContextMenu) {
          await window.vibe.actions.showContextMenu(items);
        }
      } catch (error) {
        console.error("Failed to show context menu:", error);
      }
    },
    [],
  );

  const handleContextMenu = useCallback(
    (items: ContextMenuItem[]) => {
      return (event: React.MouseEvent) => {
        showContextMenu(items, event);
      };
    },
    [showContextMenu],
  );

  return {
    showContextMenu,
    handleContextMenu,
  };
}

// Predefined context menu items for common actions
export const TabContextMenuItems = {
  newTab: { id: "new-tab", label: "New Tab" },
  duplicateTab: { id: "duplicate-tab", label: "Duplicate Tab" },
  closeTab: { id: "close-tab", label: "Close Tab" },
  closeOtherTabs: { id: "close-other-tabs", label: "Close Other Tabs" },
  closeTabsToRight: {
    id: "close-tabs-to-right",
    label: "Close Tabs to the Right",
  },
  reopenClosedTab: { id: "reopen-closed-tab", label: "Reopen Closed Tab" },
  pinTab: { id: "pin-tab", label: "Pin Tab" },
  unpinTab: { id: "unpin-tab", label: "Unpin Tab" },
  muteTab: { id: "mute-tab", label: "Mute Tab" },
  unmuteTab: { id: "unmute-tab", label: "Unmute Tab" },
  separator: { id: "separator", label: "", type: "separator" as const },
};

export const NavigationContextMenuItems = {
  back: { id: "nav-back", label: "Back" },
  forward: { id: "nav-forward", label: "Forward" },
  reload: { id: "nav-reload", label: "Reload" },
  copyUrl: { id: "copy-url", label: "Copy URL" },
  separator: { id: "separator", label: "", type: "separator" as const },
};

export const ChatContextMenuItems = {
  clearChat: { id: "clear-chat", label: "Clear Chat" },
  exportChat: { id: "export-chat", label: "Export Chat" },
  copyMessage: { id: "copy-message", label: "Copy Message" },
  copyCode: { id: "copy-code", label: "Copy Code" },
  regenerate: { id: "regenerate", label: "Regenerate Response" },
  separator: { id: "separator", label: "", type: "separator" as const },
};
