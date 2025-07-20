/**
 * Services exports
 * Provides the simplified service interfaces
 */

// Export the new simplified profile service
export { ProfileService, getProfileService } from "./profile-service";
export type {
  Profile,
  ProfileSettings,
  BrowsingHistoryEntry,
  SavedPassword,
} from "./profile-service";

// Export the AppUpdater service
import AppUpdater from "./update-service";
export { AppUpdater };

/**
 * Get the singleton AppUpdater instance
 */
export function getAppUpdater(): AppUpdater | null {
  try {
    return AppUpdater.getInstance();
  } catch (error) {
    console.error("Failed to get AppUpdater instance:", error);
    return null;
  }
}
