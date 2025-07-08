import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// Ultra-optimized throttle for smooth dragging
function smoothThrottle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 8, // 120fps for ultra-smooth dragging
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let lastArgs: Parameters<T> | null = null;
  let timer: number | null = null;

  return (...args: Parameters<T>) => {
    const now = performance.now(); // Use performance.now() for higher precision
    lastArgs = args;

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else {
      if (timer) {
        cancelAnimationFrame(timer);
      }

      timer = requestAnimationFrame(() => {
        if (lastArgs) {
          lastCall = performance.now();
          fn(...lastArgs);
          lastArgs = null;
        }
        timer = null;
      });
    }
  };
}

// Efficient debounce for final updates
function efficientDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 100,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

interface OptimizedDraggableDividerProps {
  onResize: (width: number) => void;
  minWidth: number;
  maxWidth: number;
  currentWidth: number;
  onMinimize?: () => void;
}

export const OptimizedDraggableDivider: React.FC<
  OptimizedDraggableDividerProps
> = ({ onResize, minWidth, maxWidth, currentWidth, onMinimize }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [visualWidth, setVisualWidth] = useState(currentWidth);
  const dividerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const lastWidthRef = useRef(currentWidth);

  // Update visual width when currentWidth changes (from external sources)
  useEffect(() => {
    if (!isDragging) {
      setVisualWidth(currentWidth);
      lastWidthRef.current = currentWidth;
    }
  }, [currentWidth, isDragging]);

  // Ultra-smooth visual updates
  const smoothVisualResize = useMemo(
    () =>
      smoothThrottle((width: number) => {
        setVisualWidth(width);
      }, 8), // 120fps for ultra-smooth visual feedback
    [],
  );

  // Efficient final resize with debouncing
  const efficientFinalResize = useMemo(
    () =>
      efficientDebounce((width: number) => {
        if (Math.abs(width - lastWidthRef.current) > 1) {
          lastWidthRef.current = width;
          onResize(width);
        }
      }, 50), // Optimized debounce
    [onResize],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;

      // Optimized cursor and selection handling
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.body.style.webkitUserSelect = "none";
    },
    [currentWidth],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = startXRef.current - e.clientX;
      const newWidth = startWidthRef.current + deltaX;

      // Clamp the width within min/max bounds
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      // Check if we should minimize
      if (newWidth < minWidth - 50 && onMinimize) {
        onMinimize();
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";
        return;
      }

      // Update visual feedback immediately for ultra-smooth dragging
      smoothVisualResize(clampedWidth);

      // Efficient final resize with debouncing
      efficientFinalResize(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.body.style.webkitUserSelect = "";

        // Ensure final width is set
        const finalWidth = visualWidth;
        if (Math.abs(finalWidth - lastWidthRef.current) > 1) {
          lastWidthRef.current = finalWidth;
          onResize(finalWidth);
        }
      }
    };

    if (isDragging) {
      // Use passive listeners for better performance
      document.addEventListener("mousemove", handleMouseMove, {
        passive: true,
      });
      document.addEventListener("mouseup", handleMouseUp, {
        passive: true,
      });
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [
    isDragging,
    minWidth,
    maxWidth,
    smoothVisualResize,
    efficientFinalResize,
    onMinimize,
    visualWidth,
    onResize,
  ]);

  return (
    <div
      ref={dividerRef}
      className={`optimized-draggable-divider ${isDragging ? "dragging" : ""}`}
      onMouseDown={handleMouseDown}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "6px",
        cursor: "col-resize",
        backgroundColor: "transparent",
        transition: isDragging ? "none" : "background-color 0.2s ease",
        zIndex: 100,
        // Performance optimizations
        willChange: "background-color",
        transform: "translateZ(0)", // Force hardware acceleration
      }}
      onMouseEnter={e => {
        if (!isDragging) {
          e.currentTarget.style.backgroundColor = "rgba(0, 0, 0, 0.1)";
        }
      }}
      onMouseLeave={e => {
        if (!isDragging) {
          e.currentTarget.style.backgroundColor = "transparent";
        }
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "2px",
          top: "50%",
          transform: "translateY(-50%)",
          width: "2px",
          height: "40px",
          backgroundColor: isDragging
            ? "var(--input-focus)"
            : "var(--chat-border-subtle)",
          borderRadius: "1px",
          transition: isDragging ? "none" : "all 0.2s ease",
          opacity: isDragging ? 1 : 0.5,
          // Performance optimizations
          willChange: "background-color, opacity",
        }}
      />
    </div>
  );
};
