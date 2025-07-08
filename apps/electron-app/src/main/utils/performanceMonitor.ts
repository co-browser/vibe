/**
 * Performance monitoring utility for main process operations
 */

interface MainProcessMetrics {
  viewBoundsUpdates: number;
  chatResizeUpdates: number;
  lastUpdateTime: number;
  averageUpdateTime: number;
  maxUpdateTime: number;
}

class MainProcessPerformanceMonitor {
  private metrics: MainProcessMetrics = {
    viewBoundsUpdates: 0,
    chatResizeUpdates: 0,
    lastUpdateTime: 0,
    averageUpdateTime: 0,
    maxUpdateTime: 0,
  };

  private updateStartTime: number | null = null;

  startBoundsUpdate(): void {
    this.updateStartTime = Date.now();
  }

  endBoundsUpdate(isChatResize: boolean = false): void {
    if (this.updateStartTime) {
      const duration = Date.now() - this.updateStartTime;
      
      if (isChatResize) {
        this.metrics.chatResizeUpdates++;
      } else {
        this.metrics.viewBoundsUpdates++;
      }
      
      this.metrics.lastUpdateTime = duration;
      this.metrics.maxUpdateTime = Math.max(this.metrics.maxUpdateTime, duration);
      
      // Calculate running average
      const totalUpdates = this.metrics.viewBoundsUpdates + this.metrics.chatResizeUpdates;
      this.metrics.averageUpdateTime = 
        (this.metrics.averageUpdateTime * (totalUpdates - 1) + duration) / totalUpdates;
      
      this.updateStartTime = null;
      
      // Log if update is slow
      if (duration > 16.67) { // More than 1 frame at 60fps
        console.warn(`[Main Process Perf] Slow bounds update: ${duration.toFixed(2)}ms`);
      }
    }
  }

  getMetrics(): MainProcessMetrics {
    return { ...this.metrics };
  }

  logSummary(): void {
    const metrics = this.getMetrics();
    console.log('[Main Process Perf] ViewManager Performance Summary:');
    console.log(`  - Total bounds updates: ${metrics.viewBoundsUpdates}`);
    console.log(`  - Chat resize updates: ${metrics.chatResizeUpdates}`);
    console.log(`  - Average update time: ${metrics.averageUpdateTime.toFixed(2)}ms`);
    console.log(`  - Max update time: ${metrics.maxUpdateTime.toFixed(2)}ms`);
    const efficiency = (metrics.chatResizeUpdates / Math.max(1, metrics.viewBoundsUpdates + metrics.chatResizeUpdates) * 100).toFixed(1);
    console.log(`  - Chat resize optimization rate: ${efficiency}%`);
  }
}

// Export singleton instance
export const mainProcessPerformanceMonitor = new MainProcessPerformanceMonitor();