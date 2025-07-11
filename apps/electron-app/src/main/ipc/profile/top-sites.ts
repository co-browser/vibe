import { ipcMain } from "electron";
import { useUserProfileStore } from "@/store/user-profile-store";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("top-sites");

export function registerTopSitesHandlers(): void {
  ipcMain.handle("profile:get-top-sites", async (_, limit: number = 3) => {
    try {
      const userProfileStore = useUserProfileStore.getState();
      const activeProfile = userProfileStore.getActiveProfile();

      if (!activeProfile) {
        return { success: false, sites: [] };
      }

      // Get navigation history
      const history = activeProfile.navigationHistory || [];

      // Count visits per domain
      const siteVisits = new Map<
        string,
        {
          url: string;
          title: string;
          visitCount: number;
          lastVisit: number;
        }
      >();

      history.forEach(entry => {
        try {
          const url = new URL(entry.url);
          const domain = url.hostname;

          const existing = siteVisits.get(domain);
          if (existing) {
            existing.visitCount++;
            existing.lastVisit = Math.max(existing.lastVisit, entry.timestamp);
            // Update title if the new one is better (not empty)
            if (entry.title && entry.title.trim()) {
              existing.title = entry.title;
            }
          } else {
            siteVisits.set(domain, {
              url: entry.url,
              title: entry.title || domain,
              visitCount: 1,
              lastVisit: entry.timestamp,
            });
          }
        } catch {
          // Skip invalid URLs
          logger.debug("Skipping invalid URL:", entry.url);
        }
      });

      // Sort by visit count and get top sites
      const topSites = Array.from(siteVisits.values())
        .sort((a, b) => {
          // First sort by visit count
          if (b.visitCount !== a.visitCount) {
            return b.visitCount - a.visitCount;
          }
          // Then by last visit time
          return b.lastVisit - a.lastVisit;
        })
        .slice(0, limit)
        .map(site => ({
          url: site.url,
          title: site.title,
          visitCount: site.visitCount,
          // TODO: Add favicon support
          favicon: undefined,
        }));

      return {
        success: true,
        sites: topSites,
      };
    } catch (error) {
      logger.error("Failed to get top sites:", error);
      return { success: false, sites: [] };
    }
  });
}
