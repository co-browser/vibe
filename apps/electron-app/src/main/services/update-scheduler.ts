import { promises as fs } from "fs";
import { join } from "path";
import { app } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("update-scheduler");

export interface ScheduledUpdate {
  id: string;
  scheduledTime: string;
  createdAt: string;
  status: "pending" | "completed" | "cancelled";
}

export class UpdateScheduler {
  private storageFile: string;
  private scheduledUpdates: Map<string, ScheduledUpdate> = new Map();

  constructor() {
    this.storageFile = join(app.getPath("userData"), "scheduled-updates.json");
  }

  public async initialize(): Promise<void> {
    try {
      await this.loadScheduledUpdates();
      logger.info("Update scheduler initialized");
    } catch (error) {
      logger.error("Failed to initialize update scheduler:", error);
    }
  }

  public async scheduleUpdate(time: string): Promise<string> {
    const id = this.generateId();
    const scheduledUpdate: ScheduledUpdate = {
      id,
      scheduledTime: time,
      createdAt: new Date().toISOString(),
      status: "pending",
    };

    this.scheduledUpdates.set(id, scheduledUpdate);
    await this.saveScheduledUpdates();

    logger.info(`Update scheduled for ${time} with ID: ${id}`);
    return id;
  }

  public async getScheduledUpdates(): Promise<ScheduledUpdate[]> {
    return Array.from(this.scheduledUpdates.values())
      .filter(update => update.status === "pending")
      .sort(
        (a, b) =>
          new Date(a.scheduledTime).getTime() -
          new Date(b.scheduledTime).getTime(),
      );
  }

  public async cancelUpdate(id: string): Promise<boolean> {
    const update = this.scheduledUpdates.get(id);
    if (!update) {
      return false;
    }

    update.status = "cancelled";
    await this.saveScheduledUpdates();
    logger.info(`Scheduled update ${id} cancelled`);
    return true;
  }

  public async removeScheduledUpdate(id: string): Promise<boolean> {
    const removed = this.scheduledUpdates.delete(id);
    if (removed) {
      await this.saveScheduledUpdates();
      logger.info(`Scheduled update ${id} removed`);
    }
    return removed;
  }

  public async rescheduleUpdate(id: string, newTime: string): Promise<boolean> {
    const update = this.scheduledUpdates.get(id);
    if (!update) {
      return false;
    }

    update.scheduledTime = newTime;
    update.status = "pending";
    await this.saveScheduledUpdates();
    logger.info(`Scheduled update ${id} rescheduled for ${newTime}`);
    return true;
  }

  public async markUpdateCompleted(id: string): Promise<boolean> {
    const update = this.scheduledUpdates.get(id);
    if (!update) {
      return false;
    }

    update.status = "completed";
    await this.saveScheduledUpdates();
    logger.info(`Scheduled update ${id} marked as completed`);
    return true;
  }

  private async loadScheduledUpdates(): Promise<void> {
    try {
      const data = await fs.readFile(this.storageFile, "utf8");
      const updates = JSON.parse(data) as ScheduledUpdate[];

      this.scheduledUpdates.clear();
      for (const update of updates) {
        this.scheduledUpdates.set(update.id, update);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        logger.error("Failed to load scheduled updates:", error);
      }
    }
  }

  private async saveScheduledUpdates(): Promise<void> {
    try {
      const updates = Array.from(this.scheduledUpdates.values());
      await fs.writeFile(this.storageFile, JSON.stringify(updates, null, 2));
    } catch (error) {
      logger.error("Failed to save scheduled updates:", error);
    }
  }

  private generateId(): string {
    return `update_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public async cleanup(): Promise<void> {
    // Clean up completed updates older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    for (const [id, update] of this.scheduledUpdates.entries()) {
      if (
        update.status === "completed" &&
        new Date(update.createdAt) < thirtyDaysAgo
      ) {
        this.scheduledUpdates.delete(id);
      }
    }

    await this.saveScheduledUpdates();
    logger.info("Update scheduler cleanup completed");
  }
}
