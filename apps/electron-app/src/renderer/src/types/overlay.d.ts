/**
 * Overlay API TypeScript Definitions
 * Enhanced with performance optimizations and advanced features
 */

export interface OverlayContent {
  html: string;
  css?: string;
  script?: string;
  visible?: boolean;
}

export interface OverlayState {
  isVisible: boolean;
  hasContent: boolean;
  cacheSize: number;
}

export interface OverlayAPI {
  // Core methods
  show: () => Promise<boolean>;
  hide: () => Promise<boolean>;
  render: (content: OverlayContent) => Promise<boolean>;
  clear: () => Promise<boolean>;
  update: (updates: Partial<OverlayContent>) => Promise<boolean>;
  execute: (script: string) => Promise<any>;

  // Enhanced methods
  getState: () => Promise<OverlayState>;
}

// Overlay command types for batching
export type OverlayCommandType =
  | "show"
  | "hide"
  | "render"
  | "update"
  | "clear"
  | "execute";

export interface OverlayCommand {
  type: OverlayCommandType;
  data?: any;
  id?: string;
}

// Options for overlay manager
export interface OverlayManagerOptions {
  enableCache?: boolean;
  maxCacheSize?: number;
  batchDelay?: number;
}

// Performance tracking
export interface OverlayPerformanceEntry {
  operation: string;
  duration: number;
  timestamp: number;
}

export interface OverlayPerformanceStats {
  renderCount: number;
  averageRenderTime: number;
  slowRenders: number;
  cacheHitRate?: number;
}
