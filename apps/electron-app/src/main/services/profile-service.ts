/**
 * Simplified Profile Service
 * Uses flat storage structure with direct key access
 */

import { EventEmitter } from "events";
import { BrowserWindow } from "electron";
import { randomUUID } from "crypto";
import { StorageService, getStorageService } from "../store/storage-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ProfileService");

// Profile color palette
const PROFILE_COLORS = [
  "#FF6B6B",
  "#4ECDC4",
  "#45B7D1",
  "#96CEB4",
  "#FECA57",
  "#FF9FF3",
  "#54A0FF",
  "#48DBFB",
  "#A29BFE",
  "#FD79A8",
];

// Types
export interface Profile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
  createdAt: number;
  lastUsed: number;
  isActive: boolean;
  isDefault: boolean;
  sessionPartition: string;
  settings: ProfileSettings;
}

export interface ProfileSettings {
  theme?: "light" | "dark" | "system";
  language?: string;
  defaultSearchEngine?: string;
  autoSavePasswords?: boolean;
  syncBrowsingHistory?: boolean;
  privacyMode?: boolean;
}

export interface BrowsingHistoryEntry {
  id: string;
  url: string;
  title: string;
  visitCount: number;
  lastVisit: number;
  favicon?: string;
}

export interface SavedPassword {
  id: string;
  url: string;
  username: string;
  password: string;
  title?: string;
  createdAt: number;
  lastUsed: number;
}

export class ProfileService extends EventEmitter {
  private static instance: ProfileService | null = null;
  private storage: StorageService;
  private currentProfileId: string | null = null;

  private constructor() {
    super();
    this.storage = getStorageService();
    this.initialize();
  }

  static getInstance(): ProfileService {
    if (!ProfileService.instance) {
      ProfileService.instance = new ProfileService();
    }
    return ProfileService.instance;
  }

  private async initialize(): Promise<void> {
    try {
      const profiles = this.getAllProfiles();
      const activeProfile = profiles.find(p => p.isActive);

      if (activeProfile) {
        this.currentProfileId = activeProfile.id;
      } else if (profiles.length > 0) {
        await this.setActiveProfile(profiles[0].id);
      } else {
        await this.createProfile("Default", true);
      }

      logger.info("Profile service initialized");
    } catch (error) {
      logger.error("Failed to initialize profile service:", error);
    }
  }

  // ========== Profile Management ==========

  getAllProfiles(): Profile[] {
    const profilesMap = this.storage.get("profiles", {});
    return Object.values(profilesMap);
  }

  getProfile(id: string): Profile | null {
    const profiles = this.storage.get("profiles", {});
    return profiles[id] || null;
  }

  getCurrentProfile(): Profile | null {
    if (!this.currentProfileId) return null;
    return this.getProfile(this.currentProfileId);
  }

  async createProfile(
    name: string,
    isDefault: boolean = false,
  ): Promise<Profile> {
    const profileId = randomUUID();
    const profiles = this.storage.get("profiles", {});

    const profileValues = Object.values(profiles) as Profile[];
    const usedColors = new Set(profileValues.map(p => p.color));
    const color =
      PROFILE_COLORS.find(c => !usedColors.has(c)) || PROFILE_COLORS[0];

    const profile: Profile = {
      id: profileId,
      name,
      email: "",
      avatar: "",
      color,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      isActive: false,
      isDefault,
      sessionPartition: `persist:${profileId}`,
      settings: {
        theme: "system",
        language: "en",
        defaultSearchEngine: "google",
        autoSavePasswords: true,
        syncBrowsingHistory: true,
        privacyMode: false,
      },
    };

    profiles[profileId] = profile;
    this.storage.set("profiles", profiles);

    logger.info(`Created profile: ${name}`);
    this.emit("profile-created", profile);
    this.broadcastToAllWindows("profile:created", profile);

    if (Object.keys(profiles).length === 1 || isDefault) {
      await this.setActiveProfile(profile.id);
    }

    return profile;
  }

