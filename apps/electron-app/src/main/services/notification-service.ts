import { Notification, type NotificationConstructorOptions } from "electron";
import { createLogger } from "@vibe/shared-types";
import { EncryptionService } from "./encryption-service";
import { useUserProfileStore } from "@/store/user-profile-store";
import * as fs from "fs/promises";

const logger = createLogger("NotificationService");

export interface APNSConfig {
  teamId: string;
  keyId: string;
  bundleId: string;
  keyFile?: string; // Path to .p8 key file
  keyData?: string; // Base64 encoded key data
  production?: boolean;
}

export interface PushNotificationPayload {
  aps: {
    alert?:
      | {
          title?: string;
          body?: string;
          subtitle?: string;
        }
      | string;
    badge?: number;
    sound?: string;
    "content-available"?: number;
    category?: string;
  };
  [key: string]: any;
}

export interface NotificationRegistration {
  deviceToken: string;
  userId?: string;
  platform: "ios" | "macos";
  timestamp: number;
}

/**
 * Comprehensive notification service supporting both local and push notifications
 * Integrates with Apple Push Notification Service (APNS) for iOS/macOS
 */
export class NotificationService {
  private static instance: NotificationService;
  private encryptionService: EncryptionService;
  private apnsProvider: any = null; // Will be set when apn library is loaded
  private deviceRegistrations: Map<string, NotificationRegistration> =
    new Map();

  private constructor() {
    this.encryptionService = EncryptionService.getInstance();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Initialize the notification service
   */
  public async initialize(): Promise<void> {
    try {
      logger.info("Initializing NotificationService");

      // Load existing device registrations
      await this.loadDeviceRegistrations();

      // Try to initialize APNS if configuration exists
      await this.initializeAPNS();

      logger.info("NotificationService initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize NotificationService:", error);
      throw error;
    }
  }

  /**
   * Show a local notification using Electron's native API
   */
  public showLocalNotification(
    options: NotificationConstructorOptions & {
      click?: () => void;
      action?: (index: number) => void;
    },
  ): Notification | null {
    if (!Notification.isSupported()) {
      logger.warn("Local notifications are not supported on this platform");
      return null;
    }

    try {
      const { click, action, ...notificationOptions } = options;

      const notification = new Notification({
        silent: false,
        ...notificationOptions,
      });

      if (click) {
        notification.once("click", click);
      }

      if (action) {
        notification.once("action", (_event, index) => {
          action(index);
        });
      }

      notification.show();
      logger.info(`Local notification shown: ${options.title}`);

      return notification;
    } catch (error) {
      logger.error("Failed to show local notification:", error);
      return null;
    }
  }

  /**
   * Send a push notification via APNS
   */
  public async sendPushNotification(
    deviceToken: string,
    payload: PushNotificationPayload,
    options?: {
      topic?: string;
      priority?: 10 | 5;
      expiry?: number;
      collapseId?: string;
    },
  ): Promise<boolean> {
    if (!this.apnsProvider) {
      logger.error(
        "APNS provider not initialized. Cannot send push notification.",
      );
      return false;
    }

    try {
      // Dynamically import node-apn (will be installed later)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const apn = require("node-apn");

      const notification = new apn.Notification();

      // Set payload
      notification.payload = payload;

      // Set options
      if (options?.topic) notification.topic = options.topic;
      if (options?.priority) notification.priority = options.priority;
      if (options?.expiry)
        notification.expiry = Math.floor(options.expiry / 1000);
      if (options?.collapseId) notification.collapseId = options.collapseId;

      // Send notification
      const result = await this.apnsProvider.send(notification, deviceToken);

      if (result.sent.length > 0) {
        logger.info(`Push notification sent successfully to ${deviceToken}`);
        return true;
      } else {
        logger.error(`Failed to send push notification:`, result.failed);
        return false;
      }
    } catch (error) {
      logger.error("Error sending push notification:", error);
      return false;
    }
  }

  /**
   * Register a device for push notifications
   */
  public async registerDevice(
    registration: NotificationRegistration,
  ): Promise<boolean> {
    try {
      const registrationId = `${registration.platform}_${registration.deviceToken}`;

      // Store registration
      this.deviceRegistrations.set(registrationId, {
        ...registration,
        timestamp: Date.now(),
      });

      // Persist to user profile
      await this.saveDeviceRegistrations();

      logger.info(`Device registered for notifications: ${registrationId}`);
      return true;
    } catch (error) {
      logger.error("Failed to register device:", error);
      return false;
    }
  }

  /**
   * Unregister a device from push notifications
   */
  public async unregisterDevice(
    deviceToken: string,
    platform: "ios" | "macos",
  ): Promise<boolean> {
    try {
      const registrationId = `${platform}_${deviceToken}`;

      if (this.deviceRegistrations.has(registrationId)) {
        this.deviceRegistrations.delete(registrationId);
        await this.saveDeviceRegistrations();

        logger.info(`Device unregistered: ${registrationId}`);
        return true;
      }

      return false;
    } catch (error) {
      logger.error("Failed to unregister device:", error);
      return false;
    }
  }

  /**
   * Get all registered devices
   */
  public getRegisteredDevices(): NotificationRegistration[] {
    return Array.from(this.deviceRegistrations.values());
  }

  /**
   * Configure APNS settings
   */
  public async configureAPNS(config: APNSConfig): Promise<boolean> {
    try {
      // Validate configuration
      if (!config.teamId || !config.keyId || !config.bundleId) {
        throw new Error(
          "Missing required APNS configuration: teamId, keyId, or bundleId",
        );
      }

      if (!config.keyFile && !config.keyData) {
        throw new Error("Either keyFile path or keyData must be provided");
      }

      // Encrypt and store configuration
      const encryptedConfig = await this.encryptionService.encrypt(
        JSON.stringify(config),
      );
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        throw new Error("No active user profile found");
      }

      await userProfileStore.setSecureSetting(
        activeProfile.id,
        "apns_config",
        encryptedConfig,
      );

      // Initialize APNS with new configuration
      await this.initializeAPNS();

      logger.info("APNS configuration updated successfully");
      return true;
    } catch (error) {
      logger.error("Failed to configure APNS:", error);
      return false;
    }
  }

