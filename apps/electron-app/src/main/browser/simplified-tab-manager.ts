import type { TabState } from "@vibe/shared-types";
import { TAB_CONFIG, createLogger } from "@vibe/shared-types";
import type { CDPManager } from "../services/cdp-service";

// Import the new modular components
import { TabEventBus } from "./tab-event-bus";
import { TabStateManager } from "./tab-state-manager";
import { TabLifecycleManager } from "./tab-lifecycle-manager";
import { TabViewCoordinator } from "./tab-view-coordinator";

const logger = createLogger("SimplifiedTabManager");

/**
 * Simplified TabManager - Orchestrates focused sub-modules
 * 
 * Reduced from 1,036 lines to ~150 lines by extracting responsibilities:
 * - TabLifecycleManager: creation, destruction, activation
 * - TabStateManager: state updates, persistence, getters  
 * - TabViewCoordinator: view attachment, bounds, navigation
 * - TabEventBus: centralized event management
 * 
 * This class now serves as a thin coordination layer.
 */
export class SimplifiedTabManager {
  private eventBus: TabEventBus;
  private stateManager: TabStateManager;
  private lifecycleManager: TabLifecycleManager;
  private viewCoordinator: TabViewCoordinator;
  private maintenanceInterval: NodeJS.Timeout | null = null;

  constructor(
    private browser: any,
    private viewManager: any,
    private cdpManager?: CDPManager
  ) {
    // Initialize event bus first
    this.eventBus = new TabEventBus();
    
    // Initialize state manager
    this.stateManager = new TabStateManager(this.eventBus);
    
    // Initialize lifecycle manager
    this.lifecycleManager = new TabLifecycleManager(
      this.stateManager.getState(),
      this.eventBus,
      this.browser
    );
    
    // Initialize view coordinator
    this.viewCoordinator = new TabViewCoordinator(
      this.stateManager.getState(),
      this.eventBus,
      this.viewManager,
      this.cdpManager,
      this.browser
    );

    this.setupEventHandlers();
    this.startPeriodicMaintenance();
  }

  /**
   * Setup event handlers to coordinate between modules
   */
  private setupEventHandlers(): void {
    // Lifecycle events → View coordination
    this.eventBus.on("tab-lifecycle:created", ({ key, url }) => {
      this.viewCoordinator.createBrowserView(key, url);
    });

    this.eventBus.on("tab-lifecycle:destroying", ({ key }) => {
      this.viewCoordinator.removeBrowserView(key);
    });

    this.eventBus.on("tab-lifecycle:switched", ({ from, to }) => {
      if (from) {
        this.viewCoordinator.setViewVisible(from, false);
      }
      if (to) {
        this.viewCoordinator.setViewVisible(to, true);
      }
    });

    this.eventBus.on("tab-lifecycle:wake-requested", ({ key }) => {
      this.stateManager.wakeUpTab(key);
    });

    this.eventBus.on("tab-lifecycle:agent-created", ({ key }) => {
      // Apply agent styling once the view is created
      setTimeout(() => {
        this.viewCoordinator.applyAgentTabBorder(key);
      }, 100);
    });

    // Navigation events → State updates
    this.eventBus.on("tab-navigation:complete", ({ key }) => {
      const view = this.viewCoordinator.getBrowserView(key);
      if (view) {
        this.stateManager.updateTabState(key, view.webContents);
      }
    });

    // State events → View updates  
    this.eventBus.on("tab-state:agent-status", ({ key, isActive }) => {
      if (isActive) {
        this.viewCoordinator.applyAgentTabBorder(key);
      } else {
        this.viewCoordinator.removeAgentTabBorder(key);
      }
    });

    this.eventBus.on("tab-state:wake", ({ key, originalUrl }) => {
      const view = this.viewCoordinator.getBrowserView(key);
      if (view) {
        view.webContents.loadURL(originalUrl);
      }
    });
  }

  // === Public API (maintains compatibility with original TabManager) ===

  /**
   * Tab Lifecycle Operations (delegated to TabLifecycleManager)
   */
  public createTab(url?: string): string {
    return this.lifecycleManager.createTab(url);
  }

  public closeTab(tabKey: string): boolean {
    return this.lifecycleManager.closeTab(tabKey);
  }

  public setActiveTab(tabKey: string): boolean {
    return this.lifecycleManager.setActiveTab(tabKey);
  }

  public switchToTab(tabKey: string): boolean {
    return this.setActiveTab(tabKey);
  }

  public createAgentTab(urlToLoad: string): string {
    return this.lifecycleManager.createAgentTab(urlToLoad);
  }

  /**
   * State Management Operations (delegated to TabStateManager)
   */
  public updateTabState(tabKey: string): boolean {
    const view = this.viewCoordinator.getBrowserView(tabKey);
    if (view) {
      return this.stateManager.updateTabState(tabKey, view.webContents);
    }
    return false;
  }

