/**
 * Tab Extraction Core Local Types
 * Local types for tab-extraction-core package
 */

// Only import the genuinely shared types that are used across packages
import type { 
  PageContent, 
  ExtractedPage, 
  PageMetadata,
  CDPTarget,
  TabInfo 
} from "@vibe/shared-types";

// Re-export only the truly shared types that this package needs
export type { PageContent, ExtractedPage, PageMetadata, CDPTarget, TabInfo };

// Local types specific to tab-extraction-core
export interface ExtractionConfig {
  timeout: number;
  retries: number;
  userAgent?: string;
}

export interface ExtractionResult {
  success: boolean;
  data?: ExtractedPage;
  error?: string;
  processingTime: number;
}

export interface ExtractionOptions {
  includeImages?: boolean;
  includeLinks?: boolean;
  includeMetadata?: boolean;
  maxContentLength?: number;
}

// Re-export local CDP types for consistency
export type { CDPConnection } from "../cdp/connector.js";
