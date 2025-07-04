/**
 * Overlay Demo Component
 * Demonstrates the high-performance overlay system capabilities
 */

import React, { useState, useRef, useEffect } from "react";
import { useOverlay, useAnimatedOverlay } from "../../hooks/useOverlay";
import { OverlayProvider } from "../../providers/OverlayProvider";
import { OverlayComponents } from "../ui/OverlayComponents";

export function OverlayDemo() {
  const overlay = useOverlay();
  const animatedOverlay = useAnimatedOverlay();
  const [performanceStats, setPerformanceStats] = useState<any>(null);

  // Track all timeouts for cleanup
  const timeoutRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  // Helper function to create tracked timeouts
  const createTimeout = (
    callback: () => void,
    delay: number,
  ): NodeJS.Timeout => {
    const timeoutId = setTimeout(() => {
      timeoutRefs.current.delete(timeoutId);
      callback();
    }, delay);
    timeoutRefs.current.add(timeoutId);
    return timeoutId;
  };

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      // Copy ref to variable to avoid React hooks warning
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const timeouts = timeoutRefs.current;
      timeouts.forEach(timeoutId => {
        clearTimeout(timeoutId);
      });
      timeouts.clear();
    };
  }, []);

  // Example 1: Simple toast notification
  const showToast = async () => {
    await overlay.show(
      <OverlayComponents.Toast
        message="This is a high-performance overlay!"
        type="success"
      />,
      {
        position: { anchor: "top-right" },
        animate: true,
        className: "demo-toast",
      },
    );
  };

  // Example 2: Interactive dialog
  const showDialog = async () => {
    const dialogId = `dialog-${Date.now()}`;
    await overlay.show(
      <OverlayComponents.Dialog
        title="Overlay Dialog"
        content={
          <div>
            <p>This dialog demonstrates interactive overlay content.</p>
            <p>Features:</p>
            <ul style={{ marginLeft: 20 }}>
              <li>Click outside to dismiss</li>
              <li>Smooth animations</li>
              <li>Performance optimized</li>
              <li>Cached rendering</li>
            </ul>
          </div>
        }
        actions={
          <>
            <button
              onClick={() => overlay.hide(dialogId)}
              style={{
                padding: "8px 16px",
                background: "#e5e7eb",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              onClick={async () => {
                await showToast();
                await overlay.hide(dialogId);
              }}
              style={{
                padding: "8px 16px",
                background: "#3b82f6",
                color: "white",
                border: "none",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              Confirm
            </button>
          </>
        }
      />,
      {
        id: dialogId,
        position: { anchor: "center" },
        animate: true,
      },
    );
  };

  // Example 3: Performance test with multiple overlays
  const performanceTest = async () => {
    const startTime = performance.now();
    const overlayIds: string[] = [];

    // Show 10 overlays rapidly
    const overlayPromises = Array.from({ length: 10 }, (_, i) => {
      const id = `perf-test-${i}`;
      overlayIds.push(id);
      return overlay.show(
        <div
          style={{
            padding: 16,
            background: `hsl(${i * 36}, 70%, 50%)`,
            color: "white",
            borderRadius: 8,
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
          }}
        >
          Performance Test Overlay {i + 1}
        </div>,
        {
          id,
          position: {
            x: 100 + (i % 5) * 150,
            y: 100 + Math.floor(i / 5) * 100,
            anchor: "top-left",
          },
          animate: true,
          animationDuration: 300,
        },
      );
    });

    await Promise.all(overlayPromises);

    const endTime = performance.now();
    console.log(`Rendered 10 overlays in ${endTime - startTime}ms`);

    // Get performance stats
    const stats = overlay.getPerformanceStats();
    setPerformanceStats(stats);

    // Clean up after 3 seconds with tracked timeout
    createTimeout(() => {
      overlayIds.forEach(id => overlay.hide(id));
    }, 3000);
  };

  // Example 4: Animated overlays
  const showAnimatedOverlays = () => {
    const animations: Array<"fade" | "slide" | "scale" | "bounce"> = [
      "fade",
      "slide",
      "scale",
      "bounce",
    ];

    animations.forEach((animation, index) => {
      createTimeout(async () => {
        await animatedOverlay.showAnimated(
          <div
            style={{
              padding: "16px 24px",
              background: "#4f46e5",
              color: "white",
              borderRadius: 8,
              boxShadow: "0 8px 24px rgba(79, 70, 229, 0.3)",
              fontWeight: 500,
            }}
          >
            {animation.charAt(0).toUpperCase() + animation.slice(1)} Animation
          </div>,
          animation,
          {
            position: {
              anchor: index % 2 === 0 ? "top-left" : "bottom-left",
            },
          },
        );
      }, index * 500);
    });
  };

  // Example 5: Anchored overlay (tooltip-like)
  const showAnchoredOverlay = async (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();

    await overlay.show(
      <div
        style={{
          padding: "8px 12px",
          background: "#1f2937",
          color: "white",
          borderRadius: 6,
          fontSize: 14,
          whiteSpace: "nowrap",
          boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
        }}
      >
        This overlay is anchored to the button
      </div>,
      {
        position: {
          x: rect.left,
          y: rect.bottom + 8,
          anchor: "top-left",
        },
        animate: true,
        animationDuration: 150,
      },
    );
  };

  return (
    <div style={{ padding: 20 }}>
      <h2>Overlay System Demo</h2>

      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}
      >
        <button onClick={showToast} className="demo-button">
          Show Toast
        </button>

        <button onClick={showDialog} className="demo-button">
          Show Dialog
        </button>

        <button onClick={performanceTest} className="demo-button">
          Performance Test
        </button>

        <button onClick={showAnimatedOverlays} className="demo-button">
          Animated Overlays
        </button>

        <button onClick={showAnchoredOverlay} className="demo-button">
          Anchored Overlay
        </button>

        <button onClick={() => overlay.clearCache()} className="demo-button">
          Clear Cache
        </button>

        <button onClick={() => overlay.hide()} className="demo-button">
          Hide All
        </button>
      </div>

      {performanceStats && (
        <div
          style={{
            marginTop: 20,
            padding: 16,
            background: "#f3f4f6",
            borderRadius: 8,
            fontFamily: "monospace",
            fontSize: 14,
          }}
        >
          <h3>Performance Stats:</h3>
          <div>Render Count: {performanceStats.renderCount}</div>
          <div>
            Average Render Time: {performanceStats.averageRenderTime.toFixed(2)}
            ms
          </div>
          <div>
            Cache Hit Rate: {(performanceStats.cacheHitRate * 100).toFixed(1)}%
          </div>
          <div>Slow Renders (&gt;16ms): {performanceStats.slowRenders}</div>
        </div>
      )}

      <div
        style={{
          marginTop: 20,
          padding: 16,
          background: "#e5e7eb",
          borderRadius: 8,
        }}
      >
        <p>Current overlay count: {overlay.overlayCount}</p>
        <p>Overlay visible: {overlay.isVisible ? "Yes" : "No"}</p>
      </div>

      <style>{`
        .demo-button {
          padding: 8px 16px;
          background: #3b82f6;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
          transition: background 0.2s;
        }
        
        .demo-button:hover {
          background: #2563eb;
        }
        
        .demo-button:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}

// Wrap the demo in OverlayProvider
export function OverlayDemoWithProvider() {
  return (
    <OverlayProvider>
      <OverlayDemo />
    </OverlayProvider>
  );
}
