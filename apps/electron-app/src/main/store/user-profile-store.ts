/**
 * User Profile Store
 * Manages user profiles, sessions, and navigation history
 */

import { create } from "zustand";
import * as fs from "fs-extra";
import * as path from "path";
import { app, session } from "electron";
import { randomUUID } from "crypto";
import { EncryptionService } from "../services/encryption-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("UserProfileStore");

export interface NavigationHistoryEntry {
  url: string;
  title: string;
  timestamp: number;
  visitCount: number;
  lastVisit: number;
  favicon?: string;
  transitionType?: string;
  visitDuration?: number;
  referrer?: string;
  source?: "vibe" | "chrome" | "safari" | "firefox";
}

export interface DownloadHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
  exists?: boolean;
  status?: "downloading" | "completed" | "cancelled" | "error";
  progress?: number; // 0-100
  totalBytes?: number;
  receivedBytes?: number;
  startTime?: number;
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

export interface BookmarkEntry {
  id: string;
  name: string;
  url?: string;
  type: "folder" | "url";
  dateAdded: number;
  dateModified?: number;
  parentId?: string;
  children?: BookmarkEntry[];
  source: "chrome" | "safari" | "firefox" | "manual";
  favicon?: string;
}

export interface BookmarkImportData {
  bookmarks: BookmarkEntry[];
  timestamp: number;
  source: string;
  count: number;
}

export interface AutofillEntry {
  id: string;
  name: string;
  value: string;
  count: number;
  dateCreated: number;
  dateLastUsed: number;
  source: "chrome" | "safari" | "firefox";
}

export interface AutofillProfile {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  source: "chrome" | "safari" | "firefox";
  dateModified?: number;
  useCount?: number;
}

export interface AutofillImportData {
  entries: AutofillEntry[];
  profiles: AutofillProfile[];
  timestamp: number;
  source: string;
  count: number;
}

export interface SearchEngine {
  id: string;
  name: string;
  keyword: string;
  searchUrl: string;
  favIconUrl?: string;
  isDefault: boolean;
  source: "chrome" | "safari" | "firefox";
  dateCreated?: number;
}

export interface SearchEngineImportData {
  engines: SearchEngine[];
  timestamp: number;
  source: string;
  count: number;
}

export interface ComprehensiveImportData {
  passwords?: PasswordImportData;
  bookmarks?: BookmarkImportData;
  history?: {
    entries: NavigationHistoryEntry[];
    timestamp: number;
    source: string;
    count: number;
  };
  autofill?: AutofillImportData;
  searchEngines?: SearchEngineImportData;
  source: string;
  timestamp: number;
  totalItems: number;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
  navigationHistory: NavigationHistoryEntry[];
  downloads?: DownloadHistoryItem[];
  bookmarks?: BookmarkEntry[];
  autofillEntries?: AutofillEntry[];
  autofillProfiles?: AutofillProfile[];
  searchEngines?: SearchEngine[];
  importHistory?: {
    passwords?: PasswordImportData[];
    bookmarks?: BookmarkImportData[];
    history?: {
      entries: NavigationHistoryEntry[];
      timestamp: number;
      source: string;
      count: number;
    }[];
    autofill?: AutofillImportData[];
    searchEngines?: SearchEngineImportData[];
  };
  settings?: {
    defaultSearchEngine?: string;
    theme?: string;
    [key: string]: any;
  };
  secureSettings?: {
    [key: string]: string; // Encrypted sensitive data
  };
}

// Extended interface for runtime with session
export interface ProfileWithSession extends UserProfile {
  session?: Electron.Session;
}

/**
 * User profile store state interface with comprehensive type safety
 */
