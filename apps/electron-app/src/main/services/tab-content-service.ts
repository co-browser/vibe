import { createLogger } from "@vibe/shared-types";
import type { TabState } from "@vibe/shared-types";
import type { TabContentFilter, TabContextMessage } from "@vibe/shared-types";
import { CDPConnector, getCurrentPageContent } from "@vibe/tab-extraction-core";
import type { TabManager } from "../browser/tab-manager";
import type { ViewManager } from "../browser/view-manager";
import type { CDPManager } from "./cdp-service";

const logger = createLogger("TabContentService");

/**
 * Service for extracting and managing tab content for LLM context
 */
// Constants
const CACHE_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const MAX_LENGTH_SINGLE_TAB = 8000;
const MAX_LENGTH_MULTIPLE_TABS = 4000;

export class TabContentService {
  private contentCache: Map<string, TabContextMessage> = new Map();
  private readonly cacheTimeout = CACHE_TIMEOUT_MS;
  private cdpConnector: CDPConnector | null = null;

  constructor(
    private tabManager: TabManager,
    private viewManager: ViewManager,
    private cdpManager?: CDPManager,
  ) {}

  /**
   * Extract content from specified tabs
   */
  public async extractTabContent(
    tabKeys: string[],
  ): Promise<TabContextMessage[]> {
    const results: TabContextMessage[] = [];

    // If multiple tabs are requested, use a smaller max length per tab
    const maxLengthPerTab =
      tabKeys.length > 1 ? MAX_LENGTH_MULTIPLE_TABS : MAX_LENGTH_SINGLE_TAB;

    for (const tabKey of tabKeys) {
      try {
        const content = await this.extractSingleTabContent(
          tabKey,
          maxLengthPerTab,
        );
        if (content) {
          results.push(content);
        }
      } catch (error) {
        logger.error(`Failed to extract content for tab ${tabKey}:`, error);
        // Re-throw to ensure proper error propagation
        throw error;
      }
    }

    return results;
  }

  /**
   * Extract content from a single tab
   */
  private async extractSingleTabContent(
    tabKey: string,
    maxLength: number = 8000,
  ): Promise<TabContextMessage | null> {
    // Check cache first
    const cached = this.contentCache.get(tabKey);
    if (
      cached &&
      cached.metadata &&
      Date.now() - cached.metadata.extractedAt < this.cacheTimeout
    ) {
      logger.debug(`Using cached content for tab ${tabKey}`);
      return cached;
    }

    const tab = this.tabManager.getTab(tabKey);
    if (!tab) {
      logger.warn(`Tab ${tabKey} not found`);
      return null;
    }

    // Skip sleeping tabs
    if (tab.asleep) {
      logger.debug(`Skipping sleeping tab ${tabKey}`);
      return null;
    }

    const view = this.viewManager.getView(tabKey);
    if (!view || view.webContents.isDestroyed()) {
      logger.warn(`No valid view for tab ${tabKey}`);
      return null;
    }

    try {
      // Initialize CDP connector if needed
      if (!this.cdpConnector) {
        this.cdpConnector = new CDPConnector("localhost", 9223);
      }

      // Get CDP target ID
      if (!this.cdpManager) {
        logger.warn(`No CDP manager available for tab ${tabKey}`);
        // Try to extract content without CDP (fallback)
        return this.createFallbackContext(tab);
      }

      const cdpTargetId = await this.cdpManager.getTargetId(view.webContents);
      if (!cdpTargetId) {
        logger.warn(`No CDP target for tab ${tabKey}`);
        // Try to extract content without CDP (fallback)
        return this.createFallbackContext(tab);
      }

      // Extract content
      logger.debug(`Extracting content for tab ${tabKey} (${tab.title})`);

      const pageContent = await getCurrentPageContent(
        {
          format: "markdown",
          includeMetadata: true,
          includeActions: false,
          cdpTargetId: cdpTargetId,
          url: tab.url,
        },
        this.cdpConnector,
      );

      if ("isError" in pageContent) {
        logger.warn(
          `Content extraction failed for tab ${tabKey}:`,
          pageContent,
        );
        return null;
      }

      if (!pageContent.content) {
        logger.warn(`No content extracted for tab ${tabKey}`);
        return null;
      }

      logger.debug(
        `Successfully extracted ${pageContent.content.length} chars from tab ${tabKey}`,
      );

      // Create context message
      const contextMessage: TabContextMessage = {
        tabAlias: `@${this.getTabAlias(tab)}`,
        url: tab.url,
        title: tab.title || "Untitled",
        content: this.truncateContent(pageContent.content, maxLength),
        metadata: {
          extractedAt: Date.now(),
          contentLength: pageContent.content.length,
          contentType: "markdown",
        },
      };

      // Cache the result
      this.contentCache.set(tabKey, contextMessage);

      return contextMessage;
    } catch (error) {
      logger.error(`Content extraction error for tab ${tabKey}:`, error);
      return null;
    }
  }

  /**
   * Get tab alias from URL (temporary until TabAliasService is integrated)
   */
  private getTabAlias(tab: TabState): string {
    try {
      const url = new URL(tab.url);
      return url.hostname.replace("www.", "").toLowerCase();
    } catch {
      return "unknown";
    }
  }

  /**
   * Truncate content to reasonable size for LLM context
   */
  private truncateContent(content: string, maxLength: number = 8000): string {
    if (content.length <= maxLength) {
      return content;
    }

    // Try to truncate at a reasonable boundary
    const truncated = content.substring(0, maxLength);
    const lastNewline = truncated.lastIndexOf("\n");

    if (lastNewline > maxLength * 0.8) {
      return truncated.substring(0, lastNewline) + "\n\n[Content truncated...]";
    }

    return truncated + "\n\n[Content truncated...]";
  }

  /**
   * Filter and extract content based on tab filters
   */
  public async filterAndExtractContent(
    filters: TabContentFilter[],
  ): Promise<TabContextMessage[]> {
    const tabsToExtract = filters
      .filter(f => f.includeInPrompt)
      .map(f => f.tabKey);

    return this.extractTabContent(tabsToExtract);
  }

  /**
   * Clear content cache
   */
  public clearCache(tabKey?: string): void {
    if (tabKey) {
      this.contentCache.delete(tabKey);
      logger.debug(`Cleared cache for tab ${tabKey}`);
    } else {
      this.contentCache.clear();
      logger.debug("Cleared all content cache");
    }
  }

  /**
   * Create fallback context when CDP extraction fails
   */
  private createFallbackContext(tab: TabState): TabContextMessage {
    const contextMessage: TabContextMessage = {
      tabAlias: `@${this.getTabAlias(tab)}`,
      url: tab.url,
      title: tab.title || "Untitled",
      content: `Unable to extract content from this tab. The tab shows: ${tab.title} at ${tab.url}`,
      metadata: {
        extractedAt: Date.now(),
        contentLength: 0,
        contentType: "fallback",
      },
    };

    logger.info(`Created fallback context for tab ${tab.key}`);
    return contextMessage;
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    this.contentCache.clear();
    if (this.cdpConnector) {
      try {
        // CDP connector disconnect method doesn't require parameters in this context
        // The connector manages its own connections internally
      } catch (error) {
        logger.error("Error disconnecting CDP connector:", error);
      }
      this.cdpConnector = null;
    }
  }
}
