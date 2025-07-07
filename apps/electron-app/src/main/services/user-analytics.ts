import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { createLogger } from "@vibe/shared-types";
import fs from "fs-extra";
import path from "path";
import crypto from "crypto";

const logger = createLogger("UserAnalytics");

export class UserAnalyticsService {
  private userId: string | null = null;
  private userDataPath: string;
  private installDate: Date | null = null;
  private featureTimers = new Map<string, number>();
  private sessionStartTime: number = Date.now();

  constructor() {
    this.userDataPath = path.join(app.getPath("userData"), "analytics");
    fs.ensureDirSync(this.userDataPath);
  }

  /**
   * Initialize user identification and tracking
   */
  async initialize(): Promise<void> {
    try {
      // Get or create user ID
      this.userId = await this.getOrCreateUserId();

      // Get install date
      this.installDate = await this.getInstallDate();

      // Set user in Sentry
      Sentry.setUser({ id: this.userId });

      // Track user activation
      const isFirstLaunch = await this.isFirstLaunch();

      // Set user context (async)
      await this.identifyUserCohort();

      // Track session start
      await this.updateUsageStats({ sessionStarted: true });

      // Track activation event
      Sentry.addBreadcrumb({
        category: "user.activation",
        message: "App launched",
        level: "info",
        data: {
          firstLaunch: isFirstLaunch,
          version: app.getVersion(),
          daysSinceInstall: this.getDaysSinceInstall(),
          platform: process.platform,
        },
      });

      // Track in Umami too
      this.trackUmamiEvent("app-activated", {
        firstLaunch: isFirstLaunch,
        cohort: this.getUserCohort(),
        version: app.getVersion(),
      });

      logger.info(`User analytics initialized for user: ${this.userId}`);
    } catch (error) {
      logger.error("Failed to initialize user analytics:", error);
    }
  }

  /**
   * Get or create a persistent user ID
   */
  private async getOrCreateUserId(): Promise<string> {
    const userIdPath = path.join(this.userDataPath, "user-id.json");

    try {
      // Check if user ID exists
      if (await fs.pathExists(userIdPath)) {
        const data = await fs.readJson(userIdPath);
        return data.userId;
      }

      // Create new user ID
      const userId = crypto.randomUUID();
      await fs.writeJson(userIdPath, {
        userId,
        createdAt: new Date().toISOString(),
      });

      return userId;
    } catch (error) {
      logger.error("Failed to get/create user ID:", error);
      // Fallback to session ID
      return `session-${crypto.randomBytes(16).toString("hex")}`;
    }
  }

  /**
   * Get the app install date
   */
  private async getInstallDate(): Promise<Date> {
    const installPath = path.join(this.userDataPath, "install-date.json");

    try {
      if (await fs.pathExists(installPath)) {
        const data = await fs.readJson(installPath);
        return new Date(data.installDate);
      }

      // Save install date
      const now = new Date();
      await fs.writeJson(installPath, {
        installDate: now.toISOString(),
      });

      return now;
    } catch (error) {
      logger.error("Failed to get install date:", error);
      return new Date();
    }
  }

