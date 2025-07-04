/**
 * High-performance React hook for overlay functionality
 * Provides advanced overlay management with performance optimizations
 */

import { useCallback, useRef, useState, useEffect, useMemo } from "react";
import { renderToString } from "react-dom/server";
// import { OverlayContent } from "../types/overlay";

export interface UseOverlayOptions {
  enableCache?: boolean;
  cacheSize?: number;
  debounceDelay?: number;
  performanceTracking?: boolean;
}

export interface OverlayRenderOptions {
  id?: string;
  animate?: boolean;
  animationDuration?: number;
  className?: string;
  style?: React.CSSProperties;
  interactive?: boolean;
  position?: {
    x?: number;
    y?: number;
    anchor?:
      | "top-left"
      | "top-right"
      | "bottom-left"
      | "bottom-right"
      | "center";
  };
}

export interface OverlayPerformanceStats {
  renderCount: number;
  averageRenderTime: number;
  cacheHitRate: number;
  slowRenders: number;
}

/**
 * Advanced overlay hook with performance optimizations
 */
export function useOverlay(options: UseOverlayOptions = {}) {
  const {
    enableCache = true,
    cacheSize = 50,
    debounceDelay = 16,
    performanceTracking = true,
  } = options;

  const [isVisible, setIsVisible] = useState(false);
  const [overlayIds, setOverlayIds] = useState<Set<string>>(new Set());

  // Performance tracking
  const renderCount = useRef(0);
  const cacheHits = useRef(0);
  const renderTimes = useRef<number[]>([]);

  // Content cache
  const contentCache = useRef<Map<string, string>>(new Map());
  const cacheOrder = useRef<string[]>([]);

  // Debounce timer
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);
  const pendingRenders = useRef<Array<() => Promise<void>>>([]);

  /**
   * Generate cache key from content
   */
  const generateCacheKey = useCallback(
    (component: React.ReactElement, options?: OverlayRenderOptions): string => {
      const componentKey =
        component.type.toString() +
        JSON.stringify(component.props).slice(0, 50);
      const optionsKey = options ? JSON.stringify(options).slice(0, 30) : "";
      return `${componentKey}-${optionsKey}`;
    },
    [],
  );

  /**
   * Prune cache to maintain size limit
   */
  const pruneCache = useCallback(() => {
    while (
      contentCache.current.size > cacheSize &&
      cacheOrder.current.length > 0
    ) {
      const oldestKey = cacheOrder.current.shift();
      if (oldestKey) {
        contentCache.current.delete(oldestKey);
      }
    }
  }, [cacheSize]);

  /**
   * Process pending renders
   */
  const processPendingRenders = useCallback(async () => {
    const renders = [...pendingRenders.current];
    pendingRenders.current = [];
    debounceTimer.current = null;

    // Execute all pending renders
    await Promise.all(renders.map(render => render()));
  }, []);

  /**
   * Render component with performance optimizations
   */
  const render = useCallback(
    async (
      component: React.ReactElement,
      options: OverlayRenderOptions = {},
    ) => {
      const renderTask = async () => {
        if (!window.vibeOverlay) return;

        const startTime = performanceTracking ? performance.now() : 0;
        const {
          id = `overlay-${Date.now()}`,
          animate = true,
          animationDuration = 200,
          className = "",
          style = {},
          interactive = true,
          position,
        } = options;

        // Check cache
        let html: string;
        const cacheKey = generateCacheKey(component, options);

        if (enableCache && contentCache.current.has(cacheKey)) {
          html = contentCache.current.get(cacheKey)!;
          cacheHits.current++;
        } else {
          html = renderToString(component);

          if (enableCache) {
            contentCache.current.set(cacheKey, html);
            cacheOrder.current.push(cacheKey);
            pruneCache();
          }
        }

        // Calculate position
        let positionStyle = "";
        if (position) {
          const { x = 0, y = 0, anchor = "top-left" } = position;
          const transforms = {
            "top-left": "translate(0, 0)",
            "top-right": "translate(-100%, 0)",
            "bottom-left": "translate(0, -100%)",
            "bottom-right": "translate(-100%, -100%)",
            center: "translate(-50%, -50%)",
          };
          positionStyle = `
          left: ${anchor === "center" ? "50%" : x}px;
          top: ${anchor === "center" ? "50%" : y}px;
          transform: ${transforms[anchor]};
        `;
        }

        // Build inline styles
        const inlineStyle = Object.entries(style)
          .map(
            ([key, value]) =>
              `${key.replace(/([A-Z])/g, "-$1").toLowerCase()}: ${value}`,
          )
          .join("; ");

        // Render content
        await window.vibeOverlay.render({
          html: `
          <div id="${id}" 
               class="${interactive ? "vibe-overlay-interactive" : ""} ${className}"
               style="position: fixed; ${positionStyle} ${inlineStyle} ${animate ? "opacity: 0;" : ""}">
            ${html}
          </div>
        `,
          script: animate
            ? `
          requestAnimationFrame(() => {
            const el = document.getElementById('${id}');
            if (el) {
              el.style.transition = 'opacity ${animationDuration}ms ease-out';
              el.style.opacity = '1';
            }
          });
        `
            : "",
          visible: true,
        });

        // Track overlay
        setOverlayIds(prev => new Set(prev).add(id));
        setIsVisible(true);

        // Track performance
        if (performanceTracking) {
          const renderTime = performance.now() - startTime;
          renderTimes.current.push(renderTime);
          renderCount.current++;

          // Keep only last 100 render times
          if (renderTimes.current.length > 100) {
            renderTimes.current = renderTimes.current.slice(-100);
          }
        }
      };

      // Debounce renders
      if (debounceDelay > 0) {
        pendingRenders.current.push(renderTask);

        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }

        debounceTimer.current = setTimeout(
          processPendingRenders,
          debounceDelay,
        );
      } else {
        await renderTask();
      }
    },
    [
      generateCacheKey,
      enableCache,
      pruneCache,
      performanceTracking,
      debounceDelay,
      processPendingRenders,
    ],
  );

  /**
   * Show overlay with content
   */
  const show = useCallback(
    async (component: React.ReactElement, options?: OverlayRenderOptions) => {
      await render(component, options);
    },
    [render],
  );

  /**
   * Hide specific overlay or all overlays
   */
  const hide = useCallback(async (id?: string) => {
    if (!window.vibeOverlay) return;

    if (id) {
      // Hide specific overlay
      await window.vibeOverlay.execute(`
        const el = document.getElementById('${id}');
        if (el) el.remove();
      `);

      setOverlayIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        if (next.size === 0) {
          setIsVisible(false);
          window.vibeOverlay.hide();
        }
        return next;
      });
    } else {
      // Hide all overlays
      await window.vibeOverlay.clear();
      setOverlayIds(new Set());
      setIsVisible(false);
    }
  }, []);

  /**
   * Update overlay content efficiently
   */
  const update = useCallback(
    async (id: string, component: React.ReactElement, animate = false) => {
      if (!window.vibeOverlay || !overlayIds.has(id)) return;

      const html = renderToString(component);
      const script = animate
        ? `
      const el = document.getElementById('${id}');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => {
          el.innerHTML = ${JSON.stringify(html)};
          el.style.opacity = '1';
        }, 150);
      }
    `
        : `
      const el = document.getElementById('${id}');
      if (el) el.innerHTML = ${JSON.stringify(html)};
    `;

      await window.vibeOverlay.execute(script);
    },
    [overlayIds],
  );

  /**
   * Get performance statistics
   */
  const getPerformanceStats = useCallback((): OverlayPerformanceStats => {
    const avgRenderTime =
      renderTimes.current.length > 0
        ? renderTimes.current.reduce((a, b) => a + b, 0) /
          renderTimes.current.length
        : 0;

    const cacheHitRate =
      renderCount.current > 0 ? cacheHits.current / renderCount.current : 0;

    const slowRenders = renderTimes.current.filter(time => time > 16).length;

    return {
      renderCount: renderCount.current,
      averageRenderTime: avgRenderTime,
      cacheHitRate: cacheHitRate,
      slowRenders: slowRenders,
    };
  }, []);

  /**
   * Clear all caches
   */
  const clearCache = useCallback(() => {
    contentCache.current.clear();
    cacheOrder.current = [];
    cacheHits.current = 0;
  }, []);

  /**
   * Batch multiple overlay operations
   */
  const batch = useCallback(
    async (operations: Array<() => Promise<void>>) => {
      // Disable debouncing temporarily
      const originalDelay = debounceDelay;
      Object.defineProperty(options, "debounceDelay", { value: 0 });

      // Execute all operations
      await Promise.all(operations.map(op => op()));

      // Restore debouncing
      Object.defineProperty(options, "debounceDelay", { value: originalDelay });
    },
    [debounceDelay, options],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
      hide();
    };
  }, [hide]);

  // Return memoized API
  return useMemo(
    () => ({
      show,
      hide,
      update,
      render,
      batch,
      clearCache,
      getPerformanceStats,
      isVisible,
      overlayCount: overlayIds.size,
      overlayIds: Array.from(overlayIds),
    }),
    [
      show,
      hide,
      update,
      render,
      batch,
      clearCache,
      getPerformanceStats,
      isVisible,
      overlayIds,
    ],
  );
}

