/**
 * React hook for omnibox overlay functionality
 * Enhanced with comprehensive security measures to prevent script injection bugs
 */

import { useCallback, useEffect, useRef, useMemo, useState } from "react";
import type { SuggestionMetadata } from "../../../types/metadata";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("omnibox-overlay");

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
    /* Ensure this element captures pointer events */
    pointer-events: auto !important;
    /* Optimized transparent background with better performance */
    background: rgba(248, 249, 251, 0.85);
    /* Use will-change for better performance with transparency */
    will-change: transform, opacity;
    /* Lighter backdrop filter for performance */
    backdrop-filter: blur(12px) saturate(150%);
    -webkit-backdrop-filter: blur(12px) saturate(150%);
    /* Better corner smoothing for electron */
    border-radius: 0 0 12px 12px;
    -webkit-corner-smoothing: 100%;
    -electron-corner-smoothing: 100%;
    /* Softer shadows for cleaner look */
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 
                0 2px 8px rgba(0, 0, 0, 0.04),
                inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    overflow-y: auto;
    overflow-x: hidden;
    padding: 4px 0;
    border: 1px solid rgba(209, 213, 219, 0.3);
    border-top: none;
    max-height: 300px;
    z-index: 2147483647;
    /* Initial positioning - will be updated by JavaScript */
    top: 40px;
    left: 20px;
    width: 300px;
    min-width: 300px;
    max-width: calc(100vw - 40px);
    /* Smooth transitions */
    transition: opacity 0.15s ease, transform 0.15s ease;
    /* Prevent content overflow */
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  .suggestion-item {
    display: flex;
    align-items: center;
    padding: 10px 14px;
    cursor: pointer;
    transition: all 0.15s ease;
    border-bottom: 1px solid rgba(0, 0, 0, 0.03);
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    overflow: hidden;
    position: relative;
    /* Ensure suggestion items are clickable */
    pointer-events: auto;
    /* Prevent text overflow */
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  
  .suggestion-item:last-child {
    border-bottom: none;
  }
  
  .suggestion-item:hover {
    background-color: rgba(59, 130, 246, 0.08);
    transform: translateX(2px);
  }
  
  .suggestion-item.selected {
    background-color: rgba(59, 130, 246, 0.12);
    box-shadow: inset 0 0 0 1.5px rgba(59, 130, 246, 0.25);
  }
  
  .suggestion-icon {
    width: 24px;
    height: 24px;
    margin-right: 12px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Better icon container styling */
    background: rgba(0, 0, 0, 0.02);
    border-radius: 6px;
    padding: 2px;
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
    max-width: 100%;
    flex-shrink: 1;
  }
  
  .suggestion-description {
    font-size: 11px;
    color: #666;
    margin-top: 1px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    flex-shrink: 1;
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

  // MessagePort for direct overlay communication
  const messagePortRef = useRef<MessagePort | null>(null);

  // Use refs to store callbacks to prevent recreating event handlers
  const callbacksRef = useRef({
    onSuggestionClick,
    onEscape,
    onDeleteHistory,
    onNavigateAndClose,
  });

  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onSuggestionClick,
      onEscape,
      onDeleteHistory,
      onNavigateAndClose,
    };
  }, [onSuggestionClick, onEscape, onDeleteHistory, onNavigateAndClose]);

  // Create stable event handlers that won't cause re-renders
  const eventHandlers = useMemo(
    () => ({
      handleSuggestionClicked: (_event: any, suggestion: OmniboxSuggestion) => {
        callbacksRef.current.onSuggestionClick?.(suggestion);
      },
      handleEscapeDropdown: () => {
        callbacksRef.current.onEscape?.();
      },
      handleDeleteHistory: (_event: any, suggestionId: string) => {
        callbacksRef.current.onDeleteHistory?.(suggestionId);
      },
      handleNavigateAndClose: (_event: any, url: string) => {
        callbacksRef.current.onNavigateAndClose?.(url);
      },
      handleOverlayError: (_event: any, error: any) => {
        logger.error("Overlay error:", error);
        setErrorCount(prev => {
          const newCount = prev + 1;
          if (newCount >= 3) {
            setOverlayStatus("error");
          }
          return newCount;
        });
      },
      handleOverlayHealth: (_event: any, status: any) => {
        if (status.status === "ready") {
          setOverlayStatus("enabled");
          setErrorCount(0);
        }
      },
    }),
    [], // No dependencies - these handlers are now stable
  );

  // Setup MessagePort listener for ultra-low latency communication
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data === "overlay-port" && event.ports && event.ports[0]) {
        messagePortRef.current = event.ports[0];
        messagePortRef.current.start();

        // Setup MessagePort message handler
        messagePortRef.current.onmessage = msgEvent => {
          const { type, data } = msgEvent.data;
          switch (type) {
            case "omnibox:suggestion-clicked":
              eventHandlers.handleSuggestionClicked(null, data);
              break;
            case "omnibox:escape-dropdown":
              eventHandlers.handleEscapeDropdown();
              break;
            case "omnibox:delete-history":
              eventHandlers.handleDeleteHistory(null, data);
              break;
            case "omnibox:navigate-and-close":
              eventHandlers.handleNavigateAndClose(null, data);
              break;
            case "overlay:error":
              eventHandlers.handleOverlayError(null, data);
              break;
            case "overlay:health-check":
              eventHandlers.handleOverlayHealth(null, data);
              break;
          }
        };

        logger.info("MessagePort established for direct overlay communication");
      }
    };

    window.addEventListener("message", handleMessage);

    return () => {
      window.removeEventListener("message", handleMessage);
      if (messagePortRef.current) {
        messagePortRef.current.close();
      }
    };
  }, [eventHandlers]);

  // Setup IPC event listeners as fallback
  useEffect(() => {
    if (window.electron?.ipcRenderer) {
      const ipcRenderer = window.electron.ipcRenderer;

      // Add event listeners with debugging
      const debugHandleSuggestionClicked = (event: any, suggestion: any) => {
        console.log(
          "🔥 IPC: Received suggestion click event:",
          event,
          suggestion,
        );
        eventHandlers.handleSuggestionClicked(event, suggestion);
      };

      ipcRenderer.on(
        "omnibox:suggestion-clicked",
        debugHandleSuggestionClicked,
      );
      ipcRenderer.on(
        "omnibox:escape-dropdown",
        eventHandlers.handleEscapeDropdown,
      );
      ipcRenderer.on(
        "omnibox:delete-history",
        eventHandlers.handleDeleteHistory,
      );
      ipcRenderer.on(
        "omnibox:navigate-and-close",
        eventHandlers.handleNavigateAndClose,
      );
      ipcRenderer.on("overlay:error", eventHandlers.handleOverlayError);
      ipcRenderer.on("overlay:health-check", eventHandlers.handleOverlayHealth);

      return () => {
        ipcRenderer.removeListener(
          "omnibox:suggestion-clicked",
          debugHandleSuggestionClicked,
        );
        ipcRenderer.removeListener(
          "omnibox:escape-dropdown",
          eventHandlers.handleEscapeDropdown,
        );
        ipcRenderer.removeListener(
          "omnibox:delete-history",
          eventHandlers.handleDeleteHistory,
        );
        ipcRenderer.removeListener(
          "omnibox:navigate-and-close",
          eventHandlers.handleNavigateAndClose,
        );
        ipcRenderer.removeListener(
          "overlay:error",
          eventHandlers.handleOverlayError,
        );
        ipcRenderer.removeListener(
          "overlay:health-check",
          eventHandlers.handleOverlayHealth,
        );
      };
    }
    return undefined;
  }, [eventHandlers]); // eventHandlers are stable

  // Function to update overlay positioning based on omnibar container (must be defined before use)
  const updateOverlayPosition = useCallback(() => {
    if (!window.electron?.ipcRenderer || overlayStatus !== "enabled") return;

    const omnibarContainer = document.querySelector(".omnibar-container");
    if (!omnibarContainer) {
      logger.debug("Omnibar container not found, using fallback positioning");
      applyFallbackPositioning();
      return;
    }

    // Check if container is visible
    const containerRect = omnibarContainer.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) {
      logger.debug(
        "Omnibar container has zero dimensions, using fallback positioning",
      );
      applyFallbackPositioning();
      return;
    }

    try {
      const rect = omnibarContainer.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate position with improved bounds checking
      const navbarWidth = rect.width;
      const navbarLeft = rect.left;
      const navbarBottom = rect.bottom;

      // Set overlay width to match navbar width
      let overlayWidth = navbarWidth;
      let leftPosition = navbarLeft;

      // Ensure overlay doesn't exceed viewport bounds
      const minMargin = 12; // Match navbar margin
      const maxRight = windowWidth - minMargin;
      const maxLeft = maxRight - overlayWidth;

      // Adjust if overlay would go off the right edge
      if (leftPosition + overlayWidth > maxRight) {
        leftPosition = Math.max(minMargin, maxLeft);
        // If still too wide, reduce width
        if (leftPosition + overlayWidth > maxRight) {
          overlayWidth = maxRight - leftPosition;
        }
      }

      // Ensure minimum left margin
      if (leftPosition < minMargin) {
        leftPosition = minMargin;
        // Recalculate width if position was adjusted
        const availableWidth = maxRight - leftPosition;
        overlayWidth = Math.min(overlayWidth, availableWidth);
      }

      // Ensure minimum width
      const minWidth = 300;
      if (overlayWidth < minWidth) {
        overlayWidth = Math.min(minWidth, windowWidth - minMargin * 2);
        leftPosition = Math.max(minMargin, (windowWidth - overlayWidth) / 2);
      }

      // Vertical positioning with bounds checking
      let topPosition = navbarBottom;
      const maxHeight = 300; // Max dropdown height

      // Check if dropdown would go off bottom of screen
      if (topPosition + maxHeight > windowHeight - 20) {
        // Position above navbar if there's more space
        const spaceAbove = rect.top - 20;
        const spaceBelow = windowHeight - navbarBottom - 20;

        if (spaceAbove > spaceBelow && spaceAbove > 150) {
          topPosition = rect.top - maxHeight;
        }
      }

      // Apply positioning with minimal script to reduce execution errors
      const updateScript = `
        (function() {
          try {
            const overlay = document.querySelector('.omnibox-dropdown');
            if (overlay) {
              overlay.style.position = 'fixed';
              overlay.style.left = '${leftPosition}px';
              overlay.style.top = '${topPosition}px';
              overlay.style.width = '${overlayWidth}px';
              overlay.style.maxWidth = '${overlayWidth}px';
              overlay.style.maxHeight = '${maxHeight}px';
              overlay.style.zIndex = '2147483647';
            }
          } catch (error) {
            // Continue silently on error
          }
        })();
      `;

      window.electron.ipcRenderer
        .invoke("overlay:execute", updateScript)
        .catch(error => {
          logger.debug(
            "Overlay positioning script failed, using fallback:",
            error.message,
          );
          // Try fallback positioning if main positioning fails
          applyFallbackPositioning();
        });
    } catch (error) {
      logger.error("Error in overlay positioning calculation:", error);
      applyFallbackPositioning();
    }

    // Fallback positioning function
    function applyFallbackPositioning() {
      const windowWidth = window.innerWidth;

      // Use safe fallback values
      const fallbackWidth = Math.min(500, windowWidth - 40);
      const fallbackLeft = Math.max(20, (windowWidth - fallbackWidth) / 2);
      const fallbackTop = 80; // Below typical navbar height

      const fallbackScript = `
        (function() {
          try {
            const overlay = document.querySelector('.omnibox-dropdown');
            if (overlay) {
              overlay.style.position = 'fixed';
              overlay.style.left = '${fallbackLeft}px';
              overlay.style.top = '${fallbackTop}px';
              overlay.style.width = '${fallbackWidth}px';
              overlay.style.maxWidth = '${fallbackWidth}px';
              overlay.style.maxHeight = '300px';
              overlay.style.zIndex = '2147483647';
            }
          } catch (error) {
            // Continue silently on error
          }
        })();
      `;

      window.electron.ipcRenderer
        .invoke("overlay:execute", fallbackScript)
        .catch(error =>
          logger.debug(
            "Fallback overlay positioning also failed:",
            error.message,
          ),
        );
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

    // Also listen for scroll events that might affect positioning
    window.addEventListener("scroll", handleResize);

    // Also update position when overlay becomes visible
    if (overlayStatus === "enabled") {
      updateOverlayPosition();
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize);
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
        resizeTimeoutRef.current = null;
      }
    };
  }, [updateOverlayPosition, overlayStatus]);

  // Full content rendering function with virtual scrolling
  const renderFullContent = useCallback(
    async (suggestions: OmniboxSuggestion[]) => {
      const MAX_VISIBLE_ITEMS = 10; // Only render 10 items for performance
      const visibleSuggestions =
        suggestions.length > MAX_VISIBLE_ITEMS
          ? suggestions.slice(0, MAX_VISIBLE_ITEMS)
          : suggestions;

      // Generate safe HTML with initial positioning (will be updated by updateOverlayPosition)
      const safeHtml = `
      <div class="vibe-overlay-interactive omnibox-dropdown" style="
        position: fixed;
        top: 40px;
        left: 20px;
        width: 300px;
        max-width: calc(100vw - 40px);
        max-height: 300px;
        margin: 0;
        border-radius: 0 0 12px 12px;
        -webkit-corner-smoothing: 100%;
        -electron-corner-smoothing: 100%;
        border-top: none;
        z-index: 2147483647;
        box-sizing: border-box;
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
               data-suggestion-text="${escapeHtml(suggestion.text)}"
               data-suggestion-description="${escapeHtml(suggestion.description || "")}"
               data-suggestion-data="${escapeHtml(JSON.stringify(suggestion))}">
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

      // Debug: Log the generated HTML
      console.log(
        "🔥 Generated HTML for overlay:",
        safeHtml.substring(0, 200) + "...",
      );
      console.log("🔥 Number of suggestions:", suggestions.length);

      // Update overlay content safely
      const renderResult = await window.electron.ipcRenderer.invoke(
        "overlay:render",
        {
          html: safeHtml,
          css: STATIC_CSS,
          visible: true,
          priority: "critical",
          type: "omnibox-suggestions",
        },
      );

      console.log("🔥 Overlay render result:", renderResult);

      // Update position after rendering to ensure proper alignment
      // Use multiple timeouts to handle different rendering phases
      setTimeout(() => updateOverlayPosition(), 0);
      setTimeout(() => updateOverlayPosition(), 10);
      setTimeout(() => updateOverlayPosition(), 50);

      // Test if overlay is clickable and create debug function
      setTimeout(() => {
        window.electron.ipcRenderer
          .invoke(
            "overlay:execute",
            `
          (function() {
            try {
              const results = {
                containerFound: false,
                containerLength: 0,
                itemsFound: 0,
                firstItemData: null,
                clickDispatched: false,
                error: null,
                electronAPIAvailable: !!window.electronAPI,
                overlayAPIAvailable: !!(window.electronAPI && window.electronAPI.overlay),
                overlaySendAvailable: !!(window.electronAPI && window.electronAPI.overlay && window.electronAPI.overlay.send)
              };
              
              const container = document.getElementById('vibe-overlay-container');
              if (container) {
                results.containerFound = true;
                results.containerLength = container.innerHTML.length;
                
                const items = container.querySelectorAll('.suggestion-item');
                results.itemsFound = items.length;
                
                // Test by programmatically clicking the first item
                if (items.length > 0) {
                  const firstItem = items[0];
                  results.firstItemData = {
                    id: firstItem.dataset.suggestionId,
                    text: firstItem.dataset.suggestionText,
                    type: firstItem.dataset.suggestionType,
                    url: firstItem.dataset.suggestionUrl,
                    hasDataset: !!firstItem.dataset,
                    className: firstItem.className,
                    tagName: firstItem.tagName
                  };
                  
                  // Create and dispatch a click event
                  const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  
                  firstItem.dispatchEvent(clickEvent);
                  results.clickDispatched = true;
                }
              }
              
              // Create a global debug function
              window.testOverlayClick = function() {
                console.log('🔥 OVERLAY DEBUG: Testing click manually');
                const items = document.querySelectorAll('.suggestion-item');
                if (items.length > 0) {
                  const firstItem = items[0];
                  console.log('🔥 OVERLAY DEBUG: Found first item:', firstItem);
                  console.log('🔥 OVERLAY DEBUG: First item dataset:', firstItem.dataset);
                  
                  const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                  });
                  
                  console.log('🔥 OVERLAY DEBUG: Dispatching click event');
                  firstItem.dispatchEvent(clickEvent);
                  console.log('🔥 OVERLAY DEBUG: Click event dispatched');
                }
              };
              
              return results;
            } catch (error) {
              return {
                containerFound: false,
                containerLength: 0,
                itemsFound: 0,
                firstItemData: null,
                clickDispatched: false,
                error: error.message,
                electronAPIAvailable: false,
                overlayAPIAvailable: false,
                overlaySendAvailable: false
              };
            }
          })();
        `,
          )
          .then(result => {
            console.log("🔥 Overlay test result:", result);
            if (result.firstItemData) {
              console.log("🔥 First item data details:", result.firstItemData);
            }
          })
          .catch(error => {
            console.log("🔥 Overlay test failed:", error);
          });
      }, 100);

      // Also update position when DOM is fully ready
      if (document.readyState === "complete") {
        setTimeout(() => updateOverlayPosition(), 100);
      } else {
        window.addEventListener(
          "load",
          () => {
            setTimeout(() => updateOverlayPosition(), 100);
          },
          { once: true },
        );
      }

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
              logger.error("Failed to execute incremental update:", error);
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
          logger.error("Failed to render overlay content:", error);
          setOverlayStatus("error");
        }
        return false;
      }
    },
    [overlayStatus, renderFullContent],
  );

  // Show suggestions with comprehensive error handling and race condition prevention
  const showSuggestions = useCallback(
    async (suggestions: OmniboxSuggestion[], force: boolean = false) => {
      if (overlayStatus === "error") {
        return false;
      }

      if (!window.electron?.ipcRenderer) {
        return false;
      }

      // Check for changes to avoid unnecessary updates (fast hash comparison)
      const currentHash = fastHash(suggestions);

      // Get current overlay state to check if it's actually visible
      const overlayState =
        await window.electron.ipcRenderer.invoke("overlay:getState");

      // Only skip if we have the same content AND overlay is actually visible
      // Always render if hash is empty (cleared by hideOverlay) or overlay is not visible
      if (
        !force &&
        currentHash === lastSuggestionsHashRef.current &&
        lastSuggestionsHashRef.current !== "" &&
        isShowingRef.current &&
        overlayState?.isVisible
      ) {
        logger.debug("Skipping overlay update - same content already showing");
        return true;
      }

      lastSuggestionsRef.current = suggestions;
      lastSuggestionsHashRef.current = currentHash;
      isShowingRef.current = true;

      try {
        // Always ensure overlay is visible when showing suggestions
        await window.electron.ipcRenderer.invoke("overlay:show");
        return await renderOverlayContent(suggestions);
      } catch (error) {
        logger.error("Failed to show suggestions:", error);
        setOverlayStatus("error");
        return false;
      }
    },
    [renderOverlayContent, overlayStatus],
  );

  // Hide overlay safely and completely
  const hideOverlay = useCallback(() => {
    if (!window.electron?.ipcRenderer) return;

    try {
      // Hide the overlay completely
      window.electron.ipcRenderer.invoke("overlay:hide");

      // Also execute script to ensure complete hiding
      window.electron.ipcRenderer.invoke(
        "overlay:execute",
        `
        (function() {
          // Disable all pointer events immediately
          document.documentElement.style.pointerEvents = 'none';
          document.body.style.pointerEvents = 'none';
          
          const container = document.getElementById('vibe-overlay-container');
          if (container) {
            container.classList.remove('active');
            container.style.display = 'none';
            container.style.visibility = 'hidden';
            container.style.opacity = '0';
            container.style.pointerEvents = 'none';
          }
          
          console.log('🔥 Overlay hidden via hideOverlay');
        })();
      `,
      );

      isShowingRef.current = false;
      lastSelectedIndexRef.current = -1;
      // Clear the hash so overlay can show again with same suggestions
      lastSuggestionsHashRef.current = "";
      // Also clear the content to ensure clean state for next show
      window.electron.ipcRenderer.invoke("overlay:clear");
    } catch (error) {
      logger.error("Failed to hide overlay:", error);
      setOverlayStatus("error");
    }
  }, []);

  // Clear overlay safely and completely
  const clearOverlay = useCallback(() => {
    if (!window.electron?.ipcRenderer) return;

    try {
      // First hide completely
      hideOverlay();

      // Then clear content
      window.electron.ipcRenderer.invoke("overlay:clear");

      isShowingRef.current = false;
      lastSelectedIndexRef.current = -1;
      lastSuggestionsRef.current = [];
      // Clear the hash to ensure overlay can be shown again
      lastSuggestionsHashRef.current = "";
    } catch (error) {
      logger.error("Failed to clear overlay:", error);
      setOverlayStatus("error");
    }
  }, [hideOverlay]);

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
  // Use better-looking Unicode icons with span wrapping for styling
  const iconMap: Record<string, string> = {
    url: '<span style="font-size: 18px; filter: hue-rotate(240deg);">🌐</span>',
    search: '<span style="font-size: 18px;">🔎</span>',
    history: '<span style="font-size: 18px; filter: sepia(0.3);">🕐</span>',
    bookmark:
      '<span style="font-size: 18px; filter: brightness(1.2);">⭐</span>',
    context:
      '<span style="font-size: 18px; filter: hue-rotate(180deg);">🔗</span>',
    perplexity:
      '<span style="font-size: 18px; filter: hue-rotate(200deg);">🤖</span>',
    agent:
      '<span style="font-size: 18px; filter: hue-rotate(280deg);">✨</span>',
  };

  return iconMap[type] || '<span style="font-size: 18px;">📑</span>';
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