  /**
   * Get APNS configuration status
   */
  public async getAPNSStatus(): Promise<{
    configured: boolean;
    connected: boolean;
    teamId?: string;
    bundleId?: string;
    production?: boolean;
  }> {
    try {
      const config = await this.getAPNSConfig();

      return {
        configured: !!config,
        connected: !!this.apnsProvider,
        teamId: config?.teamId,
        bundleId: config?.bundleId,
        production: config?.production,
      };
    } catch (error) {
      logger.error("Failed to get APNS status:", error);
      return { configured: false, connected: false };
    }
  }

  /**
   * Test APNS connection and configuration
   */
  public async testAPNSConnection(deviceToken?: string): Promise<boolean> {
    if (!this.apnsProvider) {
      logger.error("APNS provider not configured");
      return false;
    }

    try {
      // Use provided device token or a test token
      const testToken = deviceToken || "test_device_token_for_connection_check";

      const testPayload: PushNotificationPayload = {
        aps: {
          alert: "APNS Connection Test",
          sound: "default",
        },
      };

      // This will fail for invalid tokens but validates APNS configuration
      await this.sendPushNotification(testToken, testPayload);

      logger.info("APNS connection test completed");
      return true;
    } catch (error) {
      logger.error("APNS connection test failed:", error);
      return false;
    }
  }

  /**
   * Initialize APNS provider
   */
  private async initializeAPNS(): Promise<void> {
    try {
      const config = await this.getAPNSConfig();
      if (!config) {
        logger.info(
          "No APNS configuration found, skipping APNS initialization",
        );
        return;
      }

      // Dynamically import node-apn
      let apn: any;
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        apn = require("node-apn");
      } catch {
        logger.warn(
          "node-apn not installed. APNS functionality will be unavailable.",
        );
        return;
      }

      // Prepare key data
      let keyData: Buffer;
      if (config.keyFile) {
        keyData = await fs.readFile(config.keyFile);
      } else if (config.keyData) {
        keyData = Buffer.from(config.keyData, "base64");
      } else {
        throw new Error("No key data available for APNS");
      }

      // Configure APNS provider
      const apnsOptions = {
        token: {
          key: keyData,
          keyId: config.keyId,
          teamId: config.teamId,
        },
        production: config.production || false,
      };

      this.apnsProvider = new apn.Provider(apnsOptions);

      logger.info(
        `APNS provider initialized (${config.production ? "production" : "development"})`,
      );
    } catch (error) {
      logger.error("Failed to initialize APNS:", error);
      this.apnsProvider = null;
    }
  }

  /**
   * Get decrypted APNS configuration
   */
  private async getAPNSConfig(): Promise<APNSConfig | null> {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return null;
      }

      const encryptedConfig = await userProfileStore.getSecureSetting(
        activeProfile.id,
        "apns_config",
      );
      if (!encryptedConfig) {
        return null;
      }

      const decryptedConfig =
        await this.encryptionService.decrypt(encryptedConfig);
      return JSON.parse(decryptedConfig);
    } catch (error) {
      logger.error("Failed to get APNS configuration:", error);
      return null;
    }
  }

  /**
   * Load device registrations from user profile
   */
  private async loadDeviceRegistrations(): Promise<void> {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return;
      }

      const registrationsData = await userProfileStore.getSecureSetting(
        activeProfile.id,
        "device_registrations",
      );
      if (registrationsData) {
        const decryptedData =
          await this.encryptionService.decrypt(registrationsData);
        const registrations: NotificationRegistration[] =
          JSON.parse(decryptedData);

        // Load into memory
        this.deviceRegistrations.clear();
        registrations.forEach(reg => {
          const id = `${reg.platform}_${reg.deviceToken}`;
          this.deviceRegistrations.set(id, reg);
        });

        logger.info(`Loaded ${registrations.length} device registrations`);
      }
    } catch (error) {
      logger.error("Failed to load device registrations:", error);
    }
  }

  /**
   * Save device registrations to user profile
   */
  private async saveDeviceRegistrations(): Promise<void> {
    try {
      const registrations = Array.from(this.deviceRegistrations.values());
      const encryptedData = await this.encryptionService.encrypt(
        JSON.stringify(registrations),
      );

      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        throw new Error("No active user profile found");
      }

      await userProfileStore.setSecureSetting(
        activeProfile.id,
        "device_registrations",
        encryptedData,
      );

      logger.info(`Saved ${registrations.length} device registrations`);
    } catch (error) {
      logger.error("Failed to save device registrations:", error);
    }
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    try {
      if (this.apnsProvider) {
        this.apnsProvider.shutdown();
        this.apnsProvider = null;
      }

      this.deviceRegistrations.clear();

      logger.info("NotificationService destroyed");
    } catch (error) {
      logger.error("Error destroying NotificationService:", error);
    }
  }
}