/**
 * Hook for creating animated overlays
 */
export function useAnimatedOverlay() {
  const overlay = useOverlay();

  const showAnimated = useCallback(
    async (
      component: React.ReactElement,
      animation: "fade" | "slide" | "scale" | "bounce" = "fade",
      options?: OverlayRenderOptions,
    ) => {
      const animations = {
        fade: {
          initial: { opacity: 0 },
          animate: { opacity: 1 },
        },
        slide: {
          initial: { opacity: 0, transform: "translateY(-20px)" },
          animate: { opacity: 1, transform: "translateY(0)" },
        },
        scale: {
          initial: { opacity: 0, transform: "scale(0.9)" },
          animate: { opacity: 1, transform: "scale(1)" },
        },
        bounce: {
          initial: { opacity: 0, transform: "scale(0.3)" },
          animate: {
            opacity: 1,
            transform: "scale(1)",
            animation: "bounce 0.5s",
          },
        },
      };

      const { initial, animate } = animations[animation];

      await overlay.show(component, {
        ...options,
        style: { ...initial, ...options?.style },
        animate: true,
      });

      // Apply animation after render
      if (window.vibeOverlay) {
        await window.vibeOverlay.execute(`
        const el = document.querySelector('.vibe-overlay-interactive:last-child');
        if (el) {
          requestAnimationFrame(() => {
            Object.assign(el.style, ${JSON.stringify(animate)});
          });
        }
      `);
      }
    },
    [overlay],
  );

  return {
    ...overlay,
    showAnimated,
  };
}
