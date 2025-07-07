/**
 * Overlay Performance Monitoring
 * Tracks rendering performance and provides optimization insights
 */

import { createLogger } from "@vibe/shared-types";

const logger = createLogger("OverlayPerformance");

export interface OverlayPerformanceMetrics {
  renderCount: number;
  averageRenderTime: number;
  slowRenders: number;
  cacheHitRate: number;
  memoryUsage: number;
  domUpdates: number;
  eventHandlers: number;
  renderTimes: number[];
  timestamp: number;
}

export class OverlayPerformanceMonitor {
  private renderTimes: number[] = [];
  private cacheHits = 0;
  private cacheMisses = 0;
  private domUpdates = 0;
  private eventHandlers = 0;
  private startTime = performance.now();
  private graphData: {
    timestamp: number;
    renderTime: number;
    memory: number;
  }[] = [];
  private maxGraphPoints = 100;

  /**
   * Record a render operation
   */
  recordRender(duration: number): void {
    this.renderTimes.push(duration);

    // Keep only last 100 measurements
    if (this.renderTimes.length > 100) {
      this.renderTimes = this.renderTimes.slice(-100);
    }

    // Add to graph data
    this.graphData.push({
      timestamp: Date.now(),
      renderTime: duration,
      memory: this.getMemoryUsage(),
    });

    // Keep only last maxGraphPoints
    if (this.graphData.length > this.maxGraphPoints) {
      this.graphData = this.graphData.slice(-this.maxGraphPoints);
    }
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(): void {
    this.cacheHits++;
  }

  recordCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Record DOM update
   */
  recordDOMUpdate(): void {
    this.domUpdates++;
  }

  /**
   * Record event handler creation
   */
  recordEventHandler(): void {
    this.eventHandlers++;
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): OverlayPerformanceMetrics {
    const totalRenders = this.renderTimes.length;
    const averageRenderTime =
      totalRenders > 0
        ? this.renderTimes.reduce((sum, time) => sum + time, 0) / totalRenders
        : 0;

    const slowRenders = this.renderTimes.filter(time => time > 16).length;
    const totalCache = this.cacheHits + this.cacheMisses;
    const cacheHitRate = totalCache > 0 ? this.cacheHits / totalCache : 0;

    return {
      renderCount: totalRenders,
      averageRenderTime,
      slowRenders,
      cacheHitRate,
      memoryUsage: this.getMemoryUsage(),
      domUpdates: this.domUpdates,
      eventHandlers: this.eventHandlers,
      renderTimes: [...this.renderTimes],
      timestamp: Date.now(),
    };
  }

  /**
   * Get graph data for visualization
   */
  getGraphData() {
    return this.graphData;
  }

  /**
   * Get memory usage estimate
   */
  private getMemoryUsage(): number {
    if ("memory" in performance) {
      return (performance as any).memory.usedJSHeapSize / 1024 / 1024; // MB
    }
    return 0;
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const metrics = this.getMetrics();
    const uptime = (performance.now() - this.startTime) / 1000;

    return `
Overlay Performance Report (${uptime.toFixed(1)}s uptime)
==================================================
Renders: ${metrics.renderCount} (avg: ${metrics.averageRenderTime.toFixed(2)}ms)
Slow renders (>16ms): ${metrics.slowRenders} (${((metrics.slowRenders / metrics.renderCount) * 100).toFixed(1)}%)
Cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(1)}%
DOM updates: ${metrics.domUpdates}
Event handlers: ${metrics.eventHandlers}
Memory usage: ${metrics.memoryUsage.toFixed(2)}MB

Performance Grade: ${this.getPerformanceGrade(metrics)}
Recommendations: ${this.getRecommendations(metrics)}
    `.trim();
  }

  /**
   * Generate SVG graph for performance visualization
   */
  generateSVGGraph(width: number = 200, height: number = 60): string {
    if (this.graphData.length < 2) {
      return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="rgba(255, 20, 147, 0.1)"/>
        <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#ff1493" font-size="10">No Data</text>
      </svg>`;
    }

    const padding = 4;
    const graphWidth = width - padding * 2;
    const graphHeight = height - padding * 2;

    // Calculate scales
    const maxRenderTime = Math.max(
      ...this.graphData.map(d => d.renderTime),
      16,
    );
    const minRenderTime = Math.min(...this.graphData.map(d => d.renderTime), 0);
    const timeRange = maxRenderTime - minRenderTime;

    // Generate path
    const points = this.graphData.map((data, index) => {
      const x = padding + (index / (this.graphData.length - 1)) * graphWidth;
      const normalizedTime = (data.renderTime - minRenderTime) / timeRange;
      const y = padding + graphHeight - normalizedTime * graphHeight;
      return `${x},${y}`;
    });

    const pathData = `M ${points.join(" L ")}`;

    // Generate performance indicator
    const avgRenderTime = this.getMetrics().averageRenderTime;
    const performanceColor =
      avgRenderTime < 8
        ? "#00ff00"
        : avgRenderTime < 16
          ? "#ffff00"
          : avgRenderTime < 25
            ? "#ff8800"
            : "#ff1493";

    return `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="graphGradient" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" style="stop-color:#ff1493;stop-opacity:0.8" />
          <stop offset="100%" style="stop-color:#ff1493;stop-opacity:0.2" />
        </linearGradient>
      </defs>
      
      <!-- Background -->
      <rect width="${width}" height="${height}" fill="rgba(255, 20, 147, 0.05)" rx="4"/>
      
      <!-- Grid lines -->
      <line x1="${padding}" y1="${padding + graphHeight * 0.5}" x2="${width - padding}" y2="${padding + graphHeight * 0.5}" 
            stroke="rgba(255, 20, 147, 0.2)" stroke-width="1"/>
      <line x1="${padding}" y1="${padding + graphHeight * 0.25}" x2="${width - padding}" y2="${padding + graphHeight * 0.25}" 
            stroke="rgba(255, 20, 147, 0.1)" stroke-width="1"/>
      
      <!-- Performance threshold line (16ms) -->
      ${
        maxRenderTime > 16
          ? `
        <line x1="${padding}" y1="${padding + graphHeight * (1 - (16 - minRenderTime) / timeRange)}" 
              x2="${width - padding}" y2="${padding + graphHeight * (1 - (16 - minRenderTime) / timeRange)}" 
              stroke="#ff4444" stroke-width="1" stroke-dasharray="2,2"/>
      `
          : ""
      }
      
      <!-- Graph line -->
      <path d="${pathData}" stroke="#ff1493" stroke-width="2" fill="none"/>
      
      <!-- Graph area fill -->
      <path d="${pathData} L ${width - padding},${height - padding} L ${padding},${height - padding} Z" 
            fill="url(#graphGradient)"/>
      
      <!-- Performance indicator dot -->
      <circle cx="${width - padding - 8}" cy="${padding + 8}" r="4" fill="${performanceColor}" stroke="#ff1493" stroke-width="1"/>
      
      <!-- Average render time text -->
      <text x="${width - padding}" y="${height - padding - 2}" text-anchor="end" fill="#ff1493" font-size="8" font-family="monospace">
        ${avgRenderTime.toFixed(1)}ms
      </text>
    </svg>`;
  }

  /**
   * Get performance grade
   */
  private getPerformanceGrade(metrics: OverlayPerformanceMetrics): string {
    if (metrics.averageRenderTime < 8 && metrics.cacheHitRate > 0.8)
      return "A+";
    if (metrics.averageRenderTime < 12 && metrics.cacheHitRate > 0.6)
      return "A";
    if (metrics.averageRenderTime < 16 && metrics.cacheHitRate > 0.4)
      return "B";
    if (metrics.averageRenderTime < 20) return "C";
    return "D";
  }

  /**
   * Get optimization recommendations
   */
  private getRecommendations(metrics: OverlayPerformanceMetrics): string {
    const recommendations: string[] = [];

    if (metrics.averageRenderTime > 16) {
      recommendations.push(
        "Consider reducing CSS complexity or using CSS transforms",
      );
    }

    if (metrics.cacheHitRate < 0.5) {
      recommendations.push("Increase content caching for better performance");
    }

    if (metrics.slowRenders > metrics.renderCount * 0.1) {
      recommendations.push("Optimize render pipeline to reduce slow renders");
    }

    if (metrics.eventHandlers > 50) {
      recommendations.push("Use event delegation to reduce handler count");
    }

    if (metrics.memoryUsage > 50) {
      recommendations.push("Implement memory cleanup and object pooling");
    }

    return recommendations.length > 0
      ? recommendations.join("; ")
      : "Performance is optimal";
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.renderTimes = [];
    this.cacheHits = 0;
    this.cacheMisses = 0;
    this.domUpdates = 0;
    this.eventHandlers = 0;
    this.startTime = performance.now();
    this.graphData = [];
  }
}

// Global performance monitor instance
export const overlayPerformanceMonitor = new OverlayPerformanceMonitor();

// Performance decorator for measuring function execution time
export function measurePerformance<T extends (...args: any[]) => any>(
  target: T,
  context: string,
): T {
  return ((...args: Parameters<T>): ReturnType<T> => {
    const start = performance.now();
    const result = target(...args);
    const duration = performance.now() - start;

    overlayPerformanceMonitor.recordRender(duration);

    if (duration > 16) {
      logger.warn(
        `[Performance] Slow ${context} operation: ${duration.toFixed(2)}ms`,
      );
    }

    return result;
  }) as T;
}