interface UserProfileState {
  profiles: Map<string, ProfileWithSession>;
  profileSessions: Map<string, Electron.Session>;
  activeProfileId: string | null;
  saveTimer?: NodeJS.Timeout;
  isInitialized: boolean;
  initializationPromise: Promise<void> | null;
  lastError: Error | null;
  sessionCreatedCallbacks: ((
    profileId: string,
    session: Electron.Session,
  ) => void)[];

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
  ) => DownloadHistoryItem;
  getDownloadHistory: (profileId: string) => DownloadHistoryItem[];
  removeDownloadEntry: (profileId: string, downloadId: string) => void;
  clearDownloadHistory: (profileId: string) => void;
  updateDownloadProgress: (
    profileId: string,
    downloadId: string,
    progress: number,
    receivedBytes: number,
    totalBytes: number,
  ) => void;
  updateDownloadStatus: (
    profileId: string,
    downloadId: string,
    status: "downloading" | "completed" | "cancelled" | "error",
    exists: boolean,
  ) => void;
  completeDownload: (profileId: string, downloadId: string) => void;
  cancelDownload: (profileId: string, downloadId: string) => void;
  errorDownload: (profileId: string, downloadId: string) => void;

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

  // Bookmark storage actions
  storeImportedBookmarks: (
    profileId: string,
    source: string,
    bookmarks: BookmarkEntry[],
  ) => Promise<void>;
  getImportedBookmarks: (
    profileId: string,
    source?: string,
  ) => Promise<BookmarkEntry[]>;
  removeImportedBookmarks: (profileId: string, source: string) => Promise<void>;
  clearAllImportedBookmarks: (profileId: string) => Promise<void>;
  getBookmarkImportSources: (profileId: string) => Promise<string[]>;

  // Enhanced history storage actions
  storeImportedHistory: (
    profileId: string,
    source: string,
    history: NavigationHistoryEntry[],
  ) => Promise<void>;
  getImportedHistory: (
    profileId: string,
    source?: string,
  ) => Promise<NavigationHistoryEntry[]>;
  removeImportedHistory: (profileId: string, source: string) => Promise<void>;
  clearAllImportedHistory: (profileId: string) => Promise<void>;
  getHistoryImportSources: (profileId: string) => Promise<string[]>;

  // Autofill storage actions
  storeImportedAutofill: (
    profileId: string,
    source: string,
    autofillData: AutofillImportData,
  ) => Promise<void>;
  getImportedAutofill: (
    profileId: string,
    source?: string,
  ) => Promise<AutofillImportData>;
  removeImportedAutofill: (profileId: string, source: string) => Promise<void>;
  clearAllImportedAutofill: (profileId: string) => Promise<void>;
  getAutofillImportSources: (profileId: string) => Promise<string[]>;

  // Search engine storage actions
  storeImportedSearchEngines: (
    profileId: string,
    source: string,
    engines: SearchEngine[],
  ) => Promise<void>;
  getImportedSearchEngines: (
    profileId: string,
    source?: string,
  ) => Promise<SearchEngine[]>;
  removeImportedSearchEngines: (
    profileId: string,
    source: string,
  ) => Promise<void>;
  clearAllImportedSearchEngines: (profileId: string) => Promise<void>;
  getSearchEngineImportSources: (profileId: string) => Promise<string[]>;

  // Comprehensive import actions
  storeComprehensiveImport: (
    profileId: string,
    importData: ComprehensiveImportData,
  ) => Promise<void>;
  getComprehensiveImportHistory: (
    profileId: string,
    source?: string,
  ) => Promise<ComprehensiveImportData[]>;
  removeComprehensiveImport: (
    profileId: string,
    source: string,
    timestamp: number,
  ) => Promise<void>;
  clearAllImportData: (profileId: string) => Promise<void>;

  // Persistence
  saveProfiles: () => Promise<void>;
  loadProfiles: () => Promise<void>;

  // Simple interface for common actions (uses active profile automatically)
  // Navigation
  visitPage: (url: string, title: string) => void;
  searchHistory: (query: string, limit?: number) => NavigationHistoryEntry[];
  clearHistory: () => void;

  // Downloads
  recordDownload: (fileName: string, filePath: string) => void;
  getDownloads: () => DownloadHistoryItem[];
  clearDownloads: () => void;

  // Settings
  setSetting: (key: string, value: any) => void;
  getSetting: (key: string, defaultValue?: any) => any;

  // Passwords
  getPasswords: () => Promise<ImportedPasswordEntry[]>;
  importPasswordsFromBrowser: (
    source: string,
    passwords: ImportedPasswordEntry[],
  ) => Promise<void>;
  clearPasswords: () => Promise<void>;

  // Bookmarks
  getBookmarks: () => Promise<BookmarkEntry[]>;
  importBookmarksFromBrowser: (
    source: string,
    bookmarks: BookmarkEntry[],
  ) => Promise<void>;
  clearBookmarks: () => Promise<void>;

  // Privacy
  clearAllData: () => Promise<void>;

  // Profile management
  getCurrentProfile: () => UserProfile | undefined;
  switchProfile: (profileId: string) => void;
  createNewProfile: (name: string) => string;

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

  // Session management
  createSessionForProfile: (profileId: string) => Electron.Session;
  destroySessionForProfile: (profileId: string) => void;
  getSessionForProfile: (profileId: string) => Electron.Session;
  getActiveSession: () => Electron.Session;
  getAllSessions: () => Map<string, Electron.Session>;
  onSessionCreated: (
    callback: (profileId: string, session: Electron.Session) => void,
  ) => void;
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
  profileSessions: new Map(),
  activeProfileId: null,
  isInitialized: false,
  initializationPromise: null,
  lastError: null,
  sessionCreatedCallbacks: [],

  createProfile: (name: string) => {
    console.log("[Profile Debug] createProfile called with name:", name);

    const id = generateProfileId();
    const now = Date.now();

    console.log("[Profile Debug] Generated profile ID:", id);

    const newProfile: UserProfile = {
      id,
      name,
      createdAt: now,
      lastActive: now,
      navigationHistory: [],
      downloads: [],
      bookmarks: [],
      autofillEntries: [],
      autofillProfiles: [],
      searchEngines: [],
      importHistory: {
        passwords: [],
        bookmarks: [],
        history: [],
        autofill: [],
        searchEngines: [],
      },
      settings: {
        defaultSearchEngine: "google",
        theme: "system",
        clearHistoryOnExit: false,
        clearCookiesOnExit: false,
        clearDownloadsOnExit: false,
        enableAutofill: true,
        enablePasswordSaving: true,
        showBookmarksBar: true,
        newTabPageType: "blank",
        searchSuggestions: true,
        askWhereToSave: true,
      },
      secureSettings: {},
    };

    set(state => {
      const newProfiles = new Map(state.profiles);
      newProfiles.set(id, newProfile);

      console.log("[Profile Debug] Adding profile to store:", {
        profileId: id,
        profileName: name,
        totalProfiles: newProfiles.size,
      });

      return {
        profiles: newProfiles,
        activeProfileId: id, // Set as active profile
      };
    });

    console.log("[Profile Debug] Profile created and set as active:", {
      profileId: id,
      profileName: name,
    });

    // Initialize secure storage structures for the new profile
    const initializeSecureStorage = async () => {
      try {
        // Initialize encrypted storage for sensitive data
        await get().setSecureSetting(id, "_profile_initialized", "true");
        console.info(
          `Profile ${id} (${name}) created successfully with all data structures initialized`,
        );
      } catch (error) {
        console.error(
          `Failed to initialize secure storage for profile ${id}:`,
          error,
        );
      }
    };

    // Initialize secure storage asynchronously
    initializeSecureStorage();

    // Create session for the new profile
    get().createSessionForProfile(id);

    // Save profiles after creation
    get().saveProfiles();

    return id;
  },

  getProfile: (id: string) => {
    return get().profiles.get(id);
  },

  getActiveProfile: () => {
    const { activeProfileId, profiles } = get();
    console.log("[Profile Debug] getActiveProfile called:", {
      activeProfileId,
      profilesSize: profiles.size,
      profileIds: Array.from(profiles.keys()),
      isInitialized: get().isInitialized,
    });

    if (!activeProfileId) {
      console.log("[Profile Debug] No activeProfileId found");
      return undefined;
    }

    const profile = profiles.get(activeProfileId);
    if (!profile) {
      console.log(
        "[Profile Debug] Profile not found for activeProfileId:",
        activeProfileId,
      );
      return undefined;
    }

    console.log("[Profile Debug] Returning active profile:", {
      id: profile.id,
      name: profile.name,
      downloadsCount: profile.downloads?.length || 0,
    });
    return profile;
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
    // Destroy session first
    get().destroySessionForProfile(id);

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
  ): DownloadHistoryItem => {
    const newEntry: DownloadHistoryItem = {
      ...entry,
      id: `download_${randomUUID()}`,
      createdAt: Date.now(),
    };

    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };

      updatedProfile.downloads = updatedProfile.downloads
        ? [...updatedProfile.downloads, newEntry]
        : [newEntry];

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();

    return newEntry;
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

  updateDownloadProgress: (
    profileId: string,
    downloadId: string,
    progress: number,
    receivedBytes: number,
    totalBytes: number,
  ) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };
      updatedProfile.downloads = (updatedProfile.downloads || []).map(
        download =>
          download.id === downloadId
            ? { ...download, progress, receivedBytes, totalBytes }
            : download,
      );

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  updateDownloadStatus: (
    profileId: string,
    downloadId: string,
    status: "downloading" | "completed" | "cancelled" | "error",
    exists: boolean,
  ) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };
      updatedProfile.downloads = (updatedProfile.downloads || []).map(
        download =>
          download.id === downloadId
            ? {
                ...download,
                status,
                exists,
                progress: status === "completed" ? 100 : download.progress,
              }
            : download,
      );

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  completeDownload: (profileId: string, downloadId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };
      updatedProfile.downloads = (updatedProfile.downloads || []).map(
        download =>
          download.id === downloadId
            ? { ...download, status: "completed", progress: 100 }
            : download,
      );

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  cancelDownload: (profileId: string, downloadId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };
      updatedProfile.downloads = (updatedProfile.downloads || []).map(
        download =>
          download.id === downloadId
            ? { ...download, status: "cancelled" }
            : download,
      );

      newProfiles.set(profileId, updatedProfile);
      return { profiles: newProfiles };
    });
    get().saveProfiles();
  },

  errorDownload: (profileId: string, downloadId: string) => {
    set(state => {
      const profile = state.profiles.get(profileId);
      if (!profile || !profile.downloads) return state;

      const newProfiles = new Map(state.profiles);
      const updatedProfile = { ...profile };
      updatedProfile.downloads = (updatedProfile.downloads || []).map(
        download =>
          download.id === downloadId
            ? { ...download, status: "error" }
            : download,
      );

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

  // Bookmark storage actions implementation
  storeImportedBookmarks: async (
    profileId: string,
    source: string,
    bookmarks: BookmarkEntry[],
  ) => {
    try {
      const bookmarkData: BookmarkImportData = {
        bookmarks,
        timestamp: Date.now(),
        source,
        count: bookmarks.length,
      };

      const key = `bookmarks.import.${source}`;
      await get().setSecureSetting(
        profileId,
        key,
        JSON.stringify(bookmarkData),
      );

      console.info(
        `Stored ${bookmarks.length} bookmarks from ${source} securely for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to store imported bookmarks from ${source}:`,
        error,
      );
      throw error;
    }
  },

  getImportedBookmarks: async (
    profileId: string,
    source?: string,
  ): Promise<BookmarkEntry[]> => {
    try {
      if (source) {
        const key = `bookmarks.import.${source}`;
        const encryptedData = await get().getSecureSetting(profileId, key);
        if (!encryptedData) return [];

        const bookmarkData: BookmarkImportData = JSON.parse(encryptedData);
        return bookmarkData.bookmarks || [];
      } else {
        const allSecureSettings = await get().getAllSecureSettings(profileId);
        const allBookmarks: BookmarkEntry[] = [];

        for (const [key, value] of Object.entries(allSecureSettings)) {
          if (key.startsWith("bookmarks.import.")) {
            try {
              const bookmarkData: BookmarkImportData = JSON.parse(value);
              allBookmarks.push(...(bookmarkData.bookmarks || []));
            } catch (error) {
              console.error(
                `Failed to parse bookmark data for key ${key}:`,
                error,
              );
            }
          }
        }

        return allBookmarks;
      }
    } catch (error) {
      console.error(`Failed to get imported bookmarks:`, error);
      return [];
    }
  },

  removeImportedBookmarks: async (profileId: string, source: string) => {
    try {
      const key = `bookmarks.import.${source}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed imported bookmarks from ${source} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to remove imported bookmarks from ${source}:`,
        error,
      );
      throw error;
    }
  },

  clearAllImportedBookmarks: async (profileId: string) => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const bookmarkKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("bookmarks.import."),
      );

      for (const key of bookmarkKeys) {
        const source = key.replace("bookmarks.import.", "");
        await get().removeImportedBookmarks(profileId, source);
      }

      console.info(`Cleared all imported bookmarks for profile ${profileId}`);
    } catch (error) {
      console.error("Failed to clear all imported bookmarks:", error);
      throw error;
    }
  },

  getBookmarkImportSources: async (profileId: string): Promise<string[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const sources = Object.keys(allSecureSettings)
        .filter(key => key.startsWith("bookmarks.import."))
        .map(key => key.replace("bookmarks.import.", ""));

      return sources;
    } catch (error) {
      console.error("Failed to get bookmark import sources:", error);
      return [];
    }
  },

  // Enhanced history storage actions implementation
  storeImportedHistory: async (
    profileId: string,
    source: string,
    history: NavigationHistoryEntry[],
  ) => {
    try {
      const historyData = {
        entries: history,
        timestamp: Date.now(),
        source,
        count: history.length,
      };

      const key = `history.import.${source}`;
      await get().setSecureSetting(profileId, key, JSON.stringify(historyData));

      console.info(
        `Stored ${history.length} history entries from ${source} securely for profile ${profileId}`,
      );
    } catch (error) {
      console.error(`Failed to store imported history from ${source}:`, error);
      throw error;
    }
  },

  getImportedHistory: async (
    profileId: string,
    source?: string,
  ): Promise<NavigationHistoryEntry[]> => {
    try {
      if (source) {
        const key = `history.import.${source}`;
        const encryptedData = await get().getSecureSetting(profileId, key);
        if (!encryptedData) return [];

        const historyData = JSON.parse(encryptedData);
        return historyData.entries || [];
      } else {
        const allSecureSettings = await get().getAllSecureSettings(profileId);
        const allHistory: NavigationHistoryEntry[] = [];

        for (const [key, value] of Object.entries(allSecureSettings)) {
          if (key.startsWith("history.import.")) {
            try {
              const historyData = JSON.parse(value);
              allHistory.push(...(historyData.entries || []));
            } catch (error) {
              console.error(
                `Failed to parse history data for key ${key}:`,
                error,
              );
            }
          }
        }

        return allHistory;
      }
    } catch (error) {
      console.error(`Failed to get imported history:`, error);
      return [];
    }
  },

  removeImportedHistory: async (profileId: string, source: string) => {
    try {
      const key = `history.import.${source}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed imported history from ${source} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(`Failed to remove imported history from ${source}:`, error);
      throw error;
    }
  },

  clearAllImportedHistory: async (profileId: string) => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const historyKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("history.import."),
      );

      for (const key of historyKeys) {
        const source = key.replace("history.import.", "");
        await get().removeImportedHistory(profileId, source);
      }

      console.info(`Cleared all imported history for profile ${profileId}`);
    } catch (error) {
      console.error("Failed to clear all imported history:", error);
      throw error;
    }
  },

  getHistoryImportSources: async (profileId: string): Promise<string[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const sources = Object.keys(allSecureSettings)
        .filter(key => key.startsWith("history.import."))
        .map(key => key.replace("history.import.", ""));

      return sources;
    } catch (error) {
      console.error("Failed to get history import sources:", error);
      return [];
    }
  },

  // Autofill storage actions implementation
  storeImportedAutofill: async (
    profileId: string,
    source: string,
    autofillData: AutofillImportData,
  ) => {
    try {
      const key = `autofill.import.${source}`;
      await get().setSecureSetting(
        profileId,
        key,
        JSON.stringify(autofillData),
      );

      console.info(
        `Stored ${autofillData.count} autofill items from ${source} securely for profile ${profileId}`,
      );
    } catch (error) {
      console.error(`Failed to store imported autofill from ${source}:`, error);
      throw error;
    }
  },

  getImportedAutofill: async (
    profileId: string,
    source?: string,
  ): Promise<AutofillImportData> => {
    try {
      if (source) {
        const key = `autofill.import.${source}`;
        const encryptedData = await get().getSecureSetting(profileId, key);
        if (!encryptedData)
          return { entries: [], profiles: [], timestamp: 0, source, count: 0 };

        const autofillData: AutofillImportData = JSON.parse(encryptedData);
        return autofillData;
      } else {
        const allSecureSettings = await get().getAllSecureSettings(profileId);
        const combinedData: AutofillImportData = {
          entries: [],
          profiles: [],
          timestamp: Date.now(),
          source: "combined",
          count: 0,
        };

        for (const [key, value] of Object.entries(allSecureSettings)) {
          if (key.startsWith("autofill.import.")) {
            try {
              const autofillData: AutofillImportData = JSON.parse(value);
              combinedData.entries.push(...(autofillData.entries || []));
              combinedData.profiles.push(...(autofillData.profiles || []));
            } catch (error) {
              console.error(
                `Failed to parse autofill data for key ${key}:`,
                error,
              );
            }
          }
        }

        combinedData.count =
          combinedData.entries.length + combinedData.profiles.length;
        return combinedData;
      }
    } catch (error) {
      console.error(`Failed to get imported autofill:`, error);
      return {
        entries: [],
        profiles: [],
        timestamp: 0,
        source: source || "error",
        count: 0,
      };
    }
  },

  removeImportedAutofill: async (profileId: string, source: string) => {
    try {
      const key = `autofill.import.${source}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed imported autofill from ${source} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to remove imported autofill from ${source}:`,
        error,
      );
      throw error;
    }
  },

  clearAllImportedAutofill: async (profileId: string) => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const autofillKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("autofill.import."),
      );

      for (const key of autofillKeys) {
        const source = key.replace("autofill.import.", "");
        await get().removeImportedAutofill(profileId, source);
      }

      console.info(`Cleared all imported autofill for profile ${profileId}`);
    } catch (error) {
      console.error("Failed to clear all imported autofill:", error);
      throw error;
    }
  },

  getAutofillImportSources: async (profileId: string): Promise<string[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const sources = Object.keys(allSecureSettings)
        .filter(key => key.startsWith("autofill.import."))
        .map(key => key.replace("autofill.import.", ""));

      return sources;
    } catch (error) {
      console.error("Failed to get autofill import sources:", error);
      return [];
    }
  },

  // Search engine storage actions implementation
  storeImportedSearchEngines: async (
    profileId: string,
    source: string,
    engines: SearchEngine[],
  ) => {
    try {
      const searchEngineData: SearchEngineImportData = {
        engines,
        timestamp: Date.now(),
        source,
        count: engines.length,
      };

      const key = `searchEngines.import.${source}`;
      await get().setSecureSetting(
        profileId,
        key,
        JSON.stringify(searchEngineData),
      );

      console.info(
        `Stored ${engines.length} search engines from ${source} securely for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to store imported search engines from ${source}:`,
        error,
      );
      throw error;
    }
  },

  getImportedSearchEngines: async (
    profileId: string,
    source?: string,
  ): Promise<SearchEngine[]> => {
    try {
      if (source) {
        const key = `searchEngines.import.${source}`;
        const encryptedData = await get().getSecureSetting(profileId, key);
        if (!encryptedData) return [];

        const searchEngineData: SearchEngineImportData =
          JSON.parse(encryptedData);
        return searchEngineData.engines || [];
      } else {
        const allSecureSettings = await get().getAllSecureSettings(profileId);
        const allSearchEngines: SearchEngine[] = [];

        for (const [key, value] of Object.entries(allSecureSettings)) {
          if (key.startsWith("searchEngines.import.")) {
            try {
              const searchEngineData: SearchEngineImportData =
                JSON.parse(value);
              allSearchEngines.push(...(searchEngineData.engines || []));
            } catch (error) {
              console.error(
                `Failed to parse search engine data for key ${key}:`,
                error,
              );
            }
          }
        }

        return allSearchEngines;
      }
    } catch (error) {
      console.error(`Failed to get imported search engines:`, error);
      return [];
    }
  },

  removeImportedSearchEngines: async (profileId: string, source: string) => {
    try {
      const key = `searchEngines.import.${source}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed imported search engines from ${source} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(
        `Failed to remove imported search engines from ${source}:`,
        error,
      );
      throw error;
    }
  },

  clearAllImportedSearchEngines: async (profileId: string) => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const searchEngineKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("searchEngines.import."),
      );

      for (const key of searchEngineKeys) {
        const source = key.replace("searchEngines.import.", "");
        await get().removeImportedSearchEngines(profileId, source);
      }

      console.info(
        `Cleared all imported search engines for profile ${profileId}`,
      );
    } catch (error) {
      console.error("Failed to clear all imported search engines:", error);
      throw error;
    }
  },

  getSearchEngineImportSources: async (
    profileId: string,
  ): Promise<string[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const sources = Object.keys(allSecureSettings)
        .filter(key => key.startsWith("searchEngines.import."))
        .map(key => key.replace("searchEngines.import.", ""));

      return sources;
    } catch (error) {
      console.error("Failed to get search engine import sources:", error);
      return [];
    }
  },

  // Comprehensive import actions implementation
  storeComprehensiveImport: async (
    profileId: string,
    importData: ComprehensiveImportData,
  ) => {
    try {
      const key = `comprehensive.import.${importData.source}.${importData.timestamp}`;
      await get().setSecureSetting(profileId, key, JSON.stringify(importData));

      console.info(
        `Stored comprehensive import from ${importData.source} with ${importData.totalItems} total items for profile ${profileId}`,
      );
    } catch (error) {
      console.error(`Failed to store comprehensive import:`, error);
      throw error;
    }
  },

  getComprehensiveImportHistory: async (
    profileId: string,
    source?: string,
  ): Promise<ComprehensiveImportData[]> => {
    try {
      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const importHistory: ComprehensiveImportData[] = [];

      for (const [key, value] of Object.entries(allSecureSettings)) {
        if (key.startsWith("comprehensive.import.")) {
          try {
            const importData: ComprehensiveImportData = JSON.parse(value);
            if (!source || importData.source === source) {
              importHistory.push(importData);
            }
          } catch (error) {
            console.error(
              `Failed to parse comprehensive import data for key ${key}:`,
              error,
            );
          }
        }
      }

      return importHistory.sort((a, b) => b.timestamp - a.timestamp);
    } catch (error) {
      console.error(`Failed to get comprehensive import history:`, error);
      return [];
    }
  },

  removeComprehensiveImport: async (
    profileId: string,
    source: string,
    timestamp: number,
  ) => {
    try {
      const key = `comprehensive.import.${source}.${timestamp}`;
      await get().removeSecureSetting(profileId, key);
      console.info(
        `Removed comprehensive import from ${source} at ${timestamp} for profile ${profileId}`,
      );
    } catch (error) {
      console.error(`Failed to remove comprehensive import:`, error);
      throw error;
    }
  },

  clearAllImportData: async (profileId: string) => {
    try {
      await Promise.all([
        get().clearAllImportedPasswords(profileId),
        get().clearAllImportedBookmarks(profileId),
        get().clearAllImportedHistory(profileId),
        get().clearAllImportedAutofill(profileId),
        get().clearAllImportedSearchEngines(profileId),
      ]);

      const allSecureSettings = await get().getAllSecureSettings(profileId);
      const comprehensiveKeys = Object.keys(allSecureSettings).filter(key =>
        key.startsWith("comprehensive.import."),
      );

      for (const key of comprehensiveKeys) {
        await get().removeSecureSetting(profileId, key);
      }

      console.info(`Cleared all import data for profile ${profileId}`);
    } catch (error) {
      console.error("Failed to clear all import data:", error);
      throw error;
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
    console.log("[Profile Debug] loadProfiles called");
    try {
      const profilesPath = getUserProfilesPath();
      console.log("[Profile Debug] Profiles path:", profilesPath);

      if (await fs.pathExists(profilesPath)) {
        console.log("[Profile Debug] Profiles file exists, loading...");
        const data = await fs.readJson(profilesPath);
        console.log("[Profile Debug] Loaded profiles data:", {
          hasProfiles: !!data.profiles,
          profilesCount: data.profiles?.length || 0,
          activeProfileId: data.activeProfileId,
        });

        const profiles = new Map<string, UserProfile>();
        if (data.profiles && Array.isArray(data.profiles)) {
          data.profiles.forEach((profile: UserProfile) => {
            // Ensure backward compatibility by initializing missing arrays
            if (!profile.downloads) profile.downloads = [];
            if (!profile.bookmarks) profile.bookmarks = [];
            if (!profile.autofillEntries) profile.autofillEntries = [];
            if (!profile.autofillProfiles) profile.autofillProfiles = [];
            if (!profile.searchEngines) profile.searchEngines = [];
            if (!profile.importHistory)
              profile.importHistory = {
                passwords: [],
                bookmarks: [],
                history: [],
                autofill: [],
                searchEngines: [],
              };
            if (!profile.settings)
              profile.settings = {
                defaultSearchEngine: "google",
                theme: "system",
              };
            if (!profile.secureSettings) profile.secureSettings = {};

            profiles.set(profile.id, profile);
            console.log("[Profile Debug] Loaded profile:", {
              id: profile.id,
              name: profile.name,
              downloadsCount: profile.downloads?.length || 0,
            });
          });
        }

        set({
          profiles,
          activeProfileId: data.activeProfileId || null,
        });

        console.log("[Profile Debug] Set profiles in store:", {
          profilesSize: profiles.size,
          activeProfileId: data.activeProfileId || null,
        });

        // Recreate sessions for loaded profiles
        for (const [profileId] of profiles) {
          get().createSessionForProfile(profileId);
        }
        logger.info(`Recreated sessions for ${profiles.size} profiles`);

        // Create default profile if none exist
        if (profiles.size === 0) {
          console.log(
            "[Profile Debug] No profiles found, creating default profile",
          );
          get().createProfile("Default");
        }
      } else {
        console.log(
          "[Profile Debug] Profiles file does not exist, creating default profile",
        );
        // Create default profile on first run
        get().createProfile("Default");
      }
    } catch (error) {
      console.error("Failed to load user profiles:", error);
      console.log(
        "[Profile Debug] Error loading profiles, creating default profile",
      );
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

    // Clean up all sessions
    for (const [profileId] of state.profileSessions) {
      get().destroySessionForProfile(profileId);
    }

    set({
      saveTimer: undefined,
      isInitialized: false,
      initializationPromise: null,
      lastError: null,
    });
  },

  // Simple interface implementations (auto-uses active profile)
  visitPage: (url: string, title: string) => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      get().addNavigationEntry(activeProfile.id, {
        url,
        title,
        timestamp: Date.now(),
      });
    }
  },

  searchHistory: (query: string, limit: number = 10) => {
    const activeProfile = get().getActiveProfile();
    if (!activeProfile) return [];
    return get().getNavigationHistory(activeProfile.id, query, limit);
  },

  clearHistory: () => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      get().clearNavigationHistory(activeProfile.id);
    }
  },

  recordDownload: (fileName: string, filePath: string) => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      get().addDownloadEntry(activeProfile.id, {
        fileName,
        filePath,
        createdAt: Date.now(),
      });
    }
  },

  getDownloads: () => {
    const activeProfile = get().getActiveProfile();
    if (!activeProfile) return [];
    return get().getDownloadHistory(activeProfile.id);
  },

  clearDownloads: () => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      get().clearDownloadHistory(activeProfile.id);
    }
  },

  setSetting: (key: string, value: any) => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      const updatedSettings = {
        ...activeProfile.settings,
        [key]: value,
      };
      get().updateProfile(activeProfile.id, { settings: updatedSettings });
    }
  },

  getSetting: (key: string, defaultValue?: any) => {
    const activeProfile = get().getActiveProfile();
    if (!activeProfile || !activeProfile.settings) return defaultValue;
    return activeProfile.settings[key] ?? defaultValue;
  },

  getPasswords: async () => {
    const activeProfile = get().getActiveProfile();
    if (!activeProfile) return [];
    return get().getImportedPasswords(activeProfile.id);
  },

  importPasswordsFromBrowser: async (
    source: string,
    passwords: ImportedPasswordEntry[],
  ) => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      await get().storeImportedPasswords(activeProfile.id, source, passwords);
    }
  },

  clearPasswords: async () => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      await get().clearAllImportedPasswords(activeProfile.id);
    }
  },

  getBookmarks: async () => {
    const activeProfile = get().getActiveProfile();
    if (!activeProfile) return [];
    return get().getImportedBookmarks(activeProfile.id);
  },

  importBookmarksFromBrowser: async (
    source: string,
    bookmarks: BookmarkEntry[],
  ) => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      await get().storeImportedBookmarks(activeProfile.id, source, bookmarks);
    }
  },

  clearBookmarks: async () => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      await get().clearAllImportedBookmarks(activeProfile.id);
    }
  },

  clearAllData: async () => {
    const activeProfile = get().getActiveProfile();
    if (activeProfile) {
      // Clear all user data
      get().clearNavigationHistory(activeProfile.id);
      get().clearDownloadHistory(activeProfile.id);
      await get().clearAllImportData(activeProfile.id);

      // Reset settings to defaults
      get().updateProfile(activeProfile.id, {
        settings: {
          defaultSearchEngine: "google",
          theme: "system",
          clearHistoryOnExit: false,
          clearCookiesOnExit: false,
          clearDownloadsOnExit: false,
          enableAutofill: true,
          enablePasswordSaving: true,
          showBookmarksBar: true,
          newTabPageType: "blank",
          searchSuggestions: true,
          askWhereToSave: true,
        },
      });
    }
  },

  getCurrentProfile: () => {
    return get().getActiveProfile();
  },

  switchProfile: (profileId: string) => {
    get().setActiveProfile(profileId);
  },

  createNewProfile: (name: string) => {
    return get().createProfile(name);
  },

  // Session management implementation
  createSessionForProfile: (profileId: string): Electron.Session => {
    const state = get();

    // Check if session already exists
    const existingSession = state.profileSessions.get(profileId);
    if (existingSession) {
      logger.debug(`Session already exists for profile ${profileId}`);
      return existingSession;
    }

    // Create new session with profile-specific partition
    const partition = `persist:${profileId}`;
    const profileSession = session.fromPartition(partition, { cache: true });

    logger.info(
      `Created session for profile ${profileId} with partition ${partition}`,
    );

    // Store the session
    set(state => {
      const newSessions = new Map(state.profileSessions);
      newSessions.set(profileId, profileSession);
      return { profileSessions: newSessions };
    });

    // Store session reference in profile
    const profile = state.profiles.get(profileId);
    if (profile) {
      profile.session = profileSession;
    }

    // Call all registered callbacks
    state.sessionCreatedCallbacks.forEach(callback => {
      try {
        callback(profileId, profileSession);
      } catch (error) {
        logger.error(`Error in session created callback: ${error}`);
      }
    });

    return profileSession;
  },

  destroySessionForProfile: (profileId: string): void => {
    const state = get();
    const profileSession = state.profileSessions.get(profileId);

    if (!profileSession) {
      logger.warn(`No session found for profile ${profileId}`);
      return;
    }

    // Clear session data
    profileSession.clearStorageData();
    profileSession.clearCache();

    // Remove from maps
    set(state => {
      const newSessions = new Map(state.profileSessions);
      newSessions.delete(profileId);

      const profile = state.profiles.get(profileId);
      if (profile) {
        delete profile.session;
      }

      return { profileSessions: newSessions };
    });

    logger.info(`Destroyed session for profile ${profileId}`);
  },

  getSessionForProfile: (profileId: string): Electron.Session => {
    const state = get();

    // Return existing session if available
    const existingSession = state.profileSessions.get(profileId);
    if (existingSession) {
      return existingSession;
    }

    // Create new session if it doesn't exist
    logger.debug(
      `Session not found for profile ${profileId}, creating new one`,
    );
    return get().createSessionForProfile(profileId);
  },

  getActiveSession: (): Electron.Session => {
    const state = get();

    if (!state.activeProfileId) {
      logger.warn("No active profile, returning default session");
      return session.defaultSession;
    }

    return get().getSessionForProfile(state.activeProfileId);
  },

  getAllSessions: (): Map<string, Electron.Session> => {
    return new Map(get().profileSessions);
  },

  onSessionCreated: (
    callback: (profileId: string, session: Electron.Session) => void,
  ): void => {
    set(state => ({
      sessionCreatedCallbacks: [...state.sessionCreatedCallbacks, callback],
    }));
  },
}));

// Store initialization will be done explicitly after app is ready
// DO NOT initialize automatically on import to avoid race conditions
