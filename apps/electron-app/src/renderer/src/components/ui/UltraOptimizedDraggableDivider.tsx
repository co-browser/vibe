import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { performanceMonitor } from "../../utils/performanceMonitor";

// High-performance RAF-based throttle
class RAFThrottle {
  private rafId: number | null = null;
  private lastArgs: any[] | null = null;

  constructor(private fn: (...args: any[]) => void) {}

  execute(...args: any[]) {
    this.lastArgs = args;

    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        if (this.lastArgs) {
          this.fn(...this.lastArgs);
        }
        this.rafId = null;
      });
    }
  }

  cancel() {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.lastArgs = null;
  }
}

// Efficient debounce with cleanup
class SmartDebounce {
  private timeoutId: NodeJS.Timeout | null = null;

  constructor(
    private fn: (...args: any[]) => void,
    private delay: number,
  ) {}

  execute(...args: any[]) {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    this.timeoutId = setTimeout(() => {
      this.fn(...args);
      this.timeoutId = null;
    }, this.delay);
  }

  cancel() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  flush(...args: any[]) {
    this.cancel();
    this.fn(...args);
  }
}

interface UltraOptimizedDraggableDividerProps {
  onResize: (width: number) => void;
  minWidth: number;
  maxWidth: number;
  currentWidth: number;
  onMinimize?: () => void;
}

export const UltraOptimizedDraggableDivider: React.FC<
  UltraOptimizedDraggableDividerProps
> = ({ onResize, minWidth, maxWidth, currentWidth, onMinimize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const visualElementRef = useRef<HTMLDivElement>(null);
  const shadowElementRef = useRef<HTMLDivElement>(null);

  // Track the last committed width to avoid redundant updates
  const lastCommittedWidth = useRef(currentWidth);

  // Use CSS transforms for ultra-smooth visual feedback
  const rafThrottle = useMemo(
    () =>
      new RAFThrottle((deltaX: number) => {
        if (shadowElementRef.current && dividerRef.current) {
          // Use transform for immediate visual feedback without layout recalculation
          const newWidth = startWidthRef.current + deltaX;
          const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
          const offset = clampedWidth - startWidthRef.current;

          // Update shadow element position using transform (GPU accelerated)
          shadowElementRef.current.style.transform = `translateX(${-offset}px)`;

          // Update visual indicator
          if (visualElementRef.current) {
            visualElementRef.current.style.opacity = "1";
            visualElementRef.current.style.height = "60px";
          }
        }
      }),
    [minWidth, maxWidth],
  );

  // Smart debounce that only fires if value actually changed
  const smartDebounce = useMemo(
    () =>
      new SmartDebounce((width: number) => {
        if (Math.abs(width - lastCommittedWidth.current) > 1) {
          lastCommittedWidth.current = width;
          onResize(width);
        }
      }, 100), // Increased debounce for fewer IPC calls
    [onResize],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Start performance monitoring for drag operation
      performanceMonitor.startResize();

      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;
      lastCommittedWidth.current = currentWidth;

      // Prepare for dragging
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";

      // Reset shadow element
      if (shadowElementRef.current) {
        shadowElementRef.current.style.transform = "translateX(0)";
      }
    },
    [currentWidth],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = startXRef.current - e.clientX;
      const newWidth = startWidthRef.current + deltaX;

      // Check for minimize threshold
      if (newWidth < minWidth - 50 && onMinimize) {
        rafThrottle.cancel();
        smartDebounce.cancel();
        onMinimize();
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        // End performance monitoring on minimize
        performanceMonitor.endResize();
        return;
      }

      // Update visual feedback with RAF
      rafThrottle.execute(deltaX);

      // Debounce actual resize callback
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      smartDebounce.execute(clampedWidth);
    };

    const handleMouseUp = () => {
      if (!isDragging) return;

      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.style.webkitUserSelect = "";

      // Cancel RAF updates
      rafThrottle.cancel();

      // Calculate final width from shadow position
      if (shadowElementRef.current) {
        const transform = shadowElementRef.current.style.transform;
        const match = transform.match(/translateX\(([-\d.]+)px\)/);
        if (match) {
          const offset = parseFloat(match[1]);
          const finalWidth = startWidthRef.current - offset;
          const clampedWidth = Math.max(
            minWidth,
            Math.min(maxWidth, finalWidth),
          );

          // Flush final value immediately
          smartDebounce.flush(clampedWidth);
        }

        // Reset shadow transform
        shadowElementRef.current.style.transform = "translateX(0)";
      }

      // Reset visual indicator
      if (visualElementRef.current) {
        visualElementRef.current.style.opacity = "0.5";
        visualElementRef.current.style.height = "40px";
      }

      // End performance monitoring
      performanceMonitor.endResize();
    };

    // Use passive listeners for better scroll performance
    const options = { passive: true, capture: true };
    document.addEventListener("mousemove", handleMouseMove, options);
    document.addEventListener("mouseup", handleMouseUp, { capture: true });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove, options);
      document.removeEventListener("mouseup", handleMouseUp, { capture: true });
      rafThrottle.cancel();
      smartDebounce.cancel();
    };
  }, [isDragging, minWidth, maxWidth, onMinimize, rafThrottle, smartDebounce]);

  // Update position when width changes externally
  useEffect(() => {
    if (!isDragging) {
      lastCommittedWidth.current = currentWidth;
    }
  }, [currentWidth, isDragging]);

  return (
    <>
      {/* Shadow element for visual feedback during drag */}
      <div
        ref={shadowElementRef}
        style={{
          position: "absolute",
          left: "-4px",
          top: 0,
          bottom: 0,
          width: "1px",
          backgroundColor: isDragging ? "var(--input-focus)" : "transparent",
          pointerEvents: "none",
          zIndex: 99,
          willChange: "transform",
          transform: "translateX(0)",
        }}
      />

      {/* Actual draggable divider */}
      <div
        ref={dividerRef}
        className={`ultra-draggable-divider ${isDragging ? "dragging" : ""}`}
        onMouseDown={handleMouseDown}
        style={{
          position: "absolute",
          left: "-4px",
          top: 0,
          bottom: 0,
          width: "8px",
          cursor: "col-resize",
          backgroundColor: "transparent",
          zIndex: 100,
          // Force GPU acceleration
          transform: "translateZ(0)",
          willChange: "auto",
        }}
        onMouseEnter={e => {
          if (!isDragging) {
            e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.05)";
          }
        }}
        onMouseLeave={e => {
          if (!isDragging) {
            e.currentTarget.style.backgroundColor = "transparent";
          }
        }}
      >
        <div
          ref={visualElementRef}
          style={{
            position: "absolute",
            left: "3px",
            top: "50%",
            transform: "translateY(-50%)",
            width: "2px",
            height: "40px",
            backgroundColor: isDragging
              ? "var(--input-focus)"
              : "var(--chat-border-subtle)",
            borderRadius: "1px",
            transition: isDragging ? "none" : "all 0.2s ease",
            opacity: 0.5,
            willChange: "height, opacity",
          }}
        />
      </div>
    </>
  );
};
