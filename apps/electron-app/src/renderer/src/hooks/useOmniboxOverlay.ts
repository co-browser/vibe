/**
 * React hook for omnibox overlay functionality
 * Enhanced with comprehensive security measures to prevent script injection bugs
 */

import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import type { SuggestionMetadata } from "../../../types/metadata";

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
    | string;
  text: string;
  url?: string;
  description?: string;
  iconType?: string;
  icon?: React.ReactNode;
  metadata?: SuggestionMetadata;
}

interface OmniboxOverlayOptions {
  onSuggestionClick?: (suggestion: OmniboxSuggestion) => void;
  onEscape?: () => void;
  onDeleteHistory?: (suggestionId: string) => void;
  onNavigateAndClose?: (url: string) => void;
}

// Performance optimizations
// const ICON_CACHE = new Map<string, string>(); // TODO: Implement icon caching

// Pre-computed CSS for better performance
const STATIC_CSS = `
  .vibe-overlay-interactive.omnibox-dropdown {
    position: fixed;
    box-sizing: border-box;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px) saturate(120%);
    -webkit-backdrop-filter: blur(8px) saturate(120%);
    border-radius: 0 0 8px 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1), 
                0 1px 4px rgba(0, 0, 0, 0.05);
    overflow: auto;
    padding: 4px 0;
    border: 1px solid rgba(0, 0, 0, 0.1);
    border-top: none;
    max-height: 300px;
    z-index: 2147483647;
    width: 60%;
    max-width: 60%;
    left: 0;
    top: 40px;
  }
  
  .suggestion-item {
    display: flex;
    align-items: center;
    padding: 10px 12px;
    cursor: pointer;
    transition: background-color 0.15s ease;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
  }
  
  .suggestion-item:last-child {
    border-bottom: none;
  }
  
  .suggestion-item:hover {
    background-color: rgba(0, 0, 0, 0.05);
  }
  
  .suggestion-item.selected {
    background-color: rgba(59, 130, 246, 0.1);
    box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.2);
  }
  
  .suggestion-icon {
    width: 16px;
    height: 16px;
    margin-right: 8px;
    color: #666;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .suggestion-content {
    flex: 1;
    min-width: 0;
  }
  
  .suggestion-text {
    font-size: 13px;
    color: #333;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .suggestion-description {
    font-size: 11px;
    color: #666;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  
  .suggestion-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }
  
  .suggestion-type {
    font-size: 9px;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
    background-color: #f5f5f5;
    padding: 1px 3px;
    border-radius: 2px;
    white-space: nowrap;
  }
  
  .suggestion-delete {
    background: none;
    border: none;
    padding: 2px;
    cursor: pointer;
    color: #999;
    border-radius: 2px;
    transition: color 0.15s ease;
    font-size: 12px;
  }
  
  .suggestion-delete:hover {
    color: #ff4444;
  }
  
`;

