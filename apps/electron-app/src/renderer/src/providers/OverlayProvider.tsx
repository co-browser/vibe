/**
 * High-performance React Overlay Provider
 * Provides optimized overlay functionality with React portal support
 */

import React, {
  useCallback,
  useState,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { renderToString } from "react-dom/server";
import {
  OverlayContext,
  type OverlayOptions,
  type OverlayItem,
  type OverlayPosition,
  type OverlayContextType,
} from "../contexts/OverlayContext";

// Portal container component
function OverlayPortal({ children }: { children: React.ReactNode }) {
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    // Create portal root if it doesn't exist
    let root = document.getElementById("vibe-overlay-portal-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "vibe-overlay-portal-root";
      root.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        z-index: 9999;
      `;
      document.body.appendChild(root);
    }
    setPortalRoot(root);

    return () => {
      // Cleanup only if no other overlays are using it
      if (root && root.childElementCount === 0) {
        root.remove();
      }
    };
  }, []);

  if (!portalRoot) return null;
  return createPortal(children, portalRoot);
}

// Provider component
export function OverlayProvider({ children }: { children: React.ReactNode }) {
  const [overlays, setOverlays] = useState<Map<string, OverlayItem>>(new Map());
  const overlayIdCounter = useRef(0);
  const autoHideTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const renderCache = useRef<Map<string, { html: string; timestamp: number }>>(
    new Map(),
  );
  const overlaysRef = useRef<Map<string, OverlayItem>>(new Map());

  // Keep overlaysRef in sync with overlays state
  useEffect(() => {
    overlaysRef.current = overlays;
  }, [overlays]);

  // Generate unique ID
  const generateId = useCallback(() => {
    return `overlay-${Date.now()}-${++overlayIdCounter.current}`;
  }, []);

  // Get position styles
  const getPositionStyles = useCallback(
    (position?: OverlayPosition): React.CSSProperties => {
      if (!position)
        return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

      if (position.anchor) {
        // Position relative to anchor element
        const { top, left, width, height } = position.anchor;
        return {
          position: "fixed",
          top: top + height + 8,
          left: left,
          minWidth: width,
        };
      }

      if (position.custom) {
        return { position: "fixed", ...position.custom };
      }

      const presets: Record<string, React.CSSProperties> = {
        center: { top: "50%", left: "50%", transform: "translate(-50%, -50%)" },
        top: { top: 20, left: "50%", transform: "translateX(-50%)" },
        bottom: { bottom: 20, left: "50%", transform: "translateX(-50%)" },
        "top-right": { top: 20, right: 20 },
        "top-left": { top: 20, left: 20 },
        "bottom-right": { bottom: 20, right: 20 },
        "bottom-left": { bottom: 20, left: 20 },
      };

      return {
        position: "fixed",
        ...(presets[position.preset || "center"] || presets.center),
      };
    },
    [],
  );

  // Show overlay
  const show = useCallback(
    (content: React.ReactElement, options: OverlayOptions = {}) => {
      const id = options.id || generateId();

      // Clear existing auto-hide timer for this ID
      const existingTimer = autoHideTimers.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
        autoHideTimers.current.delete(id);
      }

      // Create overlay item
      const overlayItem: OverlayItem = {
        id,
        content,
        options: {
          animate: true,
          animationDuration: 200,
          dismissOnClickOutside: true,
          dismissOnEscape: true,
          priority: "normal",
          ...options,
        },
        timestamp: Date.now(),
      };

      // Add to overlays
      setOverlays(prev => new Map(prev).set(id, overlayItem));

      // Render to overlay window if available
      if (window.vibeOverlay) {
        const html = renderToString(content);
        const cacheKey = `${id}-${html.slice(0, 50)}`;

        // Check render cache with timestamp-based cleanup
        if (!renderCache.current.has(cacheKey)) {
          renderCache.current.set(cacheKey, { html, timestamp: Date.now() });

          // Prune cache if too large - remove oldest entries
          if (renderCache.current.size > 100) {
            const entries = Array.from(renderCache.current.entries());
            const sortedEntries = entries.sort(
              (a, b) => a[1].timestamp - b[1].timestamp,
            );
            const entriesToRemove = sortedEntries.slice(0, 50);
            entriesToRemove.forEach(([key]) => renderCache.current.delete(key));
          }
        }

        const positionStyles = getPositionStyles(options.position);
        const styleString = Object.entries(positionStyles)
          .map(
            ([key, value]) =>
              `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value}`,
          )
          .join("; ");

        window.vibeOverlay.render({
          html: `
          <div id="${id}" 
               class="vibe-overlay-interactive overlay-item ${options.className || ""}" 
               style="position: fixed; ${styleString}; ${options.animate ? "opacity: 0;" : ""}">
            ${html}
          </div>
        `,
          script: `
          (function() {
            // Store cleanup functions for this overlay
            if (!window.vibeOverlayCleanup) {
              window.vibeOverlayCleanup = {};
            }
            window.vibeOverlayCleanup['${id}'] = [];
            
            // Animation
            ${
              options.animate
                ? `
              requestAnimationFrame(() => {
                const el = document.getElementById('${id}');
                if (el) {
                  el.style.transition = 'opacity ${options.animationDuration}ms ease-out, transform ${options.animationDuration}ms ease-out';
                  el.style.opacity = '1';
                }
              });
            `
                : ""
            }
            
            // Click outside handler with proper cleanup tracking
            ${
              options.dismissOnClickOutside
                ? `
              function overlayClickHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")}(e) {
                const overlay = document.getElementById('${id}');
                if (overlay && !overlay.contains(e.target)) {
                  window.electron.ipcRenderer.send('overlay:dismiss', '${id}');
                }
              }
              
              document.addEventListener('click', overlayClickHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")});
              window.vibeOverlayCleanup['${id}'].push(() => {
                document.removeEventListener('click', overlayClickHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")});
              });
            `
                : ""
            }
            
            // Escape handler with proper cleanup tracking
            ${
              options.dismissOnEscape
                ? `
              function overlayEscapeHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")}(e) {
                if (e.key === 'Escape') {
                  window.electron.ipcRenderer.send('overlay:dismiss', '${id}');
                }
              }
              
              document.addEventListener('keydown', overlayEscapeHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")});
              window.vibeOverlayCleanup['${id}'].push(() => {
                document.removeEventListener('keydown', overlayEscapeHandler_${id.replace(/[^a-zA-Z0-9]/g, "_")});
              });
            `
                : ""
            }
          })();
        `,
          visible: true,
        });
      }

      // Setup auto-hide
      if (options.autoHide && options.autoHide > 0) {
        const timer = setTimeout(() => {
          // Inline hide to avoid circular dependency
          setOverlays(prev => {
            const overlay = prev.get(id);
            if (!overlay) return prev;

            // Clear auto-hide timer
            const timer = autoHideTimers.current.get(id);
            if (timer) {
              clearTimeout(timer);
              autoHideTimers.current.delete(id);
            }

            if (window.vibeOverlay && overlay.options.animate) {
              window.vibeOverlay.execute(`
              const el = document.getElementById('${id}');
              if (el) {
                el.style.opacity = '0';
                setTimeout(() => {
                  el.remove();
                }, ${overlay.options.animationDuration});
              }
            `);
            }

            overlay.options.onHide?.();

            if (prev.size === 1) {
              window.vibeOverlay?.hide();
            }

            const next = new Map(prev);
            next.delete(id);
            return next;
          });
        }, options.autoHide);
        autoHideTimers.current.set(id, timer);
      }

      // Call onShow callback
      options.onShow?.();

      return id;
    },
    [generateId, getPositionStyles],
  );

  // Hide overlay with race condition protection
  const hide = useCallback((id?: string) => {
    if (id) {
      setOverlays(prev => {
        const overlay = prev.get(id);
        if (!overlay) return prev;

        // Clear auto-hide timer
        const timer = autoHideTimers.current.get(id);
        if (timer) {
          clearTimeout(timer);
          autoHideTimers.current.delete(id);
        }

        // Clean up event listeners in overlay
        if (window.vibeOverlay) {
          window.vibeOverlay.execute(`
            if (window.vibeOverlayCleanup && window.vibeOverlayCleanup['${id}']) {
              window.vibeOverlayCleanup['${id}'].forEach(cleanup => {
                try { cleanup(); } catch (e) { console.warn('Cleanup error:', e); }
              });
              delete window.vibeOverlayCleanup['${id}'];
            }
          `);

          // Animate out if enabled
          if (overlay.options.animate) {
            window.vibeOverlay.execute(`
              const el = document.getElementById('${id}');
              if (el) {
                el.style.opacity = '0';
                setTimeout(() => {
                  el.remove();
                }, ${overlay.options.animationDuration});
              }
            `);
          } else {
            window.vibeOverlay.execute(`
              const el = document.getElementById('${id}');
              if (el) el.remove();
            `);
          }
        }

        // Call onHide callback
        overlay.options.onHide?.();

        const next = new Map(prev);
        next.delete(id);

        // Hide overlay window if no more overlays
        if (next.size === 0) {
          window.vibeOverlay?.hide();
        }

        return next;
      });
    } else {
      // Hide all overlays with proper cleanup
      setOverlays(prev => {
        // Clear all timers
        autoHideTimers.current.forEach(timer => clearTimeout(timer));
        autoHideTimers.current.clear();

        // Call all onHide callbacks
        prev.forEach(overlay => overlay.options.onHide?.());

        // Clean up all event listeners
        if (window.vibeOverlay) {
          window.vibeOverlay.execute(`
            if (window.vibeOverlayCleanup) {
              Object.keys(window.vibeOverlayCleanup).forEach(overlayId => {
                window.vibeOverlayCleanup[overlayId].forEach(cleanup => {
                  try { cleanup(); } catch (e) { console.warn('Cleanup error:', e); }
                });
              });
              window.vibeOverlayCleanup = {};
            }
          `);
        }

        // Clear overlay window
        window.vibeOverlay?.clear();

        return new Map();
      });
    }
  }, []);

  // Hide all overlays with proper cleanup
  const hideAll = useCallback(() => {
    hide(); // Use the hide function without id to hide all
  }, [hide]);

  // Update overlay content
  const update = useCallback((id: string, content: React.ReactElement) => {
    setOverlays(prev => {
      const next = new Map(prev);
      const overlay = next.get(id);
      if (overlay) {
        next.set(id, { ...overlay, content });

        // Update in overlay window
        if (window.vibeOverlay) {
          const html = renderToString(content);
          window.vibeOverlay.execute(`
            const el = document.getElementById('${id}');
            if (el) el.innerHTML = ${JSON.stringify(html)};
          `);
        }
      }
      return next;
    });
  }, []);

  // Check if overlay is visible
  const isVisible = useCallback(
    (id?: string) => {
      if (id) {
        return overlays.has(id);
      }
      return overlays.size > 0;
    },
    [overlays],
  );

  // Listen for dismiss events from overlay window
  useEffect(() => {
    const handleDismiss = (_event: any, id: string) => {
      hide(id);
    };

    window.electron?.ipcRenderer?.on("overlay:dismiss", handleDismiss);
    return () => {
      window.electron?.ipcRenderer?.removeListener(
        "overlay:dismiss",
        handleDismiss,
      );
    };
  }, [hide]);

  // Cleanup on unmount - use ref to avoid dependency issues
  useEffect(() => {
    return () => {
      // Copy refs to variables to avoid React hooks warnings
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timers = autoHideTimers.current;
      const overlaysToCleanup = overlaysRef.current;
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const cache = renderCache.current;

      // Clear all timers
      timers.forEach(timer => clearTimeout(timer));
      timers.clear();

      // Call all onHide callbacks
      overlaysToCleanup.forEach(overlay => overlay.options.onHide?.());

      // Clean up all event listeners in overlay
      if (window.vibeOverlay) {
        window.vibeOverlay.execute(`
        if (window.vibeOverlayCleanup) {
          Object.keys(window.vibeOverlayCleanup).forEach(overlayId => {
            window.vibeOverlayCleanup[overlayId].forEach(cleanup => {
              try { cleanup(); } catch (e) { console.warn('Cleanup error:', e); }
            });
          });
          window.vibeOverlayCleanup = {};
        }
      `);
      }

      // Clear overlay window
      window.vibeOverlay?.clear();

      // Clear render cache
      cache.clear();
    };
  }, []); // No dependencies to avoid re-registration

  // Context value
  const contextValue = useMemo<OverlayContextType>(
    () => ({
      show,
      hide,
      hideAll,
      update,
      isVisible,
      activeOverlays: Array.from(overlays.values()),
    }),
    [show, hide, hideAll, update, isVisible, overlays],
  );

  // Render overlays in portal
  const overlayElements = Array.from(overlays.values())
    .sort((a, b) => {
      // Sort by priority then timestamp
      const priorityOrder = { high: 3, normal: 2, low: 1 };
      const aPriority = priorityOrder[a.options.priority || "normal"];
      const bPriority = priorityOrder[b.options.priority || "normal"];
      if (aPriority !== bPriority) return bPriority - aPriority;
      return a.timestamp - b.timestamp;
    })
    .map(overlay => (
      <div
        key={overlay.id}
        id={overlay.id}
        className={`vibe-overlay-item ${overlay.options.className || ""}`}
        style={{
          position: "fixed",
          pointerEvents: "auto",
          ...getPositionStyles(overlay.options.position),
          ...overlay.options.style,
        }}
      >
        {overlay.content}
      </div>
    ));

  return (
    <OverlayContext.Provider value={contextValue}>
      {children}
      <OverlayPortal>{overlayElements}</OverlayPortal>
    </OverlayContext.Provider>
  );
}