  async setActiveProfile(profileId: string): Promise<boolean> {
    const profiles = this.storage.get("profiles", {});
    const profile = profiles[profileId];

    if (!profile) {
      logger.error(`Profile not found: ${profileId}`);
      return false;
    }

    // Update all profiles
    const profileValues = Object.values(profiles) as Profile[];
    profileValues.forEach(p => {
      p.isActive = p.id === profileId;
      if (p.id === profileId) {
        p.lastUsed = Date.now();
      }
    });

    this.storage.set("profiles", profiles);
    this.currentProfileId = profileId;

    logger.info(`Activated profile: ${profile.name}`);
    this.emit("profile-switched", profile);
    this.broadcastToAllWindows("profile:switched", profile);

    return true;
  }

  async updateProfile(
    profileId: string,
    updates: Partial<Profile>,
  ): Promise<boolean> {
    const profiles = this.storage.get("profiles", {});
    const profile = profiles[profileId];

    if (!profile) {
      logger.error(`Profile not found: ${profileId}`);
      return false;
    }

    profiles[profileId] = {
      ...profile,
      ...updates,
      id: profileId, // Prevent ID change
      lastUsed: Date.now(),
    };

    this.storage.set("profiles", profiles);

    logger.info(`Updated profile: ${profiles[profileId].name}`);
    this.emit("profile-updated", profiles[profileId]);
    this.broadcastToAllWindows("profile:updated", profiles[profileId]);

    return true;
  }

  async deleteProfile(profileId: string): Promise<boolean> {
    const profiles = this.storage.get("profiles", {});
    const profile = profiles[profileId];

    if (!profile) return false;

    if (profile.isDefault && Object.keys(profiles).length === 1) {
      logger.error("Cannot delete the only default profile");
      return false;
    }

    delete profiles[profileId];
    this.storage.set("profiles", profiles);

    // Clean up profile data
    this.deleteProfileData(profileId);

    logger.info(`Deleted profile: ${profile.name}`);
    this.emit("profile-deleted", profile);
    this.broadcastToAllWindows("profile:deleted", profile);

    if (profile.isActive && Object.keys(profiles).length > 0) {
      const firstProfile = Object.values(profiles)[0] as Profile;
      await this.setActiveProfile(firstProfile.id);
    }

    return true;
  }

  private deleteProfileData(profileId: string): void {
    // Delete all keys related to this profile
    const keysToDelete = [
      `profile.${profileId}.history`,
      `profile.${profileId}.preferences`,
      `secure.profile.${profileId}.passwords`,
      `secure.profile.${profileId}.apiKeys`,
    ];

    keysToDelete.forEach(key => this.storage.delete(key));
  }

  // ========== Browsing History ==========

  getBrowsingHistory(limit?: number): BrowsingHistoryEntry[] {
    if (!this.currentProfileId) return [];

    const history = this.storage.get(
      `profile.${this.currentProfileId}.history`,
      [],
    );
    return limit ? history.slice(0, limit) : history;
  }

  async addBrowsingHistory(
    url: string,
    title: string,
    favicon?: string,
  ): Promise<void> {
    if (!this.currentProfileId) return;

    const history = this.getBrowsingHistory();
    const existingIndex = history.findIndex(h => h.url === url);

    if (existingIndex !== -1) {
      history[existingIndex].visitCount++;
      history[existingIndex].lastVisit = Date.now();
      history[existingIndex].title = title;
      if (favicon) history[existingIndex].favicon = favicon;

      const [existing] = history.splice(existingIndex, 1);
      history.unshift(existing);
    } else {
      history.unshift({
        id: randomUUID(),
        url,
        title,
        visitCount: 1,
        lastVisit: Date.now(),
        favicon,
      });

      if (history.length > 100) {
        history.splice(100);
      }
    }

    this.storage.set(`profile.${this.currentProfileId}.history`, history);
  }

  async clearBrowsingHistory(): Promise<void> {
    if (!this.currentProfileId) return;

    this.storage.delete(`profile.${this.currentProfileId}.history`);

    this.emit("browsing-history-cleared");
    this.broadcastToAllWindows("profile:browsing-history-cleared", {
      profileId: this.currentProfileId,
    });
  }

  // ========== Saved Passwords ==========

  getSavedPasswords(): SavedPassword[] {
    if (!this.currentProfileId) return [];

    return this.storage.get(
      `secure.profile.${this.currentProfileId}.passwords`,
      [],
    );
  }