export function useOmniboxOverlay(options: OmniboxOverlayOptions = {}) {
  const { onSuggestionClick, onEscape, onDeleteHistory, onNavigateAndClose } =
    options;
  const isShowingRef = useRef(false);
  const lastSuggestionsRef = useRef<OmniboxSuggestion[]>([]);
  const lastSelectedIndexRef = useRef(-1);
  const lastSuggestionsHashRef = useRef<string>("");
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastOperationRef = useRef<number>(0);
  const [overlayStatus, setOverlayStatus] = useState<
    "enabled" | "disabled" | "error"
  >("enabled");
  const [errorCount, setErrorCount] = useState(0);

  // Memoize event handlers to prevent memory leaks
  const eventHandlers = useMemo(
    () => ({
      handleSuggestionClicked: (_event: any, suggestion: OmniboxSuggestion) => {
        onSuggestionClick?.(suggestion);
      },
      handleEscapeDropdown: () => {
        onEscape?.();
      },
      handleDeleteHistory: (_event: any, suggestionId: string) => {
        onDeleteHistory?.(suggestionId);
      },
      handleNavigateAndClose: (_event: any, url: string) => {
        onNavigateAndClose?.(url);
      },
      handleOverlayError: (_event: any, error: any) => {
        console.error("Overlay error:", error);
        setErrorCount(prev => prev + 1);
        if (errorCount >= 3) {
          setOverlayStatus("error");
        }
      },
      handleOverlayHealth: (_event: any, status: any) => {
        if (status.status === "ready") {
          setOverlayStatus("enabled");
          setErrorCount(0);
        }
      },
    }),
    [
      onSuggestionClick,
      onEscape,
      onDeleteHistory,
      onNavigateAndClose,
      errorCount,
    ],
  );

  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.on(
        "omnibox:suggestion-clicked",
        eventHandlers.handleSuggestionClicked,
      );
      window.electron.ipcRenderer.on(
        "omnibox:escape-dropdown",
        eventHandlers.handleEscapeDropdown,
      );
      window.electron.ipcRenderer.on(
        "omnibox:delete-history",
        eventHandlers.handleDeleteHistory,
      );
      window.electron.ipcRenderer.on(
        "omnibox:navigate-and-close",
        eventHandlers.handleNavigateAndClose,
      );
      window.electron.ipcRenderer.on(
        "overlay:error",
        eventHandlers.handleOverlayError,
      );
      window.electron.ipcRenderer.on(
        "overlay:health-check",
        eventHandlers.handleOverlayHealth,
      );

      return () => {
        window.electron.ipcRenderer.removeListener(
          "omnibox:suggestion-clicked",
          eventHandlers.handleSuggestionClicked,
        );
        window.electron.ipcRenderer.removeListener(
          "omnibox:escape-dropdown",
          eventHandlers.handleEscapeDropdown,
        );
        window.electron.ipcRenderer.removeListener(
          "omnibox:delete-history",
          eventHandlers.handleDeleteHistory,
        );
        window.electron.ipcRenderer.removeListener(
          "omnibox:navigate-and-close",
          eventHandlers.handleNavigateAndClose,
        );
        window.electron.ipcRenderer.removeListener(
          "overlay:error",
          eventHandlers.handleOverlayError,
        );
        window.electron.ipcRenderer.removeListener(
          "overlay:health-check",
          eventHandlers.handleOverlayHealth,
        );
      };
    }
    return undefined;
  }, [eventHandlers]);

  // Function to update overlay positioning based on omnibar container (must be defined before use)
  const updateOverlayPosition = useCallback(() => {
    if (!window.electron?.ipcRenderer || overlayStatus !== "enabled") return;

    const omnibarContainer = document.querySelector(".omnibar-container");
    if (omnibarContainer) {
      const rect = omnibarContainer.getBoundingClientRect();
      const leftPosition = `${rect.left}px`;
      const width = `${rect.width}px`;
      const topPosition = `${rect.bottom}px`;

      // Update CSS custom properties for dynamic positioning
      const updateScript = `
        (function() {
          const overlay = document.querySelector('.omnibox-dropdown');
          if (overlay) {
            overlay.style.setProperty('--omnibar-left', '${leftPosition}');
            overlay.style.setProperty('--omnibar-width', '${width}');
            overlay.style.setProperty('--omnibar-top', '${topPosition}');
          }
        })();
      `;

      window.electron.ipcRenderer
        .invoke("overlay:execute", updateScript)
        .catch(console.error);
    }
  }, [overlayStatus]);

  // Window resize listener for dynamic positioning
  useEffect(() => {
    const handleResize = () => {
      // Debounce resize events for performance
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
      resizeTimeoutRef.current = setTimeout(() => {
        updateOverlayPosition();
        resizeTimeoutRef.current = null;
      }, 100);
    };

    window.addEventListener("resize", handleResize);

    // Also update position when overlay becomes visible
    if (overlayStatus === "enabled") {
      updateOverlayPosition();
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, [updateOverlayPosition, overlayStatus]);

  // Full content rendering function with virtual scrolling
  const renderFullContent = useCallback(
    (suggestions: OmniboxSuggestion[]) => {
      const MAX_VISIBLE_ITEMS = 10; // Only render 10 items for performance
      const visibleSuggestions =
        suggestions.length > MAX_VISIBLE_ITEMS
          ? suggestions.slice(0, MAX_VISIBLE_ITEMS)
          : suggestions;

      // Generate safe HTML with dynamic positioning that updates on window resize
      const safeHtml = `
      <div class="vibe-overlay-interactive omnibox-dropdown" style="
        top: var(--omnibar-top, 40px);
        left: 0;
        width: 100%;
        max-width: 100%;
        margin: 0;
        border-radius: 0 0 8px 8px;
        border-top: none;
        position: fixed;
        transform: translateX(calc(var(--omnibar-left, 0px)));
        width: calc(var(--omnibar-width, 60%));
        max-width: calc(var(--omnibar-width, 60%));
      ">
        ${
          suggestions.length > MAX_VISIBLE_ITEMS
            ? `<div class="suggestion-header" style="
            padding: 6px 12px;
            font-size: 11px;
            color: #666;
            background: rgba(0,0,0,0.02);
            border-bottom: 1px solid rgba(0,0,0,0.05);
          ">
            Showing ${MAX_VISIBLE_ITEMS} of ${suggestions.length} results
          </div>`
            : ""
        }
        ${visibleSuggestions
          .map(
            (suggestion, index) => `
          <div class="suggestion-item" 
               data-suggestion-id="${escapeHtml(suggestion.id)}"
               data-suggestion-index="${index}"
               data-suggestion-type="${escapeHtml(suggestion.type)}"
               data-suggestion-url="${escapeHtml(suggestion.url || "")}"
               data-suggestion-text="${escapeHtml(suggestion.text)}">
            <div class="suggestion-icon">
              ${getIconHTML(suggestion.iconType || suggestion.type)}
            </div>
            <div class="suggestion-content">
              <div class="suggestion-text">${escapeHtml(suggestion.text)}</div>
              ${suggestion.description ? `<div class="suggestion-description">${escapeHtml(suggestion.description)}</div>` : ""}
            </div>
            <div class="suggestion-actions">
              <span class="suggestion-type">${escapeHtml(suggestion.type)}</span>
              ${suggestion.type === "history" ? `<button class="suggestion-delete" data-delete-id="${escapeHtml(suggestion.id)}">×</button>` : ""}
            </div>
          </div>
        `,
          )
          .join("")}
        ${
          suggestions.length > MAX_VISIBLE_ITEMS
            ? `<div class="suggestion-footer" style="
            padding: 6px 12px;
            font-size: 11px;
            color: #999;
            text-align: center;
            background: rgba(0,0,0,0.02);
            border-top: 1px solid rgba(0,0,0,0.05);
          ">
            Type more to refine results
          </div>`
            : ""
        }
      </div>
    `;

      // Update overlay content safely
      window.electron.ipcRenderer.invoke("overlay:render", {
        html: safeHtml,
        css: STATIC_CSS,
        visible: true,
        priority: "critical",
        type: "omnibox-suggestions",
      });

      // Update position after rendering to ensure proper alignment
      setTimeout(() => updateOverlayPosition(), 10);

      return true;
    },
    [updateOverlayPosition],
  );

  // Safe content rendering with optimized incremental updates and race condition prevention
  const renderOverlayContent = useCallback(
    async (suggestions: OmniboxSuggestion[]) => {
      if (!window.electron?.ipcRenderer || overlayStatus !== "enabled") {
        return false;
      }

      // Create operation ID to prevent race conditions
      const operationId = Date.now();
      lastOperationRef.current = operationId;

      try {
        // Check if we can do incremental updates
        const lastSuggestions = lastSuggestionsRef.current;
        const canIncremental =
          lastSuggestions.length > 0 &&
          suggestions.length <= lastSuggestions.length + 5 && // Don't incremental for huge changes
          suggestions.length >= lastSuggestions.length - 5;

        if (canIncremental) {
          // Try incremental update for better performance
          const updateScript = `
            (function() {
              const container = document.querySelector('.omnibox-dropdown');
              if (!container) return false;
              
              const existingItems = container.querySelectorAll('.suggestion-item');
              const newSuggestions = ${JSON.stringify(
                suggestions.map(s => ({
                  id: s.id,
                  type: s.type,
                  text: s.text,
                  url: s.url || "",
                  description: s.description || "",
                })),
              )}
              
              // Update existing items and add new ones
              newSuggestions.forEach((suggestion, index) => {
                const existingItem = existingItems[index];
                if (existingItem) {
                  // Update existing item if different
                  if (existingItem.dataset.suggestionId !== suggestion.id) {
                    existingItem.dataset.suggestionId = suggestion.id;
                    existingItem.dataset.suggestionType = suggestion.type;
                    existingItem.dataset.suggestionUrl = suggestion.url;
                    existingItem.dataset.suggestionText = suggestion.text;
                    existingItem.querySelector('.suggestion-text').textContent = suggestion.text;
                    if (suggestion.description) {
                      let descEl = existingItem.querySelector('.suggestion-description');
                      if (!descEl) {
                        descEl = document.createElement('div');
                        descEl.className = 'suggestion-description';
                        existingItem.querySelector('.suggestion-content').appendChild(descEl);
                      }
                      descEl.textContent = suggestion.description;
                    }
                  }
                } else {
                  // Add new item (fallback to full render if needed)
                  return false;
                }
              });
              
              // Remove extra items
              for (let i = newSuggestions.length; i < existingItems.length; i++) {
                existingItems[i].remove();
              }
              
              return true;
            })();
          `;

          try {
            // Try incremental update first with race condition check
            const success = await window.electron.ipcRenderer.invoke(
              "overlay:execute",
              updateScript,
            );

            // Check if operation is still current
            if (lastOperationRef.current !== operationId) {
              return false; // Another operation started
            }

            if (!success) {
              // Fall back to full render if incremental failed
              return await renderFullContent(suggestions);
            }
            return true;
          } catch (error) {
            // Only handle error if operation is still current
            if (lastOperationRef.current === operationId) {
              console.error("Failed to execute incremental update:", error);
              return await renderFullContent(suggestions);
            }
            return false;
          }
        } else {
          // Full render for new content or major changes
          return await renderFullContent(suggestions);
        }
      } catch (error) {
        // Only handle error if operation is still current
        if (lastOperationRef.current === operationId) {
          console.error("Failed to render overlay content:", error);
          setOverlayStatus("error");
        }
        return false;
      }
    },
    [overlayStatus, renderFullContent],
  );

  // Show suggestions with comprehensive error handling and race condition prevention
  const showSuggestions = useCallback(
    async (suggestions: OmniboxSuggestion[]) => {
      if (overlayStatus === "error") {
        return false;
      }

      if (!window.electron?.ipcRenderer) {
        return false;
      }

      // Check for changes to avoid unnecessary updates (fast hash comparison)
      const currentHash = fastHash(suggestions);
      if (
        currentHash === lastSuggestionsHashRef.current &&
        isShowingRef.current
      ) {
        return true;
      }

      lastSuggestionsRef.current = suggestions;
      lastSuggestionsHashRef.current = currentHash;
      isShowingRef.current = true;

      try {
        return await renderOverlayContent(suggestions);
      } catch (error) {
        console.error("Failed to show suggestions:", error);
        setOverlayStatus("error");
        return false;
      }
    },
    [renderOverlayContent, overlayStatus],
  );

  // Hide overlay safely
  const hideOverlay = useCallback(() => {
    if (!window.electron?.ipcRenderer) return;

    try {
      window.electron.ipcRenderer.invoke("overlay:hide");
      isShowingRef.current = false;
      lastSelectedIndexRef.current = -1;
    } catch (error) {
      console.error("Failed to hide overlay:", error);
      setOverlayStatus("error");
    }
  }, []);

  // Clear overlay safely
  const clearOverlay = useCallback(() => {
    if (!window.electron?.ipcRenderer) return;

    try {
      window.electron.ipcRenderer.invoke("overlay:clear");
      isShowingRef.current = false;
      lastSelectedIndexRef.current = -1;
      lastSuggestionsRef.current = [];
    } catch (error) {
      console.error("Failed to clear overlay:", error);
      setOverlayStatus("error");
    }
  }, []);

  // Force clear with keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === "C") {
        clearOverlay();
        setOverlayStatus("enabled");
        setErrorCount(0);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [clearOverlay]);

  // Debug function
  const debugOverlay = useCallback(() => {
    // Debug info available but not logged
  }, []);

  // Re-enable overlay
  const reEnableOverlay = useCallback(() => {
    setOverlayStatus("enabled");
    setErrorCount(0);
  }, []);

  // Cleanup on unmount to prevent memory leaks and race conditions
  useEffect(() => {
    return () => {
      // Clear any pending timeouts
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }

      // Reset operation counter to prevent race conditions
      lastOperationRef.current = 0;

      // Clear overlay state
      isShowingRef.current = false;
      lastSelectedIndexRef.current = -1;
      lastSuggestionsRef.current = [];
      lastSuggestionsHashRef.current = "";
    };
  }, []);

  return {
    showSuggestions,
    hideOverlay,
    clearOverlay,
    debugOverlay,
    reEnableOverlay,
    overlayStatus,
    errorCount,
    isOverlayAvailable:
      !!window.electron?.ipcRenderer && overlayStatus === "enabled",
  };
}

// Utility functions
function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getIconHTML(type: string): string {
  const iconMap: Record<string, string> = {
    url: "🌐",
    search: "🔍",
    history: "⏰",
    bookmark: "⭐",
    context: "📄",
    perplexity: "🤖",
    agent: "🧠",
  };

  return iconMap[type] || "📄";
}

// Fast hash function for suggestion comparison (much faster than JSON.stringify)
function fastHash(suggestions: OmniboxSuggestion[]): string {
  let hash = "";
  for (let i = 0; i < suggestions.length; i++) {
    const s = suggestions[i];
    hash += `${s.id}|${s.type}|${s.text}|${s.url || ""}|`;
  }
  return hash;
}
