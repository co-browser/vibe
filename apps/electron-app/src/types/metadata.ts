/**
 * Metadata type definitions for suggestion and navigation systems
 * Provides proper type safety for metadata structures used throughout the application
 */

/**
 * Base metadata interface that all metadata types extend
 */
export interface BaseMetadata {
  /** Timestamp when the metadata was created or last updated */
  timestamp?: number;
  /** Additional context or debugging information */
  debug?: Record<string, unknown>;
}

/**
 * Navigation history metadata containing visit tracking information
 */
export interface NavigationHistoryMetadata extends BaseMetadata {
  /** URL of the navigation entry */
  url: string;
  /** Page title */
  title?: string;
  /** Number of times this URL has been visited */
  visitCount: number;
  /** Timestamp of the last visit */
  lastVisit: number;
  /** Favicon URL if available */
  favicon?: string;
  /** Visit duration information */
  visitDuration?: {
    /** Average time spent on this page (in milliseconds) */
    average: number;
    /** Total time spent across all visits (in milliseconds) */
    total: number;
    /** Last session duration (in milliseconds) */
    lastSession: number;
  };
  /** Search query that led to this page, if any */
  referrerQuery?: string;
  /** Page content type or category */
  contentType?:
    | "article"
    | "video"
    | "social"
    | "search"
    | "productivity"
    | "other";
}

/**
 * Agent action metadata for AI-powered suggestions
 */
export interface AgentActionMetadata extends BaseMetadata {
  /** Type of agent action */
  action:
    | "ask-agent"
    | "explain-page"
    | "summarize"
    | "translate"
    | "extract-data"
    | "custom";
  /** Query or prompt for the agent */
  query?: string;
  /** Context information for the agent */
  context?: {
    /** Current page URL */
    pageUrl?: string;
    /** Selected text or content */
    selectedText?: string;
    /** Page title */
    pageTitle?: string;
    /** Content type being processed */
    contentType?: string;
  };
  /** Expected response format */
  responseFormat?: "text" | "markdown" | "json" | "structured";
  /** Priority level for the request */
  priority?: "low" | "normal" | "high" | "urgent";
}

/**
 * Search suggestion metadata for search engine results
 */
export interface SearchSuggestionMetadata extends BaseMetadata {
  /** Search engine or source */
  source: "perplexity" | "google" | "bing" | "duckduckgo" | "local" | "custom";
  /** Search query that generated this suggestion */
  query: string;
  /** Search result ranking/score */
  ranking?: number;
  /** Additional search context */
  searchContext?: {
    /** Search filters applied */
    filters?: string[];
    /** Search type (web, images, videos, etc.) */
    searchType?: string;
    /** Region or language settings */
    locale?: string;
  };
  /** Result snippet or preview */
  snippet?: string;
  /** Confidence score for the suggestion */
  confidence?: number;
}

/**
 * Context suggestion metadata for tab/content suggestions
 */
export interface ContextSuggestionMetadata extends BaseMetadata {
  /** Tab or window identifier */
  tabId?: string;
  /** Window identifier */
  windowId?: string;
  /** Content type of the suggestion */
  contentType:
    | "tab"
    | "bookmark"
    | "download"
    | "clipboard"
    | "file"
    | "application";
  /** Application or service providing the context */
  source?: string;
  /** Whether the context is currently active/visible */
  isActive?: boolean;
  /** Last access or modification time */
  lastAccessed?: number;
  /** Size or importance indicator */
  weight?: number;
}

/**
 * Bookmark metadata for bookmark suggestions
 */
export interface BookmarkMetadata extends BaseMetadata {
  /** Bookmark folder or category */
  folder?: string;
  /** Tags associated with the bookmark */
  tags?: string[];
  /** Bookmark description or notes */
  description?: string;
  /** Date when bookmark was created */
  dateAdded?: number;
  /** Date when bookmark was last modified */
  dateModified?: number;
  /** Usage frequency */
  accessCount?: number;
  /** Last access time */
  lastAccessed?: number;
}

