import { ipcMain, Notification, IpcMainInvokeEvent } from "electron";
import {
  NotificationService,
  type APNSConfig,
  type PushNotificationPayload,
  type NotificationRegistration,
} from "@/services/notification-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("notifications-ipc");

/**
 * Enhanced notification handlers supporting both local and push notifications
 * Integrates with NotificationService for comprehensive notification management
 */

// Legacy handler for backward compatibility
ipcMain.on("app:show-notification", (_event, title: string, body: string) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

// Enhanced local notification handler
ipcMain.handle(
  "notifications:show-local",
  async (
    _event: IpcMainInvokeEvent,
    options: {
      title: string;
      body?: string;
      subtitle?: string;
      icon?: string;
      sound?: string;
      actions?: Array<{ type: "button"; text: string }>;
      silent?: boolean;
    },
  ) => {
    try {
      const notificationService = NotificationService.getInstance();
      const notification = notificationService.showLocalNotification(options);
      return !!notification;
    } catch (error) {
      logger.error("Failed to show local notification:", error);
      return false;
    }
  },
);

// Push notification handlers
ipcMain.handle(
  "notifications:send-push",
  async (
    _event: IpcMainInvokeEvent,
    {
      deviceToken,
      payload,
      options,
    }: {
      deviceToken: string;
      payload: PushNotificationPayload;
      options?: {
        topic?: string;
        priority?: 10 | 5;
        expiry?: number;
        collapseId?: string;
      };
    },
  ) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.sendPushNotification(
        deviceToken,
        payload,
        options,
      );
    } catch (error) {
      logger.error("Failed to send push notification:", error);
      return false;
    }
  },
);

// Device registration handlers
ipcMain.handle(
  "notifications:register-device",
  async (
    _event: IpcMainInvokeEvent,
    registration: NotificationRegistration,
  ) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.registerDevice(registration);
    } catch (error) {
      logger.error("Failed to register device:", error);
      return false;
    }
  },
);

ipcMain.handle(
  "notifications:unregister-device",
  async (
    _event: IpcMainInvokeEvent,
    deviceToken: string,
    platform: "ios" | "macos",
  ) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.unregisterDevice(deviceToken, platform);
    } catch (error) {
      logger.error("Failed to unregister device:", error);
      return false;
    }
  },
);

ipcMain.handle(
  "notifications:get-registered-devices",
  async (_event: IpcMainInvokeEvent) => {
    try {
      const notificationService = NotificationService.getInstance();
      return notificationService.getRegisteredDevices();
    } catch (error) {
      logger.error("Failed to get registered devices:", error);
      return [];
    }
  },
);

// APNS configuration handlers
ipcMain.handle(
  "notifications:configure-apns",
  async (_event: IpcMainInvokeEvent, config: APNSConfig) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.configureAPNS(config);
    } catch (error) {
      logger.error("Failed to configure APNS:", error);
      return false;
    }
  },
);

ipcMain.handle(
  "notifications:get-apns-status",
  async (_event: IpcMainInvokeEvent) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.getAPNSStatus();
    } catch (error) {
      logger.error("Failed to get APNS status:", error);
      return { configured: false, connected: false };
    }
  },
);

ipcMain.handle(
  "notifications:test-apns",
  async (_event: IpcMainInvokeEvent, deviceToken?: string) => {
    try {
      const notificationService = NotificationService.getInstance();
      return await notificationService.testAPNSConnection(deviceToken);
    } catch (error) {
      logger.error("Failed to test APNS connection:", error);
      return false;
    }
  },
);
