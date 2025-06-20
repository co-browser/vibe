// packages/tab-extraction-core/src/index.ts
export * from "./types"; // Export all types
export * from "./tools/pageExtractor"; // Exports functions like getCurrentPageContent and schemas
export * from "./utils/formatting"; // Or specific functions
// Logger now comes from @vibe/shared-types
export { EnhancedExtractor } from "./extractors/enhanced.js";
export { CDPConnector } from "./cdp/connector.js";
export { ActiveTabTracker, activeTabTracker } from "./cdp/tabTracker.js";
export { extractionConfig } from "./config/extraction.js";
export {
  getCurrentPageContent,
  getCurrentPageContentSchema,
  getPageSummary,
  getPageSummarySchema,
  extractSpecificContent,
  extractSpecificContentSchema,
  getPageActions,
  getPageActionsSchema,
  extractTextFromPageContent,
  type PageExtractionResult,
  type PageExtractionError,
} from "./tools/pageExtractor.js";

// You might want to be more explicit about what you export
// to maintain a clear public API.