  /**
   * Check if this is the first launch
   */
  private async isFirstLaunch(): Promise<boolean> {
    const launchPath = path.join(this.userDataPath, "first-launch.json");

    try {
      if (await fs.pathExists(launchPath)) {
        return false;
      }

      await fs.writeJson(launchPath, {
        firstLaunch: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get days since install
   */
  private getDaysSinceInstall(): number {
    if (!this.installDate) return 0;

    const now = new Date();
    const diffMs = now.getTime() - this.installDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Identify user cohort based on usage patterns and install date
   */
  private async identifyUserCohort(): Promise<void> {
    const daysSinceInstall = this.getDaysSinceInstall();
    const usageStats = await this.getUserUsageStats();

    // Time-based cohort
    let timeCohort = "new";
    if (daysSinceInstall > 30) timeCohort = "active";
    if (daysSinceInstall > 90) timeCohort = "retained";

    // Usage-based cohort
    let usageCohort = "light";
    if (usageStats.totalSessions > 10) usageCohort = "regular";
    if (usageStats.totalSessions > 50) usageCohort = "heavy";
    if (usageStats.averageSessionDuration > 30 * 60 * 1000)
      usageCohort = "power"; // 30+ min sessions

    // Feature usage cohort
    let featureCohort = "basic";
    if (usageStats.chatUsage > 5) featureCohort = "chat_user";
    if (usageStats.speedlaneUsage > 0) featureCohort = "advanced";
    if (usageStats.chatUsage > 20 && usageStats.speedlaneUsage > 3)
      featureCohort = "power_user";

    const combinedCohort = `${timeCohort}_${usageCohort}_${featureCohort}`;

    Sentry.setTag("user.cohort", combinedCohort);
    Sentry.setTag("user.time_cohort", timeCohort);
    Sentry.setTag("user.usage_cohort", usageCohort);
    Sentry.setTag("user.feature_cohort", featureCohort);

    Sentry.setContext("user.profile", {
      installDate: this.installDate?.toISOString(),
      daysSinceInstall,
      cohort: combinedCohort,
      timeCohort,
      usageCohort,
      featureCohort,
      platform: process.platform,
      version: app.getVersion(),
      usageStats,
    });

    // Save cohort data for persistence
    await this.saveCohortData({
      timeCohort,
      usageCohort,
      featureCohort,
      combinedCohort,
      lastUpdated: new Date().toISOString(),
      usageStats,
    });
  }

  /**
   * Get user cohort (simplified version for backward compatibility)
   */
  private getUserCohort(): string {
    const daysSinceInstall = this.getDaysSinceInstall();

    if (daysSinceInstall <= 1) return "new_user";
    if (daysSinceInstall <= 7) return "week_old";
    if (daysSinceInstall <= 30) return "month_old";
    if (daysSinceInstall <= 90) return "active";
    return "retained";
  }

  /**
   * Get comprehensive user usage statistics
   */
  private async getUserUsageStats(): Promise<{
    totalSessions: number;
    averageSessionDuration: number;
    chatUsage: number;
    speedlaneUsage: number;
    tabUsage: number;
    lastActiveDate: string | null;
  }> {
    const statsPath = path.join(this.userDataPath, "usage-stats.json");

    try {
      if (await fs.pathExists(statsPath)) {
        const stats = await fs.readJson(statsPath);
        return {
          totalSessions: stats.totalSessions || 0,
          averageSessionDuration: stats.averageSessionDuration || 0,
          chatUsage: stats.chatUsage || 0,
          speedlaneUsage: stats.speedlaneUsage || 0,
          tabUsage: stats.tabUsage || 0,
          lastActiveDate: stats.lastActiveDate || null,
        };
      }
    } catch (error) {
      logger.error("Failed to read usage stats:", error);
    }

    // Return default stats for new users
    return {
      totalSessions: 0,
      averageSessionDuration: 0,
      chatUsage: 0,
      speedlaneUsage: 0,
      tabUsage: 0,
      lastActiveDate: null,
    };
  }

  /**
   * Update usage statistics
   */
  async updateUsageStats(
    updates: Partial<{
      sessionStarted: boolean;
      sessionEnded: boolean;
      sessionDuration: number;
      chatUsed: boolean;
      speedlaneUsed: boolean;
      tabCreated: boolean;
    }>,
  ): Promise<void> {
    const statsPath = path.join(this.userDataPath, "usage-stats.json");
    const currentStats = await this.getUserUsageStats();

    try {
      let updatedStats = { ...currentStats };

      if (updates.sessionStarted) {
        updatedStats.totalSessions += 1;
      }

      if (updates.sessionDuration) {
        // Update average session duration
        const totalDuration =
          currentStats.averageSessionDuration *
            (currentStats.totalSessions - 1) +
          updates.sessionDuration;
        updatedStats.averageSessionDuration =
          totalDuration / currentStats.totalSessions;
      }

      if (updates.chatUsed) {
        updatedStats.chatUsage += 1;
      }

      if (updates.speedlaneUsed) {
        updatedStats.speedlaneUsage += 1;
      }

      if (updates.tabCreated) {
        updatedStats.tabUsage += 1;
      }

      updatedStats.lastActiveDate = new Date().toISOString();

      await fs.writeJson(statsPath, updatedStats);

      // Update cohort identification periodically
      if (updatedStats.totalSessions % 5 === 0) {
        await this.identifyUserCohort();
      }
    } catch (error) {
      logger.error("Failed to update usage stats:", error);
    }
  }

  /**
   * Save cohort data for persistence
   */
  private async saveCohortData(cohortData: any): Promise<void> {
    const cohortPath = path.join(this.userDataPath, "cohort-data.json");

    try {
      await fs.writeJson(cohortPath, cohortData);
    } catch (error) {
      logger.error("Failed to save cohort data:", error);
    }
  }

  /**
   * Start timing a feature
   */
  startFeatureTimer(feature: string): void {
    this.featureTimers.set(feature, Date.now());

    Sentry.addBreadcrumb({
      category: "feature.started",
      message: `Started using ${feature}`,
      level: "info",
      data: { feature },
    });
  }

  /**
   * End timing a feature and record the duration
   */
  endFeatureTimer(feature: string): void {
    const start = this.featureTimers.get(feature);
    if (!start) return;

    const duration = Date.now() - start;
    this.featureTimers.delete(feature);

    // Send to Sentry as custom metric
    // Note: metrics API is not available in Sentry Electron SDK
    // Sentry.metrics.distribution('feature.usage.duration', duration, {
    //   tags: { feature },
    //   unit: 'millisecond'
    // });

    // Add breadcrumb
    Sentry.addBreadcrumb({
      category: "feature.ended",
      message: `Finished using ${feature}`,
      level: "info",
      data: {
        feature,
        duration_ms: duration,
        duration_readable: this.formatDuration(duration),
      },
    });

    // Track in Umami
    this.trackUmamiEvent("feature-usage", {
      feature,
      duration_ms: duration,
      cohort: this.getUserCohort(),
    });
  }

  /**
   * Track user journey breadcrumbs
   */
  trackNavigation(event: string, data?: any): void {
    Sentry.addBreadcrumb({
      category: "navigation",
      message: event,
      level: "info",
      data: {
        ...data,
        timestamp: Date.now(),
        sessionDuration: Date.now() - this.sessionStartTime,
      },
    });
  }

  /**
   * Track chat engagement
   */
  trackChatEngagement(
    event: "message_sent" | "message_received" | "chat_opened" | "chat_closed",
  ): void {
    // Note: metrics API is not available in Sentry Electron SDK
    // Sentry.metrics.increment(`chat.${event}`);

    this.trackUmamiEvent(`chat-${event.replace("_", "-")}`, {
      cohort: this.getUserCohort(),
    });
  }

  /**
   * Track session end
   */
  trackSessionEnd(): void {
    const sessionDuration = Date.now() - this.sessionStartTime;

    // Update usage stats with session duration
    this.updateUsageStats({
      sessionEnded: true,
      sessionDuration: sessionDuration,
    });

    // Note: metrics API is not available in Sentry Electron SDK
    // Sentry.metrics.distribution('session.duration', sessionDuration, {
    //   unit: 'millisecond',
    //   tags: {
    //     cohort: this.getUserCohort()
    //   }
    // });

    Sentry.addBreadcrumb({
      category: "session.end",
      message: "Session ended",
      level: "info",
      data: {
        duration_ms: sessionDuration,
        duration_readable: this.formatDuration(sessionDuration),
        cohort: this.getUserCohort(),
      },
    });
  }

  /**
   * Helper to track Umami events
   */
  private trackUmamiEvent(event: string, data: any): void {
    // Send to all renderer windows for Umami tracking
    const windows = require("electron").BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents
          .executeJavaScript(
            `
          if (window.umami) {
            window.umami.track('${event}', ${JSON.stringify(data)});
          }
        `,
          )
          .catch(() => {});
      }
    });
  }

  /**
   * Format duration for human readability
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${Math.round(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
    return `${Math.round(ms / 3600000)}h`;
  }

  /**
   * Performance monitoring wrapper for async operations
   */
  async monitorPerformance<T>(
    operationName: string,
    operation: () => Promise<T>,
    context?: any,
  ): Promise<T> {
    const startTime = Date.now();
    const operationId = `${operationName}-${Date.now()}`;

    try {
      // Start monitoring
      Sentry.addBreadcrumb({
        category: "performance.start",
        message: `Started ${operationName}`,
        level: "info",
        data: {
          operationName,
          operationId,
          context,
          timestamp: startTime,
        },
      });

      // Execute operation
      const result = await operation();

      // Success monitoring
      const duration = Date.now() - startTime;

      Sentry.addBreadcrumb({
        category: "performance.success",
        message: `Completed ${operationName}`,
        level: "info",
        data: {
          operationName,
          operationId,
          duration_ms: duration,
          duration_readable: this.formatDuration(duration),
          context,
        },
      });

      // Track slow operations (>2 seconds)
      if (duration > 2000) {
        this.trackUmamiEvent("slow-operation", {
          operation: operationName,
          duration_ms: duration,
          cohort: this.getUserCohort(),
        });
      }

      return result;
    } catch (error) {
      // Error monitoring
      const duration = Date.now() - startTime;

      Sentry.addBreadcrumb({
        category: "performance.error",
        message: `Failed ${operationName}`,
        level: "error",
        data: {
          operationName,
          operationId,
          duration_ms: duration,
          error: error instanceof Error ? error.message : String(error),
          context,
        },
      });

      // Track operation errors
      this.trackUmamiEvent("operation-error", {
        operation: operationName,
        error: error instanceof Error ? error.name : "Unknown",
        cohort: this.getUserCohort(),
      });

      throw error;
    }
  }

  /**
   * Performance monitoring wrapper for sync operations
   */
  monitorPerformanceSync<T>(
    operationName: string,
    operation: () => T,
    context?: any,
  ): T {
    const startTime = Date.now();
    const operationId = `${operationName}-${Date.now()}`;

    try {
      // Start monitoring
      Sentry.addBreadcrumb({
        category: "performance.start",
        message: `Started ${operationName}`,
        level: "info",
        data: {
          operationName,
          operationId,
          context,
          timestamp: startTime,
        },
      });

      // Execute operation
      const result = operation();

      // Success monitoring
      const duration = Date.now() - startTime;

      Sentry.addBreadcrumb({
        category: "performance.success",
        message: `Completed ${operationName}`,
        level: "info",
        data: {
          operationName,
          operationId,
          duration_ms: duration,
          duration_readable: this.formatDuration(duration),
          context,
        },
      });

      // Track slow operations (>1 second for sync)
      if (duration > 1000) {
        this.trackUmamiEvent("slow-sync-operation", {
          operation: operationName,
          duration_ms: duration,
          cohort: this.getUserCohort(),
        });
      }

      return result;
    } catch (error) {
      // Error monitoring
      const duration = Date.now() - startTime;

      Sentry.addBreadcrumb({
        category: "performance.error",
        message: `Failed ${operationName}`,
        level: "error",
        data: {
          operationName,
          operationId,
          duration_ms: duration,
          error: error instanceof Error ? error.message : String(error),
          context,
        },
      });

      // Track operation errors
      this.trackUmamiEvent("sync-operation-error", {
        operation: operationName,
        error: error instanceof Error ? error.name : "Unknown",
        cohort: this.getUserCohort(),
      });

      throw error;
    }
  }

  /**
   * Track memory usage at key points
   */
  trackMemoryUsage(checkpoint: string): void {
    try {
      const memUsage = process.memoryUsage();

      Sentry.addBreadcrumb({
        category: "memory.usage",
        message: `Memory usage at ${checkpoint}`,
        level: "info",
        data: {
          checkpoint,
          rss_mb: Math.round(memUsage.rss / 1024 / 1024),
          heapTotal_mb: Math.round(memUsage.heapTotal / 1024 / 1024),
          heapUsed_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
          external_mb: Math.round(memUsage.external / 1024 / 1024),
          timestamp: Date.now(),
        },
      });

      // Track high memory usage (>500MB heap)
      if (memUsage.heapUsed > 500 * 1024 * 1024) {
        this.trackUmamiEvent("high-memory-usage", {
          checkpoint,
          heap_used_mb: Math.round(memUsage.heapUsed / 1024 / 1024),
          cohort: this.getUserCohort(),
        });
      }
    } catch (error) {
      logger.error("Failed to track memory usage:", error);
    }
  }
}

// Export singleton instance
export const userAnalytics = new UserAnalyticsService();
