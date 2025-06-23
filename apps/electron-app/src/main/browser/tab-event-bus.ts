import { EventEmitter } from "events";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("TabEventBus");

/**
 * Event types for the tab system
 */
export interface TabEvent {
  // Lifecycle events
  "tab-lifecycle:created": { key: string; url: string };
  "tab-lifecycle:destroying": { key: string };
  "tab-lifecycle:closed": { key: string };
  "tab-lifecycle:switched": { from: string | null; to: string };
  "tab-lifecycle:reordered": { tabs: any[] };
  "tab-lifecycle:wake-requested": { key: string };
  "tab-lifecycle:agent-created": { key: string; url: string };

  // State events
  "tab-state:updated": { tab: any; changes: string[] };
  "tab-state:reordered": { tabs: any[] };
  "tab-state:sleep": { key: string; sleepData: any };
  "tab-state:wake": { key: string; originalUrl: string };
  "tab-state:agent-status": { key: string; isActive: boolean };

  // View events
  "tab-view:created": { key: string; view: any };
  "tab-view:destroyed": { key: string };
  "tab-view:visibility-changed": { key: string; isVisible: boolean };
  "tab-view:bounds-updated": { key: string; bounds: any };

  // Navigation events
  "tab-navigation:start": { key: string; url: string };
  "tab-navigation:complete": { key: string; url: string };
  "tab-navigation:failed": { key: string; url: string; error: any };

  // Memory management events
  "tab-memory:save-requested": { key: string; url: string };
  "tab-memory:save-complete": { key: string; url: string };
  "tab-memory:save-failed": { key: string; url: string; error: any };

  // Legacy compatibility events (mapped to new system)
  "tab-created": string;
  "tab-closed": string;
  "tab-switched": { from: string | null; to: string };
  "tab-updated": any;
  "tabs-reordered": any[];
}

/**
 * Centralized event bus for tab-related events
 * Replaces scattered event handling throughout TabManager
 */
export class TabEventBus extends EventEmitter {
  private eventHistory: Array<{ event: string; data: any; timestamp: number }> = [];
  private maxHistorySize = 100;

  constructor() {
    super();
    this.setMaxListeners(50); // Allow more listeners for complex tab operations
  }

  /**
   * Emit an event with automatic logging and history tracking
   */
  public emit<K extends keyof TabEvent>(
    event: K,
    data: TabEvent[K]
  ): boolean {
    // Log debug information
    logger.debug(`Event: ${event}`, data);

    // Add to history
    this.addToHistory(event, data);

    // Emit the event
    const result = super.emit(event, data);

    // Handle legacy event mapping for backward compatibility
    this.handleLegacyMapping(event, data);

    return result;
  }

  /**
   * Type-safe event listener registration
   */
  public on<K extends keyof TabEvent>(
    event: K,
    listener: (data: TabEvent[K]) => void
  ): this {
    return super.on(event, listener);
  }

  /**
   * Type-safe one-time event listener registration
   */
  public once<K extends keyof TabEvent>(
    event: K,
    listener: (data: TabEvent[K]) => void
  ): this {
    return super.once(event, listener);
  }

  /**
   * Type-safe event listener removal
   */
  public off<K extends keyof TabEvent>(
    event: K,
    listener: (data: TabEvent[K]) => void
  ): this {
    return super.off(event, listener);
  }

  /**
   * Get event history for debugging
   */
  public getEventHistory(): Array<{ event: string; data: any; timestamp: number }> {
    return [...this.eventHistory];
  }

  /**
   * Clear event history
   */
  public clearHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Get event statistics
   */
  public getEventStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    
    this.eventHistory.forEach(entry => {
      stats[entry.event] = (stats[entry.event] || 0) + 1;
    });

    return stats;
  }

  /**
   * Wait for a specific event to occur
   */
  public waitFor<K extends keyof TabEvent>(
    event: K,
    timeout: number = 5000
  ): Promise<TabEvent[K]> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.off(event, listener);
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      const listener = (data: TabEvent[K]) => {
        clearTimeout(timer);
        resolve(data);
      };

      this.once(event, listener);
    });
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    this.removeAllListeners();
    this.clearHistory();
  }

  // Private helper methods

  private addToHistory(event: string, data: any): void {
    this.eventHistory.push({
      event,
      data,
      timestamp: Date.now(),
    });

    // Trim history if it gets too large
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  private handleLegacyMapping(event: string, data: any): void {
    // Map new events to legacy events for backward compatibility
    switch (event) {
      case "tab-lifecycle:created":
        super.emit("tab-created", data.key);
        break;
      
      case "tab-lifecycle:closed":
        super.emit("tab-closed", data.key);
        break;
      
      case "tab-lifecycle:switched":
        super.emit("tab-switched", { from: data.from, to: data.to });
        break;
      
      case "tab-state:updated":
        super.emit("tab-updated", data.tab);
        break;
      
      case "tab-state:reordered":
      case "tab-lifecycle:reordered":
        super.emit("tabs-reordered", data.tabs);
        break;
    }
  }
}