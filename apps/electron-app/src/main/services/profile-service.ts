import { EventEmitter } from "events";
import { createLogger } from "@vibe/shared-types";
import type { ProfileData, ProfileStatus } from "@vibe/shared-types";
import {
  NewUserStore,
  UserDataRecover,
  setSecureItem,
  getSecureItem,
  deleteSecureItem,
  getRecoveredData,
} from "@/store/desktop-store";

const logger = createLogger("ProfileService");

export class ProfileService extends EventEmitter {
  private status: ProfileStatus = {
    initialized: false,
    authenticated: false,
    hasProfile: false,
    lastActivity: 0,
  };
  private currentProfile: ProfileData | null = null;

  constructor() {
    super();
  }

  async initialize(): Promise<ProfileStatus> {
    try {
      logger.info("Initializing profile service");

      const existingProfileId = getSecureItem("profile_id");

      if (existingProfileId) {
        const recovered = await UserDataRecover();
        if (recovered) {
          const profileData = getRecoveredData("profile_data");
           const profileData = getRecoveredData("profile_data");
           if (profileData) {
-            this.currentProfile = JSON.parse(profileData);
+            try {
+              this.currentProfile = JSON.parse(profileData);
+            } catch (parseError) {
+              logger.error("Failed to parse profile data:", parseError);
+              throw new Error("Corrupted profile data");
+            }
            this.status = {
              initialized: true,
              authenticated: true,
              hasProfile: true,
              profileId: existingProfileId,
              lastActivity: Date.now(),
            };
            logger.info("Profile recovered successfully");
            this.emit("profile-recovered", this.currentProfile);
            return this.status;
          }
        }
      }

      this.status = {
        initialized: true,
        authenticated: false,
        hasProfile: false,
        lastActivity: Date.now(),
      };

      logger.info("No existing profile found, ready for new user setup");
      this.emit("ready-for-setup");
      return this.status;
    } catch (error) {
      logger.error("Profile service initialization failed:", error);
      this.status.error =
        error instanceof Error ? error.message : "Unknown error";
      this.emit("error", error);
      throw error;
    }
  }

  async createProfile(
    profileData: Omit<ProfileData, "id" | "createdAt" | "updatedAt">,
  ): Promise<ProfileData> {
    try {
      logger.info("Creating new user profile");

      const success = await NewUserStore(
        "Authenticate to create your secure profile",
      );
      if (!success) {
        throw new Error("Touch ID authentication failed");
      }

      const profile: ProfileData = {
        ...profileData,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      setSecureItem("profile_id", profile.id);
      setSecureItem("profile_data", JSON.stringify(profile));

      this.currentProfile = profile;
      this.status = {
        initialized: true,
        authenticated: true,
        hasProfile: true,
        profileId: profile.id,
        lastActivity: Date.now(),
      };

      logger.info("Profile created successfully");
      this.emit("profile-created", profile);
      return profile;
    } catch (error) {
      logger.error("Profile creation failed:", error);
      this.emit("error", error);
      throw error;
    }
  }

  getProfile(): ProfileData | null {
    return this.currentProfile;
  }

  async updateProfile(updates: Partial<ProfileData>): Promise<ProfileData> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    const updatedProfile: ProfileData = {
      ...this.currentProfile,
      ...updates,
      updatedAt: Date.now(),
    };

    setSecureItem("profile_data", JSON.stringify(updatedProfile));
    this.currentProfile = updatedProfile;
    this.status.lastActivity = Date.now();

    logger.info("Profile updated successfully");
    this.emit("profile-updated", updatedProfile);
    return updatedProfile;
  }

  async setApiKey(service: string, key: string): Promise<void> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    await this.updateProfile({
      apiKeys: {
        ...this.currentProfile.apiKeys,
        [service]: key,
      },
    });

    setSecureItem(`api_key_${service}`, key);
    this.emit("api-key-changed", { service, key });
  }

  getApiKey(service: string): string | undefined {
    const individualKey = getSecureItem(`api_key_${service}`);
    if (individualKey) return individualKey;
    return this.currentProfile?.apiKeys[service];
  }

  async deleteApiKey(service: string): Promise<void> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    const remainingKeys = { ...this.currentProfile.apiKeys };
    delete remainingKeys[service];
    await this.updateProfile({ apiKeys: remainingKeys });
    deleteSecureItem(`api_key_${service}`);
  }

  async setSavedPassword(domain: string, password: string): Promise<void> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    await this.updateProfile({
      savedPasswords: {
        ...this.currentProfile.savedPasswords,
        [domain]: password,
      },
    });

    setSecureItem(`password_${domain}`, password);
  }

  getSavedPassword(domain: string): string | undefined {
    const individualPassword = getSecureItem(`password_${domain}`);
    if (individualPassword) return individualPassword;
    return this.currentProfile?.savedPasswords[domain];
  }

  async addBrowsingHistory(url: string, title: string): Promise<void> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    const newEntry = { url, title, timestamp: Date.now() };
    const updatedHistory = [
      newEntry,
      ...this.currentProfile.browsingHistory.slice(0, 99),
    ];

    await this.updateProfile({
      browsingHistory: updatedHistory,
    });
  }

  getBrowsingHistory(
    limit: number = 50,
  ): Array<{ url: string; title: string; timestamp: number }> {
    return this.currentProfile?.browsingHistory.slice(0, limit) || [];
  }

  async setPreference(key: string, value: any): Promise<void> {
    if (!this.currentProfile) {
      throw new Error("No profile available");
    }

    await this.updateProfile({
      preferences: {
        ...this.currentProfile.preferences,
        [key]: value,
      },
    });
  }

  getPreference(key: string): any {
    return this.currentProfile?.preferences[key];
  }

  getStatus(): ProfileStatus {
    return { ...this.status };
  }

  async clearProfile(): Promise<void> {
    deleteSecureItem("profile_id");
    deleteSecureItem("profile_data");

    if (this.currentProfile) {
      Object.keys(this.currentProfile.apiKeys).forEach(service => {
        deleteSecureItem(`api_key_${service}`);
      });
      Object.keys(this.currentProfile.savedPasswords).forEach(domain => {
        deleteSecureItem(`password_${domain}`);
      });
    }

    this.currentProfile = null;
    this.status = {
      initialized: true,
      authenticated: false,
      hasProfile: false,
      lastActivity: Date.now(),
    };

    logger.info("Profile cleared successfully");
    this.emit("profile-cleared");
  }
}

export const profileService = new ProfileService();
