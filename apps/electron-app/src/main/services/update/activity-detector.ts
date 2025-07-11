import { powerMonitor } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ActivityDetector");

export interface ActivityPattern {
  lastActive: Date;
  averageActiveHours: number[];
  inactivePeriods: Array<{
    start: string;
    end: string;
    duration: number;
  }>;
}

export interface SuggestedUpdateTime {
  time: string;
  confidence: number;
  reason: string;
}

export class ActivityDetector {
  private isInitialized = false;
  private lastActivityTime = Date.now();
  private activityHistory: Date[] = [];
  private inactivityThreshold = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.setupActivityMonitoring();
  }

  private setupActivityMonitoring(): void {
    // Monitor system idle time
    powerMonitor.on("resume", () => {
      this.recordActivity();
    });

    // Record activity every minute
    setInterval(() => {
      this.recordActivity();
    }, 60 * 1000);
  }

  private recordActivity(): void {
    this.lastActivityTime = Date.now();
    this.activityHistory.push(new Date());

    // Keep only last 7 days of activity
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    this.activityHistory = this.activityHistory.filter(date => date > weekAgo);
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    this.recordActivity();
    this.isInitialized = true;
    logger.info("ActivityDetector initialized");
  }

  public async cleanup(): Promise<void> {
    this.isInitialized = false;
    logger.info("ActivityDetector cleaned up");
  }

  public async isUserInactive(): Promise<boolean> {
    const idleTime = Date.now() - this.lastActivityTime;
    return idleTime > this.inactivityThreshold;
  }

  public async getActivityPattern(): Promise<ActivityPattern> {
    const lastActive = new Date(this.lastActivityTime);

    // Calculate average active hours based on activity history
    const activeHours = this.activityHistory.map(date => date.getHours());
    const hourCounts = new Array(24).fill(0);

    activeHours.forEach(hour => {
      hourCounts[hour]++;
    });

    const averageActiveHours = hourCounts.map(count =>
      this.activityHistory.length > 0 ? count / this.activityHistory.length : 0,
    );

    // Find inactive periods (hours with low activity)
    const inactivePeriods: Array<{
      start: string;
      end: string;
      duration: number;
    }> = [];
    const threshold = Math.max(...averageActiveHours) * 0.3; // 30% of peak activity

    for (let i = 0; i < 24; i++) {
      if (averageActiveHours[i] <= threshold) {
        const startHour = i.toString().padStart(2, "0");
        const endHour = ((i + 1) % 24).toString().padStart(2, "0");

        inactivePeriods.push({
          start: `${startHour}:00`,
          end: `${endHour}:00`,
          duration: 1,
        });
      }
    }

    return {
      lastActive,
      averageActiveHours,
      inactivePeriods,
    };
  }

  public getSuggestedUpdateTimes(
    activity: ActivityPattern,
  ): SuggestedUpdateTime[] {
    const suggestions: SuggestedUpdateTime[] = [];

    // Find the most inactive hours
    const inactiveHours = activity.averageActiveHours
      .map((activity, hour) => ({ activity, hour }))
      .sort((a, b) => a.activity - b.activity)
      .slice(0, 3); // Top 3 most inactive hours

    inactiveHours.forEach(({ hour, activity }) => {
      const time = `${hour.toString().padStart(2, "0")}:00`;
      const confidence = 1 - activity; // Higher confidence for lower activity

      suggestions.push({
        time,
        confidence,
        reason: `Low activity period (${(activity * 100).toFixed(1)}% of peak)`,
      });
    });

    // Add early morning suggestion (3 AM) if not already included
    const hasEarlyMorning = suggestions.some(s => s.time === "03:00");
    if (!hasEarlyMorning) {
      suggestions.push({
        time: "03:00",
        confidence: 0.8,
        reason: "Typical low-activity period",
      });
    }

    // Sort by confidence (highest first)
    return suggestions.sort((a, b) => b.confidence - a.confidence);
  }
}
