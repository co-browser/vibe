/**
 * User Profile Store
 * Manages user profiles, sessions, and navigation history
 */

import { create } from "zustand";
import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";
import { randomUUID } from "crypto";
import { EncryptionService } from "../services/encryption-service";

export interface NavigationHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  visitCount: number;
  lastVisit: number;
  favicon?: string;
}

export interface DownloadHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
}

export interface ImportedPasswordEntry {
  id: string;
  url: string;
  username: string;
  password: string;
  source: "chrome" | "safari" | "csv" | "manual";
  dateCreated?: Date;
  lastModified?: Date;
}

export interface PasswordImportData {
  passwords: ImportedPasswordEntry[];
  timestamp: number;
  source: string;
  count: number;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
  navigationHistory: NavigationHistoryEntry[];
  downloads?: DownloadHistoryItem[];
  settings?: {
    defaultSearchEngine?: string;
    theme?: string;
    [key: string]: any;
  };
  secureSettings?: {
    [key: string]: string; // Encrypted sensitive data
  };
}

/**
 * User profile store state interface with comprehensive type safety
 */
interface UserProfileState {
  profiles: Map<string, UserProfile>;
  activeProfileId: string | null;
  saveTimer?: NodeJS.Timeout;
  isInitialized: boolean;
  initializationPromise: Promise<void> | null;
  lastError: Error | null;

  // Actions
  createProfile: (name: string) => string;
  getProfile: (id: string) => UserProfile | undefined;
  getActiveProfile: () => UserProfile | undefined;
  setActiveProfile: (id: string) => void;
  updateProfile: (id: string, updates: Partial<UserProfile>) => void;
  deleteProfile: (id: string) => void;

  // Navigation history actions
  addNavigationEntry: (
    profileId: string,
    entry: Omit<NavigationHistoryEntry, "visitCount" | "lastVisit">,
  ) => void;
  getNavigationHistory: (
    profileId: string,
    query?: string,
    limit?: number,
  ) => NavigationHistoryEntry[];
  clearNavigationHistory: (profileId: string) => void;
  deleteFromNavigationHistory: (profileId: string, url: string) => void;

  // Download history actions
  addDownloadEntry: (
    profileId: string,
    entry: Omit<DownloadHistoryItem, "id">,
  ) => void;
  getDownloadHistory: (profileId: string) => DownloadHistoryItem[];
  removeDownloadEntry: (profileId: string, downloadId: string) => void;
  clearDownloadHistory: (profileId: string) => void;

  // Secure settings actions
  setSecureSetting: (
    profileId: string,
    key: string,
    value: string,
  ) => Promise<void>;
  getSecureSetting: (profileId: string, key: string) => Promise<string | null>;
  removeSecureSetting: (profileId: string, key: string) => Promise<void>;
  getAllSecureSettings: (profileId: string) => Promise<Record<string, string>>;

  // Password storage actions (encrypted)
  storeImportedPasswords: (
    profileId: string,
    source: string,
    passwords: ImportedPasswordEntry[],
  ) => Promise<void>;
  getImportedPasswords: (
    profileId: string,
    source?: string,
  ) => Promise<ImportedPasswordEntry[]>;
  removeImportedPasswords: (profileId: string, source: string) => Promise<void>;
  clearAllImportedPasswords: (profileId: string) => Promise<void>;
  getPasswordImportSources: (profileId: string) => Promise<string[]>;

  // Persistence
  saveProfiles: () => Promise<void>;
  loadProfiles: () => Promise<void>;

  // Initialization with proper type safety
  initialize: () => Promise<void>;
  ensureInitialized: () => Promise<void>;
  isStoreReady: () => boolean;
  getInitializationStatus: () => {
    isInitialized: boolean;
    isInitializing: boolean;
    lastError: Error | null;
  };

  // Cleanup
  cleanup: () => void;
}

// Get the path for storing user profiles
const getUserProfilesPath = () => {
  // Check if app is ready before accessing userData path
  if (!app.isReady()) {
    throw new Error("Cannot access userData path before app is ready");
  }
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "profiles.json");
};

