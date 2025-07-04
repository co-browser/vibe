/**
 * Performance Graph Component
 * Displays real-time overlay performance metrics in a bright pink graph
 */

import { useState, useEffect, useRef } from "react";
import { overlayPerformanceMonitor } from "../../utils/overlayPerformance";

interface PerformanceGraphProps {
  width?: number;
  height?: number;
  showDetails?: boolean;
  className?: string;
}

export function PerformanceGraph({
  width = 200,
  height = 60,
  showDetails = false,
  className = "",
}: PerformanceGraphProps) {
  const [svgContent, setSvgContent] = useState<string>("");
  const [metrics, setMetrics] = useState<any>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateGraph = () => {
      const newSvgContent = overlayPerformanceMonitor.generateSVGGraph(
        width,
        height,
      );
      const newMetrics = overlayPerformanceMonitor.getMetrics();

      setSvgContent(newSvgContent);
      setMetrics(newMetrics);
    };

    // Initial update
    updateGraph();

    // Set up interval for real-time updates
    updateIntervalRef.current = setInterval(updateGraph, 1000); // Update every second

    return () => {
      if (updateIntervalRef.current) {
        clearInterval(updateIntervalRef.current);
      }
    };
  }, [width, height]);

  const getPerformanceColor = (avgTime: number) => {
    if (avgTime < 8) return "#00ff00"; // Green
    if (avgTime < 16) return "#ffff00"; // Yellow
    if (avgTime < 25) return "#ff8800"; // Orange
    return "#ff1493"; // Bright pink
  };

  const getPerformanceGrade = (avgTime: number, cacheHitRate: number) => {
    if (avgTime < 8 && cacheHitRate > 0.8) return "A+";
    if (avgTime < 12 && cacheHitRate > 0.6) return "A";
    if (avgTime < 16 && cacheHitRate > 0.4) return "B";
    if (avgTime < 20) return "C";
    return "D";
  };

  if (!metrics) {
    return (
      <div
        className={`performance-graph ${className}`}
        style={{ width, height }}
      >
        <div
          style={{
            width,
            height,
            backgroundColor: "rgba(255, 20, 147, 0.1)",
            borderRadius: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#ff1493",
            fontSize: "10px",
          }}
        >
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div
      className={`performance-graph ${className}`}
      style={{ position: "relative" }}
    >
      {/* Main Graph */}
      <div
        style={{
          cursor: "pointer",
          position: "relative",
          width,
          height,
        }}
        onClick={() => setIsExpanded(!isExpanded)}
        title="Click to toggle details"
      >
        <div
          dangerouslySetInnerHTML={{ __html: svgContent }}
          style={{
            width,
            height,
            borderRadius: "4px",
            overflow: "hidden",
          }}
        />

        {/* Performance indicator badge */}
        <div
          style={{
            position: "absolute",
            top: "2px",
            left: "2px",
            backgroundColor: getPerformanceColor(metrics.averageRenderTime),
            color: "#000",
            fontSize: "8px",
            fontWeight: "bold",
            padding: "1px 3px",
            borderRadius: "2px",
            border: "1px solid #ff1493",
          }}
        >
          {getPerformanceGrade(metrics.averageRenderTime, metrics.cacheHitRate)}
        </div>
      </div>

      {/* Expanded Details Panel */}
      {isExpanded && showDetails && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: "0",
            right: "0",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            color: "#fff",
            padding: "8px",
            borderRadius: "4px",
            fontSize: "10px",
            fontFamily: "monospace",
            zIndex: 1000,
            minWidth: "250px",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            border: "1px solid #ff1493",
          }}
        >
          <div
            style={{
              marginBottom: "4px",
              color: "#ff1493",
              fontWeight: "bold",
            }}
          >
            Overlay Performance
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "4px",
            }}
          >
            <div>Avg Render:</div>
            <div
              style={{ color: getPerformanceColor(metrics.averageRenderTime) }}
            >
              {metrics.averageRenderTime.toFixed(1)}ms
            </div>

            <div>Slow Renders:</div>
            <div
              style={{ color: metrics.slowRenders > 0 ? "#ff4444" : "#00ff00" }}
            >
              {metrics.slowRenders}
            </div>

            <div>Cache Hit:</div>
            <div
              style={{
                color: metrics.cacheHitRate > 0.8 ? "#00ff00" : "#ff8800",
              }}
            >
              {(metrics.cacheHitRate * 100).toFixed(1)}%
            </div>

            <div>Memory:</div>
            <div
              style={{
                color: metrics.memoryUsage > 50 ? "#ff4444" : "#00ff00",
              }}
            >
              {metrics.memoryUsage.toFixed(1)}MB
            </div>

            <div>DOM Updates:</div>
            <div>{metrics.domUpdates}</div>

            <div>Event Handlers:</div>
            <div
              style={{
                color: metrics.eventHandlers > 50 ? "#ff4444" : "#00ff00",
              }}
            >
              {metrics.eventHandlers}
            </div>
          </div>

          <div
            style={{
              marginTop: "4px",
              paddingTop: "4px",
              borderTop: "1px solid #ff1493",
              fontSize: "9px",
              color: "#ccc",
            }}
          >
            Grade:{" "}
            {getPerformanceGrade(
              metrics.averageRenderTime,
              metrics.cacheHitRate,
            )}{" "}
            | Renders: {metrics.renderCount}
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for tab bar integration
export function CompactPerformanceGraph({
  className = "",
}: {
  className?: string;
}) {
  return (
    <PerformanceGraph
      width={120}
      height={24}
      showDetails={true}
      className={className}
    />
  );
}

// Mini version for very small spaces
export function MiniPerformanceGraph({
  className = "",
}: {
  className?: string;
}) {
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    const updateMetrics = () => {
      setMetrics(overlayPerformanceMonitor.getMetrics());
    };

    updateMetrics();
    const interval = setInterval(updateMetrics, 2000);

    return () => clearInterval(interval);
  }, []);

  if (!metrics) return null;

  const getColor = (avgTime: number) => {
    if (avgTime < 8) return "#00ff00";
    if (avgTime < 16) return "#ffff00";
    if (avgTime < 25) return "#ff8800";
    return "#ff1493";
  };

  return (
    <div
      className={`mini-performance-graph ${className}`}
      style={{
        width: "16px",
        height: "16px",
        backgroundColor: getColor(metrics.averageRenderTime),
        borderRadius: "2px",
        border: "1px solid #ff1493",
        cursor: "pointer",
        position: "relative",
      }}
      title={`Avg: ${metrics.averageRenderTime.toFixed(1)}ms | Grade: ${getPerformanceGrade(metrics.averageRenderTime, metrics.cacheHitRate)}`}
    >
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          fontSize: "8px",
          fontWeight: "bold",
          color: "#000",
        }}
      >
        {getPerformanceGrade(
          metrics.averageRenderTime,
          metrics.cacheHitRate,
        ).charAt(0)}
      </div>
    </div>
  );
}

function getPerformanceGrade(avgTime: number, cacheHitRate: number): string {
  if (avgTime < 8 && cacheHitRate > 0.8) return "A+";
  if (avgTime < 12 && cacheHitRate > 0.6) return "A";
  if (avgTime < 16 && cacheHitRate > 0.4) return "B";
  if (avgTime < 20) return "C";
  return "D";
}
