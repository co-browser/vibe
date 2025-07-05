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
