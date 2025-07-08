import { Notification, BrowserWindow } from "electron";
import { join } from "path";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("update-notifier");

export interface NotificationOptions {
  title: string;
  body: string;
  icon?: string;
  silent?: boolean;
  timeoutType?: "default" | "never";
  actions?: Array<{
    type: "button";
    text: string;
  }>;
}

export class UpdateNotifier {
  private isInitialized = false;
  private notificationCallbacks: Map<string, () => void> = new Map();

  constructor() {
    // Initialize with default values
  }

  public async initialize(): Promise<void> {
    try {
      // Removed tray setup - should use main app's tray instead
      this.isInitialized = true;
      logger.info("Update notifier initialized");
    } catch (error) {
      logger.error("Failed to initialize update notifier", { error });
    }
  }

  public showUpdateNotification(
    title: string,
    body: string,
    onClick?: () => void,
    options: Partial<NotificationOptions> = {},
  ): void {
    if (!this.isInitialized) {
      logger.warn("Update notifier not initialized");
      return;
    }

    try {
      const notification = new Notification({
        title,
        body,
        icon:
          options.icon || join(__dirname, "..", "..", "resources", "tray.png"),
        silent: options.silent || false,
        timeoutType: options.timeoutType || "default",
        actions: options.actions || [
          {
            type: "button",
            text: "Install Now",
          },
          {
            type: "button",
            text: "Later",
          },
        ],
      });

      // Generate unique ID for this notification
      const notificationId = `update_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;

      if (onClick) {
        this.notificationCallbacks.set(notificationId, onClick);
      }

      // Handle notification events
      notification.on("click", () => {
        const callback = this.notificationCallbacks.get(notificationId);
        if (callback) {
          callback();
          this.notificationCallbacks.delete(notificationId);
        }
        this.showMainWindow();
      });

      notification.on("action", (_event, index) => {
        if (index === 0) {
          // "Install Now" clicked
          const callback = this.notificationCallbacks.get(notificationId);
          if (callback) {
            callback();
            this.notificationCallbacks.delete(notificationId);
          }
        }
        // "Later" clicked - do nothing, notification will be dismissed
      });

      notification.on("close", () => {
        this.notificationCallbacks.delete(notificationId);
      });

      // Show the notification
      notification.show();

      // Update notifications don't need tray interaction

      logger.info("Update notification shown", { title });
    } catch (error) {
      logger.error("Failed to show update notification", { error });
    }
  }

  public showUpdateProgressNotification(progress: number): void {
    const title = "Downloading Update";
    const body = `Download progress: ${Math.round(progress * 100)}%`;

    this.showUpdateNotification(title, body, undefined, {
      silent: true,
      timeoutType: "never",
      actions: [],
    });
  }

  public showUpdateReadyNotification(
    version: string,
    onClick?: () => void,
  ): void {
    const title = "Update Ready to Install";
    const body = `Version ${version} has been downloaded and is ready to install.`;

    this.showUpdateNotification(title, body, onClick, {
      actions: [
        {
          type: "button",
          text: "Install Now",
        },
        {
          type: "button",
          text: "Install Later",
        },
      ],
    });
  }

  public showUpdateErrorNotification(error: string): void {
    const title = "Update Failed";
    const body = `Failed to download update: ${error}`;

    this.showUpdateNotification(title, body, undefined, {
      actions: [
        {
          type: "button",
          text: "Retry",
        },
        {
          type: "button",
          text: "Dismiss",
        },
      ],
    });
  }

  public showScheduledUpdateNotification(
    scheduledTime: string,
    onClick?: () => void,
  ): void {
    const title = "Scheduled Update";
    const body = `An update is scheduled for ${new Date(scheduledTime).toLocaleString()}. Click to install now.`;

    this.showUpdateNotification(title, body, onClick, {
      actions: [
        {
          type: "button",
          text: "Install Now",
        },
        {
          type: "button",
          text: "Keep Scheduled",
        },
      ],
    });
  }

  private showMainWindow(): void {
    const mainWindow = BrowserWindow.getAllWindows().find(
      w => !w.isDestroyed(),
    );
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  }

  public updateTrayIcon(hasUpdate: boolean): void {
    // Tray icon updates should be handled by the main app
    // This method is kept for compatibility but does nothing
    logger.info("Update tray icon request", { hasUpdate });
  }

  public async cleanup(): Promise<void> {
    try {
      // Clear all notification callbacks
      this.notificationCallbacks.clear();

      logger.info("Update notifier cleanup completed");
    } catch (error) {
      logger.error("Failed to cleanup update notifier", { error });
    }
  }
}