// Generate a unique profile ID using crypto.randomUUID
const generateProfileId = () => {
  return `profile_${randomUUID()}`;
};

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  profiles: new Map(),
  activeProfileId: null,
  isInitialized: false,
  initializationPromise: null,
  lastError: null,

  createProfile: (name: string) => {
    const id = generateProfileId();
    const newProfile: UserProfile = {
      id,
      name,
      createdAt: Date.now(),
      lastActive: Date.now(),
      navigationHistory: [],
      downloads: [],
      settings: {
        defaultSearchEngine: "perplexity",
      },
    };

    set(state => {
      const newProfiles = new Map(state.profiles);
      newProfiles.set(id, newProfile);
      return {
        profiles: newProfiles,
        activeProfileId: id, // Auto-activate new profile
      };
    });

    // Save profiles after creation
    get().saveProfiles();

    return id;
  },

  getProfile: (id: string) => {
    return get().profiles.get(id);
  },

  getActiveProfile: () => {
    const { activeProfileId, profiles } = get();
    return activeProfileId ? profiles.get(activeProfileId) : undefined;
  },

  setActiveProfile: (id: string) => {
    const profile = get().profiles.get(id);
    if (profile) {
      // Update last active timestamp
      profile.lastActive = Date.now();
      set({ activeProfileId: id });
      get().saveProfiles();
    }
  },

  updateProfile: (id: string, updates: Partial<UserProfile>) => {
    set(state => {
      const profile = state.profiles.get(id);
      if (profile) {
        const updatedProfile = { ...profile, ...updates };
        const newProfiles = new Map(state.profiles);
        newProfiles.set(id, updatedProfile);
        return { profiles: newProfiles };
      }
      return state;
    });
    get().saveProfiles();
  },

  deleteProfile: (id: string) => {
    set(state => {
      const newProfiles = new Map(state.profiles);
      newProfiles.delete(id);

      // If deleting active profile, switch to another or null
      let newActiveId = state.activeProfileId;
      if (state.activeProfileId === id) {
        newActiveId =
          newProfiles.size > 0 ? Array.from(newProfiles.keys())[0] : null;
      }

      return {
        profiles: newProfiles,
        activeProfileId: newActiveId,
      };
    });
    get().saveProfiles();
  },

  addNavigationEntry: (
    profileId: string,
    entry: Omit<NavigationHistoryEntry, "visitCount" | "lastVisit">,
  ) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };

      // Check if URL already exists in history
      const existingIndex = updatedProfile.navigationHistory.findIndex(
        h => h.url === entry.url,
      );

      if (existingIndex !== -1) {
        // Update existing entry
        const existing = updatedProfile.navigationHistory[existingIndex];
        existing.visitCount++;
        existing.lastVisit = Date.now();
        existing.title = entry.title || existing.title;
        existing.favicon = entry.favicon || existing.favicon;

        // Move to front (most recent)
        updatedProfile.navigationHistory.splice(existingIndex, 1);
        updatedProfile.navigationHistory.unshift(existing);
      } else {
        // Add new entry
        const newEntry: NavigationHistoryEntry = {
          ...entry,
          visitCount: 1,
          lastVisit: Date.now(),
        };
        updatedProfile.navigationHistory.unshift(newEntry);

        // Limit history size to 1000 entries
        if (updatedProfile.navigationHistory.length > 1000) {
          updatedProfile.navigationHistory =
            updatedProfile.navigationHistory.slice(0, 1000);
        }
      }

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });

    // Debounce saves to avoid excessive disk writes
    const state = get();
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }
    set({
      saveTimer: setTimeout(() => {
        get().saveProfiles();
      }, 1000),
    });
  },

  getNavigationHistory: (
    profileId: string,
    query?: string,
    limit: number = 10,
  ) => {
    const profile = get().profiles.get(profileId);
    if (!profile) return [];

    let history = profile.navigationHistory;

    // Filter by query if provided
    if (query) {
      const queryLower = query.toLowerCase();
      history = history.filter(
        entry =>
          entry.url.toLowerCase().includes(queryLower) ||
          entry.title.toLowerCase().includes(queryLower),
      );
    }

    // Sort by relevance (visit count * recency factor)
    const now = Date.now();
    history = history.sort((a, b) => {
      // Calculate recency factor (more recent = higher score)
      const aRecency = 1 / (1 + (now - a.lastVisit) / (1000 * 60 * 60 * 24)); // Days old
      const bRecency = 1 / (1 + (now - b.lastVisit) / (1000 * 60 * 60 * 24));

      const aScore = a.visitCount * aRecency;
      const bScore = b.visitCount * bRecency;

      return bScore - aScore;
    });

    return history.slice(0, limit);
  },

  clearNavigationHistory: (profileId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile, navigationHistory: [] };
      newProfiles.set(profileId, updatedProfile);

      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  deleteFromNavigationHistory: (profileId: string, url: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };

      // Filter out the entry with the matching URL
      updatedProfile.navigationHistory =
        updatedProfile.navigationHistory.filter(entry => entry.url !== url);

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  addDownloadEntry: (
    profileId: string,
    entry: Omit<DownloadHistoryItem, "id">,
  ) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };

      const newEntry: DownloadHistoryItem = {
        ...entry,
        id: `download_${randomUUID()}`,
        createdAt: Date.now(),
      };
      updatedProfile.downloads = updatedProfile.downloads
        ? [...updatedProfile.downloads, newEntry]
        : [newEntry];

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  getDownloadHistory: (profileId: string) => {
    const profile = get().profiles.get(profileId);
    if (!profile || !profile.downloads) return [];
    return profile.downloads;
  },

  removeDownloadEntry: (profileId: string, downloadId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };

      updatedProfile.downloads = (updatedProfile.downloads || []).filter(
        download => download.id !== downloadId,
      );

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  clearDownloadHistory: (profileId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile, downloads: [] };
      newProfiles.set(profileId, updatedProfile);

      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  setSecureSetting: async (profileId: string, key: string, value: string) => {
    const encryptionService = EncryptionService.getInstance();

    try {
      const encryptedValue = await encryptionService.encryptData(value);

      set(state => {
        const profile = state.profiles.get(profileId);
        if (profile) {
          const updatedProfile = {
            ...profile,
            secureSettings: {
              ...profile.secureSettings,
              [key]: encryptedValue,
            },
          };
          const newProfiles = new Map(state.profiles);
          newProfiles.set(profileId, updatedProfile);
          return { profiles: newProfiles };
        }
        return state;
      });

      get().saveProfiles();
    } catch (error) {
      console.error(`Failed to set secure setting ${key}:`, error);
      throw error;
    }
  },

  getSecureSetting: async (profileId: string, key: string) => {
    const encryptionService = EncryptionService.getInstance();
    const profile = get().profiles.get(profileId);

    if (!profile?.secureSettings?.[key]) {
      return null;
    }

    try {
      const encryptedValue = profile.secureSettings[key];
      return await encryptionService.decryptData(encryptedValue);
    } catch (error) {
      console.error(`Failed to get secure setting ${key}:`, error);
      return null;
    }
  },

  removeSecureSetting: async (profileId: string, key: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (profile?.secureSettings) {
        const updatedSecureSettings = { ...profile.secureSettings };
        delete updatedSecureSettings[key];

        const updatedProfile = {
          ...profile,
          secureSettings: updatedSecureSettings,
        };
        const newProfiles = new Map(state.profiles);
        newProfiles.set(profileId, updatedProfile);
        return { profiles: newProfiles };
      }
      return state;
    });

    get().saveProfiles();
  },

  getAllSecureSettings: async (profileId: string) => {
    const encryptionService = EncryptionService.getInstance();
    const profile = get().profiles.get(profileId);

    if (!profile?.secureSettings) {
      return {};
    }

    const decryptedSettings: Record<string, string> = {};

    for (const [key, encryptedValue] of Object.entries(
      profile.secureSettings,
    )) {
      try {
        decryptedSettings[key] =
          await encryptionService.decryptData(encryptedValue);
      } catch (error) {
        console.error(`Failed to decrypt setting ${key}:`, error);
        // Skip failed decryptions
      }
    }

    return decryptedSettings;
  },

  // Password storage implementation using encrypted secure settings
  storeImportedPasswords: async (
    profileId: string,
    source: string,
    passwords: ImportedPasswordEntry[],
  ) => {
    try {
      const passwordData: PasswordImportData = {
        passwords,
        timestamp: Date.now(),
        source,
        count: passwords.length,
      };

      // Store encrypted password data using secure settings
      const key = `passwords.import.${source}`;
      await get().setSecureSetting(
        profileId,
        key,
        JSON.stringify(passwordData),
      );

      console.info(
        `Stored ${passwords.length} passwords from ${source} securely for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to store imported passwords from ${source}:`,
        error,
      );
      throw error;
    }
  },

  getImportedPasswords: async (
    profileId: string,
    source?: string,
  ): Promise<ImportedPasswordEntry[]> => {
    try {
      if (source) {
        // Get passwords from specific source
        const key = `passwords.import.${source}`;
        const encryptedData = await get().getSecureSetting(profileId, key);

        if (!encryptedData) {
          return [];
        }

        const passwordData: PasswordImportData = JSON.parse(encryptedData);
        return passwordData.passwords || [];
      } else {
        // Get passwords from all sources
        const allSecureSettings = await get().getAllSecureSettings(profileId);
        const allPasswords: ImportedPasswordEntry[] = [];

        for (const [key, value] of Object.entries(allSecureSettings)) {
          if (key.startsWith("passwords.import.")) {
            try {
              const passwordData: PasswordImportData = JSON.parse(value);
              allPasswords.push(...(passwordData.passwords || []));
            } catch (error) {
              console.error(
                `Failed to parse password data for key ${key}:`,
                error,
              );
            }
          }
        }

        return allPasswords;
      }
    } catch (error) {
      console.error(`Failed to get imported passwords:`, error);
      return [];
    }
  },

  removeImportedPasswords: async (
    profileId: string,
    source: string,
  ): Promise<void> => {
    try {
      const key = `passwords.import.${source}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed imported passwords from ${source} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to remove imported passwords from ${source}:`,
        error,
      );
      throw error;
    }
  },

  clearAllImportedPasswords: async (profileId: string): Promise<void> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const passwordKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("passwords.import."),
      );

      for (const key of passwordKeys) {
        const source = key.replace("passwords.import.", "");
        await get().removeImportedPasswords(profileId, source);
      }

      console.info(`Cleared all imported passwords for profile ${profileId}`);
    } catch (error) {
      console.error("Failed to clear all imported passwords:", error);
      throw error;
    }
  },

  getPasswordImportSources: async (profileId: string): Promise<string[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const sources = Object.keys(allSecureSettings)
        .filter(key => key.startsWith("passwords.import."))
        .map(key => key.replace("passwords.import.", ""));

      return sources;
    } catch (error) {
      console.error("Failed to get password import sources:", error);
      return [];
    }
  },

  saveProfiles: async () => {
    try {
      const { profiles, activeProfileId } = get();
      const data = {
        profiles: Array.from(profiles.entries()).map(([id, profile]) => ({
          ...profile,
          id,
        })),
        activeProfileId,
      };

      const profilesPath = getUserProfilesPath();
      await fs.ensureDir(path.dirname(profilesPath));
      await fs.writeJson(profilesPath, data, { spaces: 2 });
    } catch (error) {
      console.error("Failed to save user profiles:", error);
    }
  },

  loadProfiles: async () => {
    try {
      const profilesPath = getUserProfilesPath();
      if (await fs.pathExists(profilesPath)) {
        const data = await fs.readJson(profilesPath);

        const profiles = new Map<string, UserProfile>();
        if (data.profiles && Array.isArray(data.profiles)) {
          data.profiles.forEach((profile: UserProfile) => {
            if (!profile.downloads) profile.downloads = [];
            profiles.set(profile.id, profile);
          });
        }

        set({
          profiles,
          activeProfileId: data.activeProfileId || null,
        });

        // Create default profile if none exist
        if (profiles.size === 0) {
          get().createProfile("Default");
        }
      } else {
        // Create default profile on first run
        get().createProfile("Default");
      }
    } catch (error) {
      console.error("Failed to load user profiles:", error);
      // Create default profile on error
      get().createProfile("Default");
    }
  },

  initialize: async () => {
    // Check if already initialized or initializing
    const state = get();
    if (state.isInitialized) {
      return;
    }

    if (state.initializationPromise) {
      return state.initializationPromise;
    }

    // Create initialization promise
    const initPromise = (async () => {
      try {
        // Only initialize if app is ready to avoid race conditions
        if (!app.isReady()) {
          throw new Error(
            "Cannot initialize profile store before app is ready",
          );
        }

        // Load profiles after ensuring app is ready
        await get().loadProfiles();

        set({
          isInitialized: true,
          initializationPromise: null,
          lastError: null,
        });
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        set({
          isInitialized: false,
          initializationPromise: null,
          lastError: err,
        });
        throw err;
      }
    })();

    set({ initializationPromise: initPromise });
    return initPromise;
  },

  ensureInitialized: async () => {
    const state = get();
    if (state.isInitialized) {
      return;
    }

    if (state.initializationPromise) {
      await state.initializationPromise;
      return;
    }

    await get().initialize();
  },

  isStoreReady: () => {
    return get().isInitialized;
  },

  getInitializationStatus: () => {
    const state = get();
    return {
      isInitialized: state.isInitialized,
      isInitializing: state.initializationPromise !== null,
      lastError: state.lastError,
    };
  },

  cleanup: () => {
    const state = get();
    if (state.saveTimer) {
      clearTimeout(state.saveTimer);
    }

    set({
      saveTimer: undefined,
      isInitialized: false,
      initializationPromise: null,
      lastError: null,
    });
  },
}));

// Store initialization will be done explicitly after app is ready
// DO NOT initialize automatically on import to avoid race conditions
