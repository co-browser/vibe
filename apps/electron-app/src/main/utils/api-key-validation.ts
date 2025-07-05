/**
 * Centralized API key validation utilities
 */

import { createLogger } from "@vibe/shared-types";

const logger = createLogger("APIKeyValidation");

/**
 * Validates an OpenAI API key
 * OpenAI keys have evolved - they might start with 'sk-', 'sess-', or other prefixes
 * @param apiKey The API key to validate
 * @returns true if the key appears to be valid
 */
export function isValidOpenAIApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== "string") return false;

  const trimmed = apiKey.trim();

  // OpenAI keys have evolved - older keys were ~51 chars, but newer project keys
  // (sk-proj-*) can be 160+ characters. Be flexible with length.
  if (trimmed.length < 40 || trimmed.length > 200) {
    logger.debug("OpenAI API key validation failed: invalid length", {
      length: trimmed.length,
    });
    return false;
  }

  // Check for common patterns (sk-, sess-, sk-proj-, etc.)
  // Be flexible as OpenAI may introduce new prefixes
  // Allow hyphens and underscores in the key body as OpenAI keys can contain them
  // sk-proj- keys are ~164 chars, regular sk- keys are ~56 chars
  const validPattern = /^sk-[a-zA-Z0-9_-]+$/;
  const isValid = validPattern.test(trimmed);

  if (!isValid) {
    logger.debug("OpenAI API key validation failed: invalid pattern");
  }

  return isValid;
}

/**
 * Validates an Anthropic API key
 * @param apiKey The API key to validate
 * @returns true if the key appears to be valid
 */
export function isValidAnthropicApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== "string") return false;

  const trimmed = apiKey.trim();

  // Anthropic keys typically start with 'sk-ant-'
  // Length is usually around 108 characters
  if (trimmed.length < 90 || trimmed.length > 120) {
    logger.debug("Anthropic API key validation failed: invalid length", {
      length: trimmed.length,
    });
    return false;
  }

  const validPattern = /^sk-ant-[a-zA-Z0-9-]+$/;
  const isValid = validPattern.test(trimmed);

  if (!isValid) {
    logger.debug("Anthropic API key validation failed: invalid pattern");
  }

  return isValid;
}

/**
 * Validates a Google API key (for Gemini)
 * @param apiKey The API key to validate
 * @returns true if the key appears to be valid
 */
export function isValidGoogleApiKey(apiKey: string): boolean {
  if (!apiKey || typeof apiKey !== "string") return false;

  const trimmed = apiKey.trim();

  // Google API keys are typically 39 characters
  if (trimmed.length < 35 || trimmed.length > 45) {
    logger.debug("Google API key validation failed: invalid length", {
      length: trimmed.length,
    });
    return false;
  }

  // Google API keys contain alphanumeric characters and hyphens/underscores
  const validPattern = /^[a-zA-Z0-9_-]+$/;
  const isValid = validPattern.test(trimmed);

  if (!isValid) {
    logger.debug("Google API key validation failed: invalid pattern");
  }

  return isValid;
}

/**
 * Validates a GitHub token
 * @param token The token to validate
 * @returns true if the token appears to be valid
 */
export function isValidGitHubToken(token: string): boolean {
  if (!token || typeof token !== "string") return false;

  const trimmed = token.trim();

  // GitHub tokens can be personal access tokens (classic or fine-grained)
  // Classic: 40 characters
  // Fine-grained: start with 'github_pat_' followed by 82 characters
  // OAuth: start with 'gho_' followed by 36 characters

  // Check for fine-grained personal access token
  if (trimmed.startsWith("github_pat_")) {
    const isValid = trimmed.length === 93; // 11 + 82
    if (!isValid) {
      logger.debug(
        "GitHub fine-grained PAT validation failed: invalid length",
        {
          length: trimmed.length,
        },
      );
    }
    return isValid;
  }

  // Check for OAuth token
  if (trimmed.startsWith("gho_")) {
    const isValid = trimmed.length === 40; // 4 + 36
    if (!isValid) {
      logger.debug("GitHub OAuth token validation failed: invalid length", {
        length: trimmed.length,
      });
    }
    return isValid;
  }

  // Check for classic personal access token (40 hex characters)
  if (trimmed.length === 40) {
    const validPattern = /^[a-f0-9]{40}$/;
    const isValid = validPattern.test(trimmed);
    if (!isValid) {
      logger.debug("GitHub classic PAT validation failed: invalid pattern");
    }
    return isValid;
  }

  logger.debug("GitHub token validation failed: unrecognized format");
  return false;
}

/**
 * Generic API key validation
 * @param apiKey The API key to validate
 * @param keyType The type of API key (openai, anthropic, google, github, etc.)
 * @returns true if the key appears to be valid
 */
export function isValidApiKey(apiKey: string, keyType: string): boolean {
  switch (keyType.toLowerCase()) {
    case "openai":
      return isValidOpenAIApiKey(apiKey);
    case "anthropic":
      return isValidAnthropicApiKey(apiKey);
    case "google":
    case "gemini":
      return isValidGoogleApiKey(apiKey);
    case "github":
      return isValidGitHubToken(apiKey);
    default:
      // For unknown key types, just check that it's a non-empty string
      logger.debug(`No specific validation for key type: ${keyType}`);
      return !!apiKey && typeof apiKey === "string" && apiKey.trim().length > 0;
  }
}

/**
 * Sanitizes an API key for logging (shows only first few characters)
 * @param apiKey The API key to sanitize
 * @returns A sanitized version safe for logging
 */
export function sanitizeApiKeyForLogging(
  apiKey: string | undefined | null,
): string {
  if (!apiKey || typeof apiKey !== "string") return "[EMPTY]";

  const trimmed = apiKey.trim();
  if (trimmed.length === 0) return "[EMPTY]";

  // Show first 4 characters and last 4 characters with asterisks in between
  if (trimmed.length <= 8) {
    return "[REDACTED]";
  }

  return `${trimmed.substring(0, 4)}...${trimmed.substring(trimmed.length - 4)}`;
}
