// packages/tab-extraction-core/src/index.ts
export * from "./types"; // Export all types
export * from "./tools/pageExtractor"; // Exports functions like getCurrentPageContent and schemas
export * from "./utils/formatting"; // Or specific functions
export * from "./utils/logger";
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
} from "./tools/pageExtractor.js";

// You might want to be more explicit about what you export
// to maintain a clear public API.