  public getAllTabs(): TabState[] {
    return this.stateManager.getAllTabs();
  }

  public getTabs(): TabState[] {
    return this.getAllTabs();
  }

  public getTabsByPosition(): TabState[] {
    return this.stateManager.getTabsByPosition();
  }

  public reorderTabs(orderedKeys: string[]): boolean {
    return this.stateManager.reorderTabs(orderedKeys);
  }

  public moveTab(tabKey: string, newPosition: number): boolean {
    const tab = this.stateManager.getTab(tabKey);
    if (!tab) return false;
    tab.position = newPosition;
    this.eventBus.emit("tab-state:reordered", { tabs: this.getAllTabs() });
    return true;
  }

  public getActiveTabKey(): string | null {
    return this.stateManager.getActiveTabKey();
  }

  public getActiveTab(): TabState | null {
    return this.stateManager.getActiveTab();
  }

  public getTabCount(): number {
    return this.stateManager.getTabCount();
  }

  public getTab(tabKey: string): TabState | null {
    return this.stateManager.getTab(tabKey);
  }

  public putTabToSleep(tabKey: string): boolean {
    return this.stateManager.putTabToSleep(tabKey);
  }

  public wakeUpTab(tabKey: string): boolean {
    return this.stateManager.wakeUpTab(tabKey);
  }

  public updateAgentStatus(tabKey: string, isActive: boolean): boolean {
    return this.stateManager.updateAgentStatus(tabKey, isActive);
  }

  public getInactiveTabs(maxCount?: number): string[] {
    return this.stateManager.getInactiveTabs(maxCount);
  }

  public clearSavedUrlsCache(): void {
    this.stateManager.clearSavedUrlsCache();
  }

  public getSaveStatus(): { active: number; queued: number; maxConcurrent: number } {
    return this.stateManager.getSaveStatus();
  }

  /**
   * View Coordination Operations (delegated to TabViewCoordinator)
   */
  public async loadUrl(tabKey: string, url: string): Promise<boolean> {
    return this.viewCoordinator.loadUrl(tabKey, url);
  }

  public goBack(tabKey: string): boolean {
    return this.viewCoordinator.goBack(tabKey);
  }

  public goForward(tabKey: string): boolean {
    return this.viewCoordinator.goForward(tabKey);
  }

  public refresh(tabKey: string): boolean {
    return this.viewCoordinator.refresh(tabKey);
  }

  /**
   * Event System Operations (delegated to TabEventBus)
   */
  public on(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.on(event as any, listener);
  }

  public off(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.off(event as any, listener);
  }

  public once(event: string, listener: (...args: any[]) => void): void {
    this.eventBus.once(event as any, listener);
  }

  public emit(event: string, data: any): boolean {
    return this.eventBus.emit(event as any, data);
  }

  /**
   * Maintenance and cleanup
   */
  private startPeriodicMaintenance(): void {
    this.maintenanceInterval = setInterval(() => {
      this.performTabMaintenance();
    }, TAB_CONFIG.CLEANUP_INTERVAL_MS);
  }

  private performTabMaintenance(): void {
    const maintenanceCounter = this.stateManager.incrementMaintenanceCounter();
    const now = Date.now();
    const state = this.stateManager.getState();
    
    const totalTabs = state.tabs.size;
    const sleepingTabs = Array.from(state.tabs.values()).filter(
      tab => tab.asleep
    ).length;

    // Log periodically to avoid spam
    if (maintenanceCounter % TAB_CONFIG.MAINTENANCE_LOG_INTERVAL === 0) {
      if (process.env.LOG_LEVEL === "debug") {
        logger.info(
          `Tab maintenance: ${totalTabs} total, ${sleepingTabs} sleeping`
        );
      }
    }

    for (const [tabKey, tab] of state.tabs) {
      const timeSinceActive = now - (tab.lastActiveAt || tab.createdAt || now);

      // Update state for active/visible tabs
      if (state.activeTab === tabKey || tab.visible) {
        this.updateTabState(tabKey);
      }

      // Skip sleep management for active/agent tabs
      if (state.activeTab === tabKey || tab.isAgentActive) continue;

      // Sleep inactive tabs
      if (!tab.asleep && timeSinceActive > TAB_CONFIG.SLEEP_THRESHOLD_MS) {
        this.stateManager.putTabToSleep(tabKey);
      }
      // Archive old tabs
      else if (
        tab.asleep &&
        timeSinceActive > TAB_CONFIG.ARCHIVE_THRESHOLD_MS
      ) {
        this.closeTab(tabKey);
      }
    }
  }

  /**
   * Cleanup and destroy
   */
  public destroy(): void {
    if (this.maintenanceInterval) {
      clearInterval(this.maintenanceInterval);
      this.maintenanceInterval = null;
    }

    // Destroy sub-modules
    this.viewCoordinator.destroy();
    this.stateManager.destroy();
    this.eventBus.destroy();

    logger.info("SimplifiedTabManager destroyed");
  }
}