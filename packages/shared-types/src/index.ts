/**
 * @vibe/shared-types
 *
 * ONLY contains types that are:
 * - Used by multiple packages
 * - Part of public APIs between packages
 * - Core communication interfaces
 *
 * If a type is only used within one package, it should be local to that package.
 *
 * Following 2025 monorepo best practices for lean and maintainable code.
 */

// Chat types - shared between electron app renderer/main and agent-core
export * from "./chat";

// Browser types - shared between electron app and tab-extraction-core
export * from "./browser";

// Tab types moved to local packages

// Content types moved to local packages

// Agent types - shared between electron app and agent-core
export * from "./agent";

// Constants - shared configuration across packages
export * from "./constants";

// Utilities - shared helper functions across packages
export * from "./utils";

// Path utilities - shared Node.js-specific utilities
export * from "./utils/path";

// Logging utilities - shared logger implementation across all packages
export * from "./logger";

// MCP types - shared across agent-core, electron app, and mcp packages
export * from "./mcp";
