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
} from "@vibe/shared-types";

// Re-export only the truly shared types that this package needs
export type { PageContent, ExtractedPage, PageMetadata, CDPTarget };

// Local types specific to tab-extraction-core
export interface TabInfo {
  id: string;
  url: string;
  title: string;
  cdpTargetId: string;
  isActive: boolean;
}

// ExtractionConfig is defined in config/extraction.ts - import from there if needed

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