  async savePassword(
    url: string,
    username: string,
    password: string,
    title?: string,
  ): Promise<void> {
    if (!this.currentProfileId) return;

    const passwords = this.getSavedPasswords();
    const existingIndex = passwords.findIndex(
      p => p.url === url && p.username === username,
    );

    if (existingIndex !== -1) {
      passwords[existingIndex].password = password;
      passwords[existingIndex].lastUsed = Date.now();
      if (title) passwords[existingIndex].title = title;
    } else {
      passwords.push({
        id: randomUUID(),
        url,
        username,
        password,
        title,
        createdAt: Date.now(),
        lastUsed: Date.now(),
      });
    }

    this.storage.set(
      `secure.profile.${this.currentProfileId}.passwords`,
      passwords,
    );

    this.emit("password-saved", { url, username });
    this.broadcastToAllWindows("profile:password-saved", {
      profileId: this.currentProfileId,
      url,
      username,
    });
  }

  async deleteSavedPassword(passwordId: string): Promise<boolean> {
    if (!this.currentProfileId) return false;

    const passwords = this.getSavedPasswords();
    const index = passwords.findIndex(p => p.id === passwordId);

    if (index === -1) return false;

    passwords.splice(index, 1);
    this.storage.set(
      `secure.profile.${this.currentProfileId}.passwords`,
      passwords,
    );

    this.emit("password-deleted", { passwordId });
    this.broadcastToAllWindows("profile:password-deleted", {
      profileId: this.currentProfileId,
      passwordId,
    });

    return true;
  }

  // ========== API Keys ==========

  getApiKey(keyType: string): string | undefined {
    if (!this.currentProfileId) return undefined;

    const apiKeys = this.storage.get(
      `secure.profile.${this.currentProfileId}.apiKeys`,
      {},
    );
    return apiKeys[keyType];
  }

  getAllApiKeys(): Record<string, string> {
    if (!this.currentProfileId) return {};

    return this.storage.get(
      `secure.profile.${this.currentProfileId}.apiKeys`,
      {},
    );
  }

  setApiKey(keyType: string, value: string): boolean {
    if (!this.currentProfileId) return false;

    const apiKeys = this.getAllApiKeys();
    apiKeys[keyType] = value;
    this.storage.set(
      `secure.profile.${this.currentProfileId}.apiKeys`,
      apiKeys,
    );

    logger.info(`Set ${keyType} for profile ${this.currentProfileId}`);
    this.emit("api-key-set", { profileId: this.currentProfileId, keyType });
    return true;
  }

  removeApiKey(keyType: string): boolean {
    if (!this.currentProfileId) return false;

    const apiKeys = this.getAllApiKeys();
    delete apiKeys[keyType];
    this.storage.set(
      `secure.profile.${this.currentProfileId}.apiKeys`,
      apiKeys,
    );

    this.emit("api-key-removed", { profileId: this.currentProfileId, keyType });
    return true;
  }

  // ========== Preferences ==========

  getPreferences(): Record<string, any> {
    if (!this.currentProfileId) return {};

    return this.storage.get(`profile.${this.currentProfileId}.preferences`, {});
  }

  getPreference(key: string): any {
    return this.getPreferences()[key];
  }

  async setPreference(key: string, value: any): Promise<void> {
    if (!this.currentProfileId) return;

    const preferences = this.getPreferences();
    const oldValue = preferences[key];
    preferences[key] = value;
    this.storage.set(
      `profile.${this.currentProfileId}.preferences`,
      preferences,
    );

    // Emit event matching the format expected by settings handlers
    this.emit("preferenceChanged", key, value, oldValue);
    this.broadcastToAllWindows("profile:preference-changed", {
      profileId: this.currentProfileId,
      key,
      value,
      oldValue,
    });
  }

  // ========== Broadcasting ==========

  private broadcastToAllWindows(channel: string, data: any): void {
    try {
      BrowserWindow.getAllWindows().forEach(window => {
        if (!window.isDestroyed()) {
          window.webContents.send(channel, data);
        }
      });
    } catch (error) {
      logger.error(`Failed to broadcast ${channel}:`, error);
    }
  }
}

// Export singleton getter
export function getProfileService(): ProfileService {
  return ProfileService.getInstance();
}
