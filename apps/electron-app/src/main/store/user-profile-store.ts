/**
 * User Profile Store
 * Manages user profiles, sessions, and navigation history
 */

import { create } from "zustand";
import * as fs from "fs-extra";
import * as path from "path";
import { app } from "electron";

export interface NavigationHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  visitCount: number;
  lastVisit: number;
  favicon?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
  navigationHistory: NavigationHistoryEntry[];
  settings?: {
    defaultSearchEngine?: string;
    theme?: string;
    [key: string]: any;
  };
}

interface UserProfileState {
  profiles: Map<string, UserProfile>;
  activeProfileId: string | null;
  saveTimer?: NodeJS.Timeout;

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

  // Persistence
  saveProfiles: () => Promise<void>;
  loadProfiles: () => Promise<void>;
}

// Get the path for storing user profiles
const getUserProfilesPath = () => {
  const userDataPath = app.getPath("userData");
  return path.join(userDataPath, "profiles.json");
};

// Generate a unique profile ID
const generateProfileId = () => {
  return `profile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

export const useUserProfileStore = create<UserProfileState>((set, get) => ({
  profiles: new Map(),
  activeProfileId: null,

  createProfile: (name: string) => {
    const id = generateProfileId();
    const newProfile: UserProfile = {
      id,
      name,
      createdAt: Date.now(),
      lastActive: Date.now(),
      navigationHistory: [],
      settings: {
        defaultSearchEngine: "google",
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
}));

// Initialize store on import
useUserProfileStore.getState().loadProfiles();
