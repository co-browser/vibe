import type { AgentConfig } from "@vibe/shared-types";

/**
 * Agent Configuration Management
 * 
 * Handles validation, sanitization, and default configuration for the agent service.
 * Extracted from AgentService for better separation of concerns.
 */

/**
 * Default agent configuration values
 */
export const DEFAULT_AGENT_CONFIG = {
  model: "gpt-4o-mini",
  temperature: 0.7,
  processorType: "react" as const,
} as const;

/**
 * Agent configuration validator
 */
export class AgentConfigValidator {
  /**
   * Validate and normalize agent configuration
   */
  static validateConfig(config: any): AgentConfig {
    if (!config || typeof config !== "object") {
      throw new Error("Invalid config: must be an object");
    }

    // Validate required fields
    if (!config.openaiApiKey || typeof config.openaiApiKey !== "string" || config.openaiApiKey.trim().length === 0) {
      throw new Error("Invalid config: openaiApiKey is required and must be a non-empty string");
    }

    // Validate optional fields
    if (config.model && typeof config.model !== "string") {
      throw new Error("Invalid config: model must be a string");
    }

    if (config.temperature !== undefined && 
        (typeof config.temperature !== "number" || config.temperature < 0 || config.temperature > 2)) {
      throw new Error("Invalid config: temperature must be a number between 0 and 2");
    }

    if (config.processorType && !["react", "coact"].includes(config.processorType)) {
      throw new Error('Invalid config: processorType must be "react" or "coact"');
    }

    // Return validated and normalized config
    return {
      openaiApiKey: config.openaiApiKey.trim(),
      model: config.model || DEFAULT_AGENT_CONFIG.model,
      temperature: config.temperature ?? DEFAULT_AGENT_CONFIG.temperature,
      processorType: config.processorType || DEFAULT_AGENT_CONFIG.processorType,
      mcpServerUrl: config.mcpServerUrl,
    };
  }

  /**
   * Sanitize config for logging (remove sensitive data)
   */
  static sanitizeConfig(config: AgentConfig): Partial<AgentConfig> {
    return {
      model: config.model,
      temperature: config.temperature,
      processorType: config.processorType,
      mcpServerUrl: config.mcpServerUrl,
      // Exclude openaiApiKey for security
    };
  }

  /**
   * Validate processor type with fallback
   */
  static validateProcessorType(processorType: any): "react" | "coact" {
    if (!processorType) return DEFAULT_AGENT_CONFIG.processorType;
    if (processorType === "react" || processorType === "coact") {
      return processorType;
    }
    return DEFAULT_AGENT_CONFIG.processorType; // default fallback
  }

  /**
   * Create default configuration with required API key
   */
  static createDefaultConfig(openaiApiKey: string): AgentConfig {
    if (!openaiApiKey || typeof openaiApiKey !== "string" || openaiApiKey.trim().length === 0) {
      throw new Error("OpenAI API key is required");
    }

    return {
      openaiApiKey: openaiApiKey.trim(),
      ...DEFAULT_AGENT_CONFIG,
    };
  }

  /**
   * Merge partial config with defaults
   */
  static mergeWithDefaults(partialConfig: Partial<AgentConfig>): AgentConfig {
    if (!partialConfig.openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }

    return {
      ...DEFAULT_AGENT_CONFIG,
      ...partialConfig,
      openaiApiKey: partialConfig.openaiApiKey.trim(),
    };
  }
}