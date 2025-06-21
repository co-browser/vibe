import { session, Session } from "electron";
import { EventEmitter } from "events";
import { createHash } from "crypto";
import { createLogger } from "@vibe/shared-types";
import {
  createProfileStore,
  EncryptedStore,
  profileMetadataStore,
  generateProfileEncryptionKey,
} from "../persistent/index";

const logger = createLogger("ProfileService");

/**
 * Profile data structure
 */
export interface Profile {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  createdAt: Date;
  lastUsed: Date;
  sessionPartition: string;
  encryptionKey: string;
  isDefault: boolean;
  settings: ProfileSettings;
}

/**
 * Profile settings
 */
export interface ProfileSettings {
  theme: "light" | "dark" | "system";
  language: string;
  defaultSearchEngine: string;
  autoSavePasswords: boolean;
  syncBrowsingHistory: boolean;
  enableAutocomplete: boolean;
  privacyMode: boolean;
}

/**
 * Imported password structure
 */
export interface ImportedPassword {
  id: string;
  url: string;
  username: string;
  password: string;
  title?: string;
  notes?: string;
  createdAt: Date;
  lastUsed?: Date;
  source: "chrome" | "firefox" | "safari" | "edge" | "manual";
}

/**
 * Browsing history entry
 */
export interface HistoryEntry {
  id: string;
  url: string;
  title: string;
  visitCount: number;
  lastVisit: Date;
  favicon?: string;
  tags?: string[];
}

/**
 * Chat query autocomplete data
 */
export interface ChatQueryData {
  id: string;
  query: string;
  frequency: number;
  lastUsed: Date;
  category?: string;
  context?: string;
}

/**
 * Generic storage interface for profile data
 */
export interface ProfileStorage {
  passwords: ImportedPassword[];
  history: HistoryEntry[];
  chatQueries: ChatQueryData[];
  bookmarks: any[];
  cookies: any[];
  localStorage: Record<string, any>;
  sessionStorage: Record<string, any>;
  customData: Record<string, any>;
}

/**
 * Profile Service Events
 */
export interface ProfileServiceEvents {
  profileCreated: (profile: Profile) => void;
  profileUpdated: (profile: Profile) => void;
  profileDeleted: (profileId: string) => void;
  profileSwitched: (fromProfile: string | null, toProfile: string) => void;
  sessionCreated: (profileId: string, session: Session) => void;
  dataImported: (
    profileId: string,
    dataType: keyof ProfileStorage,
    count: number,
  ) => void;
}

/**
 * Profile Service
 * Manages user profiles, sessions, and encrypted storage
 */
export class ProfileService extends EventEmitter {
  private profiles: Map<string, Profile> = new Map();
  private sessions: Map<string, Session> = new Map();
  private profileStores: Map<string, EncryptedStore> = new Map();
  private currentProfileId: string | null = null;
  private initialized = false;

  constructor() {
    super();
    logger.info("ProfileService initialized");
  }

  /**
   * Initialize the profile service
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("ProfileService already initialized");
      return;
    }

    try {
      await this.loadExistingProfiles();
      await this.loadCurrentProfile();
      this.initialized = true;
      logger.info("ProfileService initialization complete");
    } catch (error) {
      logger.error("Failed to initialize ProfileService:", error);
      throw error;
    }
  }

  /**
   * Create a new profile
   */
  public async createProfile(
    name: string,
    email?: string,
    settings?: Partial<ProfileSettings>,
  ): Promise<Profile> {
    const profileId = this.generateProfileId(name);
    const timestamp = Date.now();
    const encryptionKey = generateProfileEncryptionKey(timestamp);
    const sessionPartition = `persist:profile-${profileId}`;

    const defaultSettings: ProfileSettings = {
      theme: "system",
      language: "en",
      defaultSearchEngine: "google",
      autoSavePasswords: true,
      syncBrowsingHistory: true,
      enableAutocomplete: true,
      privacyMode: false,
      ...settings,
    };

    const profile: Profile = {
      id: profileId,
      name,
      email,
      createdAt: new Date(),
      lastUsed: new Date(),
      sessionPartition,
      encryptionKey,
      isDefault: this.profiles.size === 0, // First profile is default
      settings: defaultSettings,
    };

    // Create encrypted store for this profile
    const profileStore = await this.createProfileStore(profile);

    // Create Electron session
    const electronSession = await this.createElectronSession(profile);

    // Store profile data
    this.profiles.set(profileId, profile);
    this.profileStores.set(profileId, profileStore);
    this.sessions.set(profileId, electronSession);

    // Save profile metadata
    await this.saveProfileMetadata(profile);

    // Initialize empty storage
    await this.initializeProfileStorage(profileId);

    // If this is the first profile, set it as current
    if (this.profiles.size === 1) {
      await this.switchProfile(profileId);
    }

    logger.info(`Profile created: ${name} (${profileId})`);
    this.emit("profileCreated", profile);

    return profile;
  }