/**
 * Performance metadata for tracking suggestion performance
 */
export interface PerformanceMetadata extends BaseMetadata {
  /** Time taken to generate the suggestion (in milliseconds) */
  generationTime?: number;
  /** Source of the suggestion (cache, API, local, etc.) */
  source?: "cache" | "api" | "local" | "computed";
  /** Cache hit/miss information */
  cacheStatus?: "hit" | "miss" | "expired" | "invalidated";
  /** Quality score of the suggestion */
  qualityScore?: number;
  /** User interaction data */
  interactions?: {
    /** Number of times this suggestion was shown */
    impressions: number;
    /** Number of times this suggestion was clicked */
    clicks: number;
    /** Click-through rate */
    ctr: number;
  };
}

/**
 * Union type for all possible metadata types
 */
export type SuggestionMetadata =
  | NavigationHistoryMetadata
  | AgentActionMetadata
  | SearchSuggestionMetadata
  | ContextSuggestionMetadata
  | BookmarkMetadata
  | PerformanceMetadata
  | BaseMetadata;

/**
 * Type-safe metadata helper functions
 */
export class MetadataHelpers {
  /**
   * Type guard to check if metadata is navigation history metadata
   */
  static isNavigationHistoryMetadata(
    metadata: unknown,
  ): metadata is NavigationHistoryMetadata {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "url" in metadata &&
      "visitCount" in metadata &&
      "lastVisit" in metadata
    );
  }

  /**
   * Type guard to check if metadata is agent action metadata
   */
  static isAgentActionMetadata(
    metadata: unknown,
  ): metadata is AgentActionMetadata {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "action" in metadata &&
      typeof (metadata as any).action === "string"
    );
  }

  /**
   * Type guard to check if metadata is search suggestion metadata
   */
  static isSearchSuggestionMetadata(
    metadata: unknown,
  ): metadata is SearchSuggestionMetadata {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "source" in metadata &&
      "query" in metadata
    );
  }

  /**
   * Type guard to check if metadata is context suggestion metadata
   */
  static isContextSuggestionMetadata(
    metadata: unknown,
  ): metadata is ContextSuggestionMetadata {
    return (
      typeof metadata === "object" &&
      metadata !== null &&
      "contentType" in metadata &&
      typeof (metadata as any).contentType === "string"
    );
  }

  /**
   * Creates base metadata with timestamp
   */
  static createBaseMetadata(additional?: Partial<BaseMetadata>): BaseMetadata {
    return {
      timestamp: Date.now(),
      ...additional,
    };
  }

  /**
   * Safely extracts specific metadata type
   */
  static extractMetadata<T extends SuggestionMetadata>(
    metadata: unknown,
    validator: (data: unknown) => data is T,
  ): T | null {
    if (validator(metadata)) {
      return metadata;
    }
    return null;
  }
}

/**
 * Metadata validation schemas for runtime checking
 */
export const MetadataSchemas = {
  /**
   * Validates navigation history metadata structure
   */
  validateNavigationHistory(data: unknown): data is NavigationHistoryMetadata {
    if (typeof data !== "object" || data === null) return false;

    const obj = data as any;
    return (
      typeof obj.url === "string" &&
      typeof obj.visitCount === "number" &&
      typeof obj.lastVisit === "number" &&
      obj.visitCount >= 0 &&
      obj.lastVisit > 0
    );
  },

  /**
   * Validates agent action metadata structure
   */
  validateAgentAction(data: unknown): data is AgentActionMetadata {
    if (typeof data !== "object" || data === null) return false;

    const obj = data as any;
    const validActions = [
      "ask-agent",
      "explain-page",
      "summarize",
      "translate",
      "extract-data",
      "custom",
    ];
    return typeof obj.action === "string" && validActions.includes(obj.action);
  },
};
