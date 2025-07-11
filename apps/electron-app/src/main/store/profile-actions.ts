/**
 * Simple Profile Actions Interface
 *
 * This provides a clean, intuitive API for common profile operations
 * without requiring knowledge of internal profileId management.
 * All actions automatically use the currently active profile.
 */

import { useUserProfileStore } from "./user-profile-store";
import type {
  ImportedPasswordEntry,
  BookmarkEntry,
  NavigationHistoryEntry,
  DownloadHistoryItem,
  UserProfile,
} from "./user-profile-store";

/**
 * Get the profile store instance
 */
const getStore = () => useUserProfileStore.getState();

// =============================================================================
// NAVIGATION & HISTORY
// =============================================================================

/**
 * Record a page visit in the user's browsing history
 * @param url - The URL that was visited
 * @param title - The page title
 */
export const visitPage = (url: string, title: string): void => {
  getStore().visitPage(url, title);
};

/**
 * Search the user's browsing history
 * @param query - Search term to filter by URL or title
 * @param limit - Maximum number of results (default: 10)
 * @returns Array of matching history entries
 */
export const searchHistory = (
  query: string,
  limit?: number,
): NavigationHistoryEntry[] => {
  return getStore().searchHistory(query, limit);
};

/**
 * Clear all browsing history for the current user
 */
export const clearHistory = (): void => {
  getStore().clearHistory();
};

// =============================================================================
// DOWNLOADS
// =============================================================================

/**
 * Record a completed download
 * @param fileName - Name of the downloaded file
 * @param filePath - Full path where the file was saved
 */
export const recordDownload = (fileName: string, filePath: string): void => {
  getStore().recordDownload(fileName, filePath);
};

/**
 * Get all downloads for the current user
 * @returns Array of download history items
 */
export const getDownloads = (): DownloadHistoryItem[] => {
  return getStore().getDownloads();
};

/**
 * Clear all download history for the current user
 */
export const clearDownloads = (): void => {
  getStore().clearDownloads();
};

// =============================================================================
// SETTINGS & PREFERENCES
// =============================================================================

/**
 * Set a user preference/setting
 * @param key - Setting name (e.g., 'theme', 'defaultSearchEngine')
 * @param value - Setting value
 */
export const setSetting = (key: string, value: any): void => {
  getStore().setSetting(key, value);
};

/**
 * Get a user preference/setting
 * @param key - Setting name
 * @param defaultValue - Value to return if setting doesn't exist
 * @returns The setting value or default
 */
export const getSetting = (key: string, defaultValue?: any): any => {
  return getStore().getSetting(key, defaultValue);
};

// Common setting shortcuts
export const setTheme = (theme: "light" | "dark" | "system"): void =>
  setSetting("theme", theme);
export const getTheme = (): string => getSetting("theme", "system");
export const setDefaultSearchEngine = (engine: string): void =>
  setSetting("defaultSearchEngine", engine);
export const getDefaultSearchEngine = (): string =>
  getSetting("defaultSearchEngine", "google");

// =============================================================================
// PASSWORDS
// =============================================================================

/**
 * Get all saved passwords for the current user
 * @returns Promise resolving to array of password entries
 */
export const getPasswords = async (): Promise<ImportedPasswordEntry[]> => {
  return getStore().getPasswords();
};

/**
 * Import passwords from a browser
 * @param source - Browser source (e.g., 'chrome', 'firefox')
 * @param passwords - Array of password entries to import
 */
export const importPasswordsFromBrowser = async (
  source: string,
  passwords: ImportedPasswordEntry[],
): Promise<void> => {
  return getStore().importPasswordsFromBrowser(source, passwords);
};

/**
 * Clear all saved passwords for the current user
 */
export const clearPasswords = async (): Promise<void> => {
  return getStore().clearPasswords();
};

// =============================================================================
// BOOKMARKS
// =============================================================================

/**
 * Get all bookmarks for the current user
 * @returns Promise resolving to array of bookmark entries
 */
export const getBookmarks = async (): Promise<BookmarkEntry[]> => {
  return getStore().getBookmarks();
};

/**
 * Import bookmarks from a browser
 * @param source - Browser source (e.g., 'chrome', 'firefox')
 * @param bookmarks - Array of bookmark entries to import
 */
export const importBookmarksFromBrowser = async (
  source: string,
  bookmarks: BookmarkEntry[],
): Promise<void> => {
  return getStore().importBookmarksFromBrowser(source, bookmarks);
};

/**
 * Clear all bookmarks for the current user
 */
export const clearBookmarks = async (): Promise<void> => {
  return getStore().clearBookmarks();
};

// =============================================================================
// PRIVACY & DATA MANAGEMENT
// =============================================================================

/**
 * Clear ALL user data (history, downloads, passwords, bookmarks, etc.)
 * This resets the profile to a clean state
 */
export const clearAllData = async (): Promise<void> => {
  return getStore().clearAllData();
};

// =============================================================================
// PROFILE MANAGEMENT
// =============================================================================

/**
 * Get the current active profile
 * @returns Current user profile or undefined if none active
 */
export const getCurrentProfile = (): UserProfile | undefined => {
  return getStore().getCurrentProfile();
};

/**
 * Switch to a different profile
 * @param profileId - ID of the profile to switch to
 */
export const switchProfile = (profileId: string): void => {
  getStore().switchProfile(profileId);
};

/**
 * Create a new user profile
 * @param name - Name for the new profile
 * @returns ID of the newly created profile
 */
export const createNewProfile = (name: string): string => {
  return getStore().createNewProfile(name);
};

/**
 * Get the current profile name
 * @returns Name of the current profile or 'Unknown' if none active
 */
export const getCurrentProfileName = (): string => {
  const profile = getCurrentProfile();
  return profile?.name || "Unknown";
};

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Check if the profile store is ready for use
 * @returns True if the store is initialized and ready
 */
export const isProfileStoreReady = (): boolean => {
  return getStore().isStoreReady();
};

/**
 * Initialize the profile store (call once at app startup)
 * @returns Promise that resolves when initialization is complete
 */
export const initializeProfileStore = async (): Promise<void> => {
  return getStore().initialize();
};

// =============================================================================
// EXAMPLE USAGE
// =============================================================================

/*
// Basic usage examples:

// Record user activity
visitPage('https://example.com', 'Example Website');
recordDownload('document.pdf', '/Downloads/document.pdf');

// Manage settings
setTheme('dark');
setSetting('enableNotifications', true);
const userTheme = getTheme();

// Work with passwords
const passwords = await getPasswords();
await importPasswordsFromBrowser('chrome', chromePasswords);

// Search and clear data
const searchResults = searchHistory('github');
await clearAllData(); // Nuclear option - clears everything

// Profile management
const currentUser = getCurrentProfileName();
const newProfileId = createNewProfile('Work');
switchProfile(newProfileId);
*/
