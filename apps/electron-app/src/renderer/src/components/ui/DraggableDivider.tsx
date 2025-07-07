import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from "react";

// Simple throttle function optimized for frequent events like mousemove
function throttle<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 16, // 60fps by default
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timer: number | null = null;

  return (...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastCall >= delay) {
      lastCall = now;
      fn(...args);
    } else {
      if (timer) {
        cancelAnimationFrame(timer);
      }

      timer = requestAnimationFrame(() => {
        lastCall = Date.now();
        fn(...args);
        timer = null;
      });
    }
  };
}

interface DraggableDividerProps {
  onResize: (width: number) => void;
  minWidth: number;
  maxWidth: number;
  currentWidth: number;
  onMinimize?: () => void;
}

export const DraggableDivider: React.FC<DraggableDividerProps> = ({
  onResize,
  minWidth,
  maxWidth,
  currentWidth,
  onMinimize,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const dividerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Create throttled resize function to limit calls to 60fps
  const throttledResize = useMemo(
    () =>
      throttle((width: number) => {
        onResize(width);
      }, 16), // 16ms = ~60fps
    [onResize],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;

      // Add cursor style to body during drag
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
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
        return;
      }

      throttledResize(clampedWidth);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove, {
        passive: true,
      });
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, minWidth, maxWidth, throttledResize, onMinimize]);

  return (
    <div
      ref={dividerRef}
      className={`draggable-divider ${isDragging ? "dragging" : ""}`}
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
        }}
      />
    </div>
  );
};