  /**
   * Get a profile by ID
   */
  public getProfile(profileId: string): Profile | null {
    return this.profiles.get(profileId) || null;
  }

  /**
   * Get all profiles
   */
  public getAllProfiles(): Profile[] {
    return Array.from(this.profiles.values());
  }

  /**
   * Get current active profile
   */
  public getCurrentProfile(): Profile | null {
    return this.currentProfileId
      ? this.getProfile(this.currentProfileId)
      : null;
  }

  /**
   * Switch to a different profile
   */
  public async switchProfile(profileId: string): Promise<void> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    const previousProfileId = this.currentProfileId;
    this.currentProfileId = profileId;

    // Update last used timestamp
    profile.lastUsed = new Date();
    await this.saveProfileMetadata(profile);

    // Save current profile to metadata store
    profileMetadataStore.set("currentProfile", profileId);

    logger.info(`Switched to profile: ${profile.name} (${profileId})`);
    this.emit("profileSwitched", previousProfileId, profileId);
  }

  /**
   * Get Electron session for a profile
   */
  public getSession(profileId: string): Session | null {
    return this.sessions.get(profileId) || null;
  }

  /**
   * Get current session
   */
  public getCurrentSession(): Session | null {
    return this.currentProfileId
      ? this.getSession(this.currentProfileId)
      : null;
  }

  /**
   * Import passwords for a profile
   */
  public async importPasswords(
    profileId: string,
    passwords: Omit<ImportedPassword, "id" | "createdAt">[],
  ): Promise<void> {
    const store = this.getProfileStore(profileId);
    const existingPasswords = store.get<ImportedPassword[]>("passwords", []);

    const newPasswords: ImportedPassword[] = passwords.map(pwd => ({
      ...pwd,
      id: this.generateId(),
      createdAt: new Date(),
    }));

    const allPasswords = [...existingPasswords, ...newPasswords];
    store.set("passwords", allPasswords);

    logger.info(
      `Imported ${newPasswords.length} passwords for profile ${profileId}`,
    );
    this.emit("dataImported", profileId, "passwords", newPasswords.length);
  }

  /**
   * Add browsing history entry
   */
  public async addHistoryEntry(
    profileId: string,
    entry: Omit<HistoryEntry, "id">,
  ): Promise<void> {
    const store = this.getProfileStore(profileId);
    const history = store.get<HistoryEntry[]>("history", []);

    // Check if URL already exists
    const existingIndex = history.findIndex(h => h.url === entry.url);

    if (existingIndex >= 0) {
      // Update existing entry
      history[existingIndex] = {
        ...history[existingIndex],
        ...entry,
        visitCount: history[existingIndex].visitCount + 1,
        lastVisit: new Date(),
      };
    } else {
      // Add new entry
      const newEntry: HistoryEntry = {
        ...entry,
        id: this.generateId(),
        visitCount: 1,
        lastVisit: new Date(),
      };
      history.unshift(newEntry);
    }

    // Keep only last 10000 entries
    if (history.length > 10000) {
      history.splice(10000);
    }

    store.set("history", history);
  }

  /**
   * Add chat query for autocomplete
   */
  public async addChatQuery(
    profileId: string,
    query: string,
    category?: string,
    context?: string,
  ): Promise<void> {
    const store = this.getProfileStore(profileId);
    const queries = store.get<ChatQueryData[]>("chatQueries", []);

    // Check if query already exists
    const existingIndex = queries.findIndex(q => q.query === query);

    if (existingIndex >= 0) {
      // Update frequency and last used
      queries[existingIndex].frequency += 1;
      queries[existingIndex].lastUsed = new Date();
      if (category) queries[existingIndex].category = category;
      if (context) queries[existingIndex].context = context;
    } else {
      // Add new query
      const newQuery: ChatQueryData = {
        id: this.generateId(),
        query,
        frequency: 1,
        lastUsed: new Date(),
        category,
        context,
      };
      queries.unshift(newQuery);
    }

    // Keep only last 1000 queries
    if (queries.length > 1000) {
      queries.splice(1000);
    }

    store.set("chatQueries", queries);
  }

  /**
   * Get profile storage data
   */
  public getProfileData<T extends keyof ProfileStorage>(
    profileId: string,
    dataType: T,
  ): ProfileStorage[T] {
    const store = this.getProfileStore(profileId);
    return store.get(dataType, this.getDefaultStorageValue(dataType));
  }

  /**
   * Set profile storage data
   */
  public setProfileData<T extends keyof ProfileStorage>(
    profileId: string,
    dataType: T,
    data: ProfileStorage[T],
  ): void {
    const store = this.getProfileStore(profileId);
    store.set(dataType, data);
  }

  /**
   * Generic storage interface
   */
  public async setCustomData(
    profileId: string,
    key: string,
    value: any,
  ): Promise<void> {
    const store = this.getProfileStore(profileId);
    const customData = store.get<Record<string, any>>("customData", {});
    customData[key] = value;
    store.set("customData", customData);
  }

  /**
   * Get custom data
   */
  public getCustomData<T = any>(
    profileId: string,
    key: string,
    defaultValue?: T,
  ): T {
    const store = this.getProfileStore(profileId);
    const customData = store.get<Record<string, any>>("customData", {});
    return customData[key] ?? defaultValue;
  }

  /**
   * Update profile settings
   */
  public async updateProfile(
    profileId: string,
    updates: Partial<
      Omit<Profile, "id" | "createdAt" | "sessionPartition" | "encryptionKey">
    >,
  ): Promise<Profile> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    // Update profile data
    Object.assign(profile, updates, { lastUsed: new Date() });

    // Save updated metadata
    await this.saveProfileMetadata(profile);

    logger.info(`Profile updated: ${profile.name} (${profileId})`);
    this.emit("profileUpdated", profile);

    return profile;
  }

  /**
   * Delete a profile
   */
  public async deleteProfile(profileId: string): Promise<void> {
    const profile = this.getProfile(profileId);
    if (!profile) {
      throw new Error(`Profile not found: ${profileId}`);
    }

    if (profile.isDefault && this.profiles.size > 1) {
      throw new Error(
        "Cannot delete default profile when other profiles exist",
      );
    }

    // Clean up session
    const electronSession = this.sessions.get(profileId);
    if (electronSession) {
      await electronSession.clearStorageData();
    }

    // Clean up stores
    const store = this.profileStores.get(profileId);
    if (store) {
      store.clear();
    }

    // Remove from metadata store
    const profiles = profileMetadataStore.get<Record<string, any>>(
      "profiles",
      {},
    );
    delete profiles[profileId];
    profileMetadataStore.set("profiles", profiles);

    // Remove from maps
    this.profiles.delete(profileId);
    this.sessions.delete(profileId);
    this.profileStores.delete(profileId);

    // If this was the current profile, switch to another
    if (this.currentProfileId === profileId) {
      const remainingProfiles = this.getAllProfiles();
      if (remainingProfiles.length > 0) {
        await this.switchProfile(remainingProfiles[0].id);
      } else {
        this.currentProfileId = null;
        profileMetadataStore.set("currentProfile", null);
      }
    }

    logger.info(`Profile deleted: ${profile.name} (${profileId})`);
    this.emit("profileDeleted", profileId);
  }

  /**
   * Private helper methods
   */

  private generateProfileId(name: string): string {
    const timestamp = Date.now();
    const hash = createHash("sha256")
      .update(`${name}-${timestamp}-${Math.random()}`)
      .digest("hex");
    return hash.substring(0, 16);
  }

  private generateId(): string {
    return createHash("sha256")
      .update(`${Date.now()}-${Math.random()}`)
      .digest("hex")
      .substring(0, 12);
  }

  private async createProfileStore(profile: Profile): Promise<EncryptedStore> {
    return createProfileStore(profile.id, profile.encryptionKey);
  }

  private async createElectronSession(profile: Profile): Promise<Session> {
    const electronSession = session.fromPartition(profile.sessionPartition, {
      cache: true,
    });

    // Configure session settings
    await this.configureSession(electronSession, profile);

    logger.info(`Created session for profile: ${profile.name}`);
    this.emit("sessionCreated", profile.id, electronSession);

    return electronSession;
  }

  private async configureSession(
    electronSession: Session,
    profile: Profile,
  ): Promise<void> {
    // Set user agent
    electronSession.setUserAgent(
      electronSession.getUserAgent() + ` Vibe/${profile.id}`,
    );

    // Configure permissions
    electronSession.setPermissionRequestHandler(
      (_webContents, permission, callback) => {
        // Allow common permissions, deny others by default
        const allowedPermissions = [
          "notifications",
          "geolocation",
          "media",
          "microphone",
          "camera",
        ];
        callback(allowedPermissions.includes(permission));
      },
    );

    // Configure security
    electronSession.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self' 'unsafe-inline' data: blob:",
          ],
        },
      });
    });
  }

  private getProfileStore(profileId: string): EncryptedStore {
    const store = this.profileStores.get(profileId);
    if (!store) {
      throw new Error(`Profile store not found: ${profileId}`);
    }
    return store;
  }

  private async loadExistingProfiles(): Promise<void> {
    try {
      const profiles = profileMetadataStore.get<Record<string, any>>(
        "profiles",
        {},
      );

      for (const [profileId, profileData] of Object.entries(profiles)) {
        try {
          // Reconstruct profile object with proper Date objects
          const profile: Profile = {
            ...profileData,
            createdAt: new Date(profileData.createdAt),
            lastUsed: new Date(profileData.lastUsed),
          };

          // Create encrypted store for this profile
          const profileStore = await this.createProfileStore(profile);

          // Create Electron session
          const electronSession = await this.createElectronSession(profile);

          // Store profile data
          this.profiles.set(profileId, profile);
          this.profileStores.set(profileId, profileStore);
          this.sessions.set(profileId, electronSession);

          logger.debug(`Loaded profile: ${profile.name} (${profileId})`);
        } catch (error) {
          logger.error(`Failed to load profile ${profileId}:`, error);
        }
      }

      logger.info(`Loaded ${this.profiles.size} existing profiles`);
    } catch (error) {
      logger.error("Failed to load existing profiles:", error);
    }
  }

  private async loadCurrentProfile(): Promise<void> {
    try {
      const currentProfileId =
        profileMetadataStore.get<string>("currentProfile");

      if (currentProfileId && this.profiles.has(currentProfileId)) {
        this.currentProfileId = currentProfileId;
        logger.info(`Restored current profile: ${currentProfileId}`);
      } else if (this.profiles.size > 0) {
        // If no current profile or it doesn't exist, use the first available
        const firstProfile = this.getAllProfiles()[0];
        await this.switchProfile(firstProfile.id);
        logger.info(`Set default current profile: ${firstProfile.id}`);
      }
    } catch (error) {
      logger.error("Failed to load current profile:", error);
    }
  }

  private async saveProfileMetadata(profile: Profile): Promise<void> {
    try {
      const profiles = profileMetadataStore.get<Record<string, any>>(
        "profiles",
        {},
      );
      profiles[profile.id] = {
        ...profile,
        // Convert dates to ISO strings for storage
        createdAt: profile.createdAt.toISOString(),
        lastUsed: profile.lastUsed.toISOString(),
      };
      profileMetadataStore.set("profiles", profiles);

      // Set as default if it's the only profile
      if (profile.isDefault) {
        profileMetadataStore.set("defaultProfile", profile.id);
      }

      logger.debug(`Saved profile metadata: ${profile.name} (${profile.id})`);
    } catch (error) {
      logger.error(`Failed to save profile metadata for ${profile.id}:`, error);
    }
  }

  private async initializeProfileStorage(profileId: string): Promise<void> {
    const store = this.getProfileStore(profileId);

    // Initialize with empty data structures
    const defaultData: ProfileStorage = {
      passwords: [],
      history: [],
      chatQueries: [],
      bookmarks: [],
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      customData: {},
    };

    // Only set if not already exists
    Object.entries(defaultData).forEach(([key, value]) => {
      if (!store.has(key)) {
        store.set(key, value);
      }
    });
  }

  private getDefaultStorageValue<T extends keyof ProfileStorage>(
    dataType: T,
  ): ProfileStorage[T] {
    const defaults: ProfileStorage = {
      passwords: [],
      history: [],
      chatQueries: [],
      bookmarks: [],
      cookies: [],
      localStorage: {},
      sessionStorage: {},
      customData: {},
    };
    return defaults[dataType];
  }
}

// Singleton instance
let profileServiceInstance: ProfileService | null = null;

/**
 * Get the singleton ProfileService instance
 */
export function getProfileService(): ProfileService {
  if (!profileServiceInstance) {
    profileServiceInstance = new ProfileService();
  }
  return profileServiceInstance;
}

/**
 * Initialize the profile service
 */
export async function initializeProfileService(): Promise<ProfileService> {
  const service = getProfileService();
  await service.initialize();
  return service;
}
