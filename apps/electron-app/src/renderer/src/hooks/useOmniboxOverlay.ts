/**
 * React hook for omnibox overlay functionality
 */

import { useCallback, useEffect, useRef } from "react";

interface OmniboxSuggestion {
  id: string;
  type:
    | "url"
    | "search"
    | "history"
    | "bookmark"
    | "context"
    | "perplexity"
    | "agent"
    | string; // Allow string but prefer specific types
  text: string;
  url?: string;
  description?: string;
  iconType?: string;
  icon?: React.ReactNode; // Allow icon but don't require it
  metadata?: any;
}

interface OmniboxOverlayOptions {
  onSuggestionClick?: (suggestion: OmniboxSuggestion) => void;
  onEscape?: () => void;
  onDeleteHistory?: (suggestionId: string) => void;
}

export function useOmniboxOverlay(options: OmniboxOverlayOptions = {}) {
  const { onSuggestionClick, onEscape, onDeleteHistory } = options;
  const isShowingRef = useRef(false);

  useEffect(() => {
    // Listen for events from overlay
    const handleSuggestionClicked = (
      _event: any,
      suggestion: OmniboxSuggestion,
    ) => {
      onSuggestionClick?.(suggestion);
    };

    const handleEscapeDropdown = () => {
      onEscape?.();
    };

    const handleDeleteHistory = (_event: any, suggestionId: string) => {
      onDeleteHistory?.(suggestionId);
    };

    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on(
        "omnibox:suggestion-clicked",
        handleSuggestionClicked,
      );
      window.electron.ipcRenderer.on(
        "omnibox:escape-dropdown",
        handleEscapeDropdown,
      );
      window.electron.ipcRenderer.on(
        "omnibox:delete-history",
        handleDeleteHistory,
      );

      return () => {
        window.electron.ipcRenderer.removeListener(
          "omnibox:suggestion-clicked",
          handleSuggestionClicked,
        );
        window.electron.ipcRenderer.removeListener(
          "omnibox:escape-dropdown",
          handleEscapeDropdown,
        );
        window.electron.ipcRenderer.removeListener(
          "omnibox:delete-history",
          handleDeleteHistory,
        );
      };
    }
    // Add explicit return for when window.electron is not available
    return () => {};
  }, [onSuggestionClick, onEscape, onDeleteHistory]);

  const showSuggestions = useCallback(
    async (suggestions: OmniboxSuggestion[], inputBounds: DOMRect) => {
      if (!window.vibeOverlay) return;

      const html = `
      <div class="vibe-overlay-interactive omnibox-dropdown" style="
        position: fixed;
        top: ${inputBounds.bottom + 4}px;
        left: ${inputBounds.left}px;
        width: ${inputBounds.width}px;
        max-height: 400px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
        -webkit-backdrop-filter: blur(20px) saturate(180%) brightness(1.05);
        border-radius: 8px;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 
                    0 2px 8px rgba(0, 0, 0, 0.08),
                    0 0 0 1px rgba(0, 0, 0, 0.05);
        overflow: auto;
        padding: 8px 0;
      ">
        ${suggestions
          .map(
            (suggestion, index) => `
          <div class="suggestion-item" 
               data-suggestion-id="${suggestion.id}"
               data-suggestion-index="${index}"
               style="
                 display: flex;
                 align-items: center;
                 padding: 12px 16px;
                 cursor: pointer;
                 transition: all 0.15s ease;
                 border-bottom: 1px solid rgba(0, 0, 0, 0.05);
               "
               onmouseover="this.style.backgroundColor='rgba(0, 0, 0, 0.05)'"
               onmouseout="this.style.backgroundColor='transparent'"
               onclick="handleSuggestionClick('${suggestion.id}')">
            <div class="suggestion-icon" style="
              width: 20px;
              height: 20px;
              margin-right: 12px;
              color: #666;
              flex-shrink: 0;
            ">${getIconHTML(suggestion.iconType || suggestion.type)}</div>
            <div class="suggestion-content" style="flex: 1; min-width: 0;">
              <div class="suggestion-text" style="
                font-size: 14px;
                color: #333;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              ">${escapeHtml(suggestion.text)}</div>
              ${
                suggestion.description
                  ? `
                <div class="suggestion-description" style="
                  font-size: 12px;
                  color: #666;
                  margin-top: 2px;
                  white-space: nowrap;
                  overflow: hidden;
                  text-overflow: ellipsis;
                ">${escapeHtml(suggestion.description)}</div>
              `
                  : ""
              }
            </div>
            <div class="suggestion-actions" style="
              display: flex;
              align-items: center;
              gap: 8px;
            ">
              <div class="suggestion-type" style="
                font-size: 11px;
                color: #999;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                font-weight: 600;
                background-color: #f5f5f5;
                padding: 2px 6px;
                border-radius: 4px;
              ">${suggestion.type}</div>
              ${
                suggestion.type === "history"
                  ? `
                <button class="suggestion-delete" 
                        onclick="event.stopPropagation(); handleDeleteHistory('${suggestion.id}')"
                        style="
                          background: none;
                          border: none;
                          padding: 4px;
                          cursor: pointer;
                          color: #666;
                          border-radius: 4px;
                        "
                        onmouseover="this.style.color='#ff4444'"
                        onmouseout="this.style.color='#666'"
                        title="Remove from history">
                  ×
                </button>
              `
                  : ""
              }
            </div>
          </div>
        `,
          )
          .join("")}
      </div>
    `;

      const script = `
      window.omniboxSuggestions = ${JSON.stringify(suggestions)};
      window.selectedIndex = -1;
      
      // Helper function for escaping HTML
      function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
      }
      
      // These functions should already be defined in overlay.html
      if (!window.handleSuggestionClick) {
        window.handleSuggestionClick = function(id) {
          const suggestion = window.omniboxSuggestions.find(s => s.id === id);
          if (suggestion) {
            console.log('Suggestion clicked:', suggestion);
            // Try to send via IPC if available
            if (window.electron && window.electron.ipcRenderer) {
              window.electron.ipcRenderer.send('omnibox:suggestion-clicked', suggestion);
            }
          }
        };
      }
      
      if (!window.handleDeleteHistory) {
        window.handleDeleteHistory = function(id) {
          console.log('Delete history:', id);
          if (window.electron && window.electron.ipcRenderer) {
            window.electron.ipcRenderer.send('omnibox:delete-history', id);
          }
        };
      }
      
      // Setup keyboard event listener if not already setup
      if (!window.keyboardListenerSetup) {
        window.keyboardListenerSetup = true;
        
        // Simple keyboard handler without IPC dependency
        document.addEventListener('keydown', function(e) {
          const items = document.querySelectorAll('.suggestion-item');
          
          switch (e.key) {
            case 'ArrowDown':
              e.preventDefault();
              window.selectedIndex = Math.min(window.selectedIndex + 1, items.length - 1);
              break;
            case 'ArrowUp':
              e.preventDefault();
              window.selectedIndex = Math.max(window.selectedIndex - 1, -1);
              break;
            case 'Enter':
              e.preventDefault();
              if (window.selectedIndex >= 0 && window.omniboxSuggestions[window.selectedIndex]) {
                window.handleSuggestionClick(window.omniboxSuggestions[window.selectedIndex].id);
              }
              break;
            case 'Escape':
              e.preventDefault();
              if (window.electron && window.electron.ipcRenderer) {
                window.electron.ipcRenderer.send('omnibox:escape-dropdown');
              }
              break;
          }
          
          // Update visual selection
          items.forEach((item, index) => {
            if (index === window.selectedIndex) {
              item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
              item.style.boxShadow = 'inset 0 0 0 1px rgba(59, 130, 246, 0.2)';
            } else {
              item.style.backgroundColor = 'transparent';
              item.style.boxShadow = 'none';
            }
          });
        });
      }
    `;

      await window.vibeOverlay.render({
        html,
        script,
        visible: true,
      });

      isShowingRef.current = true;
    },
    [],
  );

  const hideSuggestions = useCallback(async () => {
    if (!window.vibeOverlay || !isShowingRef.current) return;

    await window.vibeOverlay.clear();
    isShowingRef.current = false;
  }, []);

  return {
    showSuggestions,
    hideSuggestions,
    isShowing: isShowingRef.current,
  };
}

// Helper functions
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getIconHTML(type: string): string {
  const icons: Record<string, string> = {
    search: "🔍",
    clock: "🕐",
    global: "🌐",
    link: "🔗",
    robot: "🤖",
    history: "🕐",
    url: "🌐",
    context: "🔗",
    perplexity: "🔍",
    agent: "🤖",
  };

  return `<span style="font-size: 16px;">${icons[type] || "📄"}</span>`;
}
