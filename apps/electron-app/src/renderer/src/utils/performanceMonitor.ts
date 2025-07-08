/**
 * Performance monitoring utility for tracking resize operations
 */

interface PerformanceMetrics {
  resizeCount: number;
  ipcCallCount: number;
  lastResizeTime: number;
  averageResizeTime: number;
  maxResizeTime: number;
  droppedFrames: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    resizeCount: 0,
    ipcCallCount: 0,
    lastResizeTime: 0,
    averageResizeTime: 0,
    maxResizeTime: 0,
    droppedFrames: 0,
  };

  private resizeStartTime: number | null = null;
  private frameTimes: number[] = [];
  private rafId: number | null = null;

  startResize(): void {
    this.resizeStartTime = performance.now();
    this.startFrameMonitoring();
  }

  endResize(): void {
    if (this.resizeStartTime) {
      const duration = performance.now() - this.resizeStartTime;
      this.metrics.resizeCount++;
      this.metrics.lastResizeTime = duration;
      this.metrics.maxResizeTime = Math.max(this.metrics.maxResizeTime, duration);
      
      // Calculate running average
      this.metrics.averageResizeTime = 
        (this.metrics.averageResizeTime * (this.metrics.resizeCount - 1) + duration) / 
        this.metrics.resizeCount;
      
      this.resizeStartTime = null;
      this.stopFrameMonitoring();
      
      // Log performance if it's poor
      if (duration > 100) {
        console.warn(`[Perf] Slow resize detected: ${duration.toFixed(2)}ms`);
      }
    }
  }

  trackIPCCall(): void {
    this.metrics.ipcCallCount++;
  }

  private startFrameMonitoring(): void {
    let lastFrameTime = performance.now();
    
    const measureFrame = () => {
      const now = performance.now();
      const frameDuration = now - lastFrameTime;
      
      // Track dropped frames (> 16.67ms for 60fps)
      if (frameDuration > 16.67) {
        this.metrics.droppedFrames++;
      }
      
      this.frameTimes.push(frameDuration);
      lastFrameTime = now;
      
      if (this.resizeStartTime) {
        this.rafId = requestAnimationFrame(measureFrame);
      }
    };
    
    this.rafId = requestAnimationFrame(measureFrame);
  }

  private stopFrameMonitoring(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.frameTimes = [];
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.metrics = {
      resizeCount: 0,
      ipcCallCount: 0,
      lastResizeTime: 0,
      averageResizeTime: 0,
      maxResizeTime: 0,
      droppedFrames: 0,
    };
    this.frameTimes = [];
  }

  logSummary(): void {
    const metrics = this.getMetrics();
    console.log('[Perf] Chat Panel Resize Performance Summary:');
    console.log(`  - Total resizes: ${metrics.resizeCount}`);
    console.log(`  - IPC calls: ${metrics.ipcCallCount}`);
    console.log(`  - Average resize time: ${metrics.averageResizeTime.toFixed(2)}ms`);
    console.log(`  - Max resize time: ${metrics.maxResizeTime.toFixed(2)}ms`);
    console.log(`  - Dropped frames: ${metrics.droppedFrames}`);
    console.log(`  - IPC efficiency: ${(metrics.ipcCallCount / Math.max(1, metrics.resizeCount)).toFixed(2)} calls per resize`);
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Add performance logging on page unload
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    performanceMonitor.logSummary();
  });
}