import React, { useEffect, useRef } from "react";

interface ContextMenuDetectorProps {
  children: React.ReactNode;
}

interface ElementInfo {
  isInput?: boolean;
  isLink?: boolean;
  linkUrl?: string;
  selectedText?: string;
  canGoBack?: boolean;
  canGoForward?: boolean;
  isLoading?: boolean;
}

export const ContextMenuDetector: React.FC<ContextMenuDetectorProps> = ({
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleContextMenu = async (event: MouseEvent) => {
      event.preventDefault();

      const target = event.target as HTMLElement;
      const rect = containerRef.current?.getBoundingClientRect();

      if (!rect) return;

      // Determine the context menu type based on the clicked element
      const menuType = determineMenuType(target);
      const elementInfo = getElementInfo(target);

      // Get current tab information
      const currentTab = await window.vibe?.tabs?.getActiveTab?.();
      const tabId = currentTab?.key;

      // Get window ID
      const windowId =
        await window.electronAPI?.ipcRenderer?.invoke("window:get-id");

      const contextMenuOptions = {
        type: menuType,
        x: Math.round(event.clientX),
        y: Math.round(event.clientY),
        windowId: windowId || 1,
        tabId,
        elementInfo: {
          ...elementInfo,
          canGoBack: currentTab?.canGoBack || false,
          canGoForward: currentTab?.canGoForward || false,
          isLoading: currentTab?.isLoading || false,
        },
      };

      try {
        await window.electronAPI?.invoke(
          "actions:show-context-menu",
          contextMenuOptions,
        );
      } catch (error) {
        console.error("Failed to show context menu:", error);
      }
    };

    const container = containerRef.current;
    if (container) {
      container.addEventListener("contextmenu", handleContextMenu);
    }

    return () => {
      if (container) {
        container.removeEventListener("contextmenu", handleContextMenu);
      }
    };
  }, []);

  const determineMenuType = (
    target: HTMLElement,
  ): "browser" | "tab" | "chat" => {
    // Check if we're in a chat area
    if (
      target.closest('[data-context="chat"]') ||
      target.closest(".chat-panel") ||
      target.closest(".chat-view") ||
      target.closest('[class*="chat"]')
    ) {
      return "chat";
    }

    // Check if we're in a tab bar area
    if (
      target.closest('[data-context="tab"]') ||
      target.closest(".tab-bar") ||
      target.closest(".tab-item") ||
      target.closest('[class*="tab"]')
    ) {
      return "tab";
    }

    // Default to browser context menu
    return "browser";
  };

  const getElementInfo = (target: HTMLElement): ElementInfo => {
    const info: ElementInfo = {};

    // Check if it's an input field
    if (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.contentEditable === "true" ||
      target.closest('input, textarea, [contenteditable="true"]')
    ) {
      info.isInput = true;
    }

    // Check if it's a link
    const linkElement = target.closest("a");
    if (linkElement && linkElement.href) {
      info.isLink = true;
      info.linkUrl = linkElement.href;
    }

    // Get selected text
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      info.selectedText = selection.toString().trim();
    }

    return info;
  };

  return (
    <div ref={containerRef} className="context-menu-detector w-full h-full">
      {children}
    </div>
  );
};

export default ContextMenuDetector;
