/**
 * Browser and CDP-related shared types
 */

/**
 * CDP target information from remote debugging API
 */
export interface CDPTarget {
  /** Unique target identifier */
  id: string;
  /** Target URL */
  url: string;
  /** Target type (usually 'page') */
  type: string;
  /** Target title */
  title?: string;
  /** Whether target is attached */
  attached?: boolean;
  /** Browser context ID */
  browserContextId?: string;
  /** WebSocket URL for debugging this target */
  webSocketDebuggerUrl: string;
  /** DevTools frontend URL for this target */
  devtoolsFrontendUrl?: string;
}

/**
 * CDP error categories for error handling and recovery
 */
export enum CDPErrorType {
  /** Failed to establish CDP connection */
  CONNECTION_FAILED = "connection_failed",
  /** Failed to attach debugger to WebContents */
  DEBUGGER_ATTACH_FAILED = "debugger_attach_failed",
  /** Failed to enable required CDP domains */
  DOMAIN_ENABLE_FAILED = "domain_enable_failed",
  /** Target not found during polling */
  TARGET_NOT_FOUND = "target_not_found",
  /** CDP command timed out */
  COMMAND_TIMEOUT = "command_timeout",
  /** General CDP protocol error */
  PROTOCOL_ERROR = "protocol_error",
}

export interface PageContent {
  title: string;
  url: string;
  excerpt: string;
  content: string;
  textContent: string;
  byline?: string;
  siteName?: string;
  publishedTime?: string;
  modifiedTime?: string;
  lang?: string;
  dir?: string;
}

export interface PageMetadata {
  openGraph?: {
    title?: string;
    description?: string;
    image?: string;
    url?: string;
    type?: string;
    siteName?: string;
  };
  twitter?: {
    card?: string;
    title?: string;
    description?: string;
    image?: string;
    creator?: string;
  };
  jsonLd?: any[];
  microdata?: any[];
}

export interface ExtractedPage extends PageContent {
  metadata: PageMetadata;
  images: Array<{
    src: string;
    alt?: string;
    title?: string;
  }>;
  links: Array<{
    href: string;
    text: string;
    rel?: string;
  }>;
  actions: Array<{
    type: "button" | "link" | "form";
    selector: string;
    text: string;
    attributes: Record<string, string>;
  }>;
  extractionTime: number;
  contentLength: number;
}
