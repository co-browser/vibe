import {
  Notification,
  Tray,
  Menu,
  app,
  BrowserWindow,
  nativeImage,
  shell,
} from "electron";
import { join } from "path";
import { autoUpdater } from "electron-updater";

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
  private tray: Tray | null = null;
  private isInitialized = false;
  private notificationCallbacks: Map<string, () => void> = new Map();

  constructor() {
    // Initialize with default values
  }

  public async initialize(): Promise<void> {
    try {
      this.setupTray();
      this.isInitialized = true;
      console.log("Update notifier initialized");
    } catch (error) {
      console.error("Failed to initialize update notifier:", error);
    }
  }

  private setupTray(): void {
    if (process.platform === "darwin" || process.platform === "win32") {
      try {
        // Create tray icon using the main app icon from resources
        const iconPath = join(__dirname, "..", "..", "resources", "tray.png");

        // Create a smaller version of the icon for the tray (16x16 or 22x22 for macOS)
        const trayIcon = nativeImage.createFromPath(iconPath);
        const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

        this.tray = new Tray(resizedIcon);

        // Set tooltip
        this.tray.setToolTip("Vibe - Update Available");

        // Create context menu
        const contextMenu = Menu.buildFromTemplate([
          {
            label: "Check for Updates",
            click: () => {
              this.checkForUpdates();
            },
          },
          {
            label: "Show Update History",
            click: () => {
              this.showUpdateHistory();
            },
          },
          { type: "separator" },
          {
            label: "Quit",
            click: () => {
              app.quit();
            },
          },
        ]);

        this.tray.setContextMenu(contextMenu);

        // Handle tray click
        this.tray.on("click", () => {
          this.showMainWindow();
        });
      } catch (error) {
        console.error("Failed to setup tray:", error);
      }
    }
  }

  public showUpdateNotification(
    title: string,
    body: string,
    onClick?: () => void,
    options: Partial<NotificationOptions> = {},
  ): void {
    if (!this.isInitialized) {
      console.warn("Update notifier not initialized");
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

      // Update tray tooltip
      if (this.tray) {
        this.tray.setToolTip(`Vibe - ${title}`);
      }

      console.log(`Update notification shown: ${title}`);
    } catch (error) {
      console.error("Failed to show update notification:", error);
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

  private async checkForUpdates(): Promise<void> {
    try {
      // Show a notification that we're checking for updates
      const checkingNotification = new Notification({
        title: "Checking for Updates",
        body: "Looking for new versions of Vibe...",
        icon: join(__dirname, "..", "..", "resources", "tray.png"),
      });
      checkingNotification.show();

      // Trigger the actual update check
      const result = await autoUpdater.checkForUpdates();

      if (!result || !result.updateInfo) {
        // No update available
        const noUpdateNotification = new Notification({
          title: "No Updates Available",
          body: "Vibe is up to date!",
          icon: join(__dirname, "..", "..", "resources", "tray.png"),
        });
        noUpdateNotification.show();
      }
      // If update is available, the update-service will handle showing the notification
    } catch (error) {
      console.error("Failed to check for updates:", error);
      const errorNotification = new Notification({
        title: "Update Check Failed",
        body: "Unable to check for updates. Please try again later.",
        icon: join(__dirname, "..", "..", "resources", "tray.png"),
      });
      errorNotification.show();
    }
  }

  private showUpdateHistory(): void {
    // For now, show a notification with the current version
    // In a full implementation, this would open a dialog or window with update history
    const currentVersion = app.getVersion();

    const historyNotification = new Notification({
      title: "Vibe Update History",
      body: `Current version: ${currentVersion}\nClick to view full history on GitHub`,
      icon: join(__dirname, "..", "..", "resources", "tray.png"),
    });

    historyNotification.on("click", () => {
      // Open the releases page in the default browser
      shell.openExternal("https://github.com/omnibox-vibe/releases");
    });

    historyNotification.show();
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
    if (!this.tray) return;

    try {
      // Use the main app icon from resources
      const iconPath = join(__dirname, "..", "..", "resources", "tray.png");
      const trayIcon = nativeImage.createFromPath(iconPath);

      // Create a smaller version for the tray
      const resizedIcon = trayIcon.resize({ width: 16, height: 16 });

      // If there's an update, we could tint the icon or add a badge
      // For now, just use the same icon
      this.tray.setImage(resizedIcon);

      const tooltip = hasUpdate ? "Vibe - Update Available" : "Vibe";

      this.tray.setToolTip(tooltip);
    } catch (error) {
      console.error("Failed to update tray icon:", error);
    }
  }

  public async cleanup(): Promise<void> {
    try {
      // Clear all notification callbacks
      this.notificationCallbacks.clear();

      // Destroy tray
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }

      console.log("Update notifier cleanup completed");
    } catch (error) {
      console.error("Failed to cleanup update notifier:", error);
    }
  }
}
