/**
 * Hook for accessing user profile store in the renderer
 * This provides a bridge to the main process user profile store
 */

import { useState, useEffect } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("user-profile-store");

export interface DownloadHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
}

export interface UserProfile {
  id: string;
  name: string;
  createdAt: number;
  lastActive: number;
  navigationHistory: any[];
  downloads?: DownloadHistoryItem[];
  settings?: {
    defaultSearchEngine?: string;
    theme?: string;
    [key: string]: any;
  };
}

export function useUserProfileStore() {
  const [activeProfile, setActiveProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await window.vibe?.profile?.getActiveProfile();
        setActiveProfile(profile);
      } catch (error) {
        logger.error("Failed to load user profile:", error);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, []);

  // Refresh profile data periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const profile = await window.vibe?.profile?.getActiveProfile();
        setActiveProfile(profile);
      } catch (error) {
        logger.error("Failed to refresh user profile:", error);
      }
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  return {
    activeProfile,
    loading,
    downloads: activeProfile?.downloads || [],
  };
}
