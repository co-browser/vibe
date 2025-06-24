import { createLogger } from "@vibe/shared-types";
import type { TabState } from "@vibe/shared-types";
import type {
  TabAlias,
  TabAliasMapping,
  ParsedPrompt,
  TabContentFilter,
} from "@vibe/shared-types";
import { EventEmitter } from "events";

const logger = createLogger("TabAliasService");

/**
 * Service for managing tab aliases and parsing @mentions in user prompts
 */
export class TabAliasService extends EventEmitter {
  private aliases: Map<string, TabAlias> = new Map(); // tabKey -> TabAlias
  private aliasToTab: Map<string, string> = new Map(); // alias -> tabKey
  private customAliases: Map<string, string> = new Map(); // tabKey -> customAlias

  // Configuration
  // Updated pattern to include dots for domain names like @google.com, @bbc.co.uk
  // Uses negative lookbehind to exclude email addresses (e.g., user@domain.com)
  private readonly aliasPattern =
    /(?<![a-zA-Z0-9._-])@([a-zA-Z0-9_.-]+(?:-\d+)?)/g;
  private readonly reservedAliases = new Set([
    "all",
    "none",
    "active",
    "current",
    "here",
    "this",
  ]);

  constructor() {
    super();
  }

  /**
   * Parse a user prompt to extract @alias mentions
   */
  public parsePrompt(prompt: string): ParsedPrompt {
    const extractedAliases: string[] = [];
    const aliasPositions: Array<{ alias: string; start: number; end: number }> =
      [];
    let cleanPrompt = prompt;

    // Find all @mentions in the prompt
    let match: RegExpExecArray | null;
    while ((match = this.aliasPattern.exec(prompt)) !== null) {
      const fullMatch = match[0];
      const alias = match[1].toLowerCase();

      if (!this.reservedAliases.has(alias)) {
        extractedAliases.push(alias);
        aliasPositions.push({
          alias,
          start: match.index,
          end: match.index + fullMatch.length,
        });
      }
    }

    // Remove @mentions from clean prompt for LLM
    cleanPrompt = prompt
      .replace(this.aliasPattern, (match, alias) => {
        if (this.reservedAliases.has(alias.toLowerCase())) {
          return match; // Keep reserved words
        }
        return ""; // Remove alias mentions
      })
      .trim();

    // Deduplicate aliases
    const uniqueAliases = [...new Set(extractedAliases)];

    return {
      originalPrompt: prompt,
      cleanPrompt,
      extractedAliases: uniqueAliases,
      aliasPositions,
    };
  }

  /**
   * Update aliases for a tab based on its current state
   */
  public updateTabAlias(tab: TabState): TabAlias {
    const existingAlias = this.aliases.get(tab.key);

    // Extract hostname from URL
    let hostname = "unknown";
    try {
      const url = new URL(tab.url);
      hostname = url.hostname.replace("www.", "").toLowerCase();
    } catch (error) {
      logger.warn(`Failed to parse URL for tab ${tab.key}: ${tab.url}`, error);
    }

    // Use custom alias if set, otherwise generate from hostname
    const customAlias = this.customAliases.get(tab.key);
    const baseAlias = customAlias || hostname;

    // Handle alias conflicts
    let finalAlias = baseAlias;
    let conflictSuffix = 0;

    // Check if this alias is already taken by another tab
    const existingTabKey = this.aliasToTab.get(finalAlias);
    if (existingTabKey && existingTabKey !== tab.key) {
      // Find an available suffix
      conflictSuffix = 1;
      while (this.aliasToTab.has(`${baseAlias}-${conflictSuffix}`)) {
        conflictSuffix++;
      }
      finalAlias = `${baseAlias}-${conflictSuffix}`;
    }

    // Clean up old alias if it changed
    if (existingAlias && existingAlias.alias !== finalAlias) {
      this.aliasToTab.delete(existingAlias.alias);
    }

    // Create or update the alias
    const tabAlias: TabAlias = {
      tabKey: tab.key,
      alias: finalAlias,
      hostname,
      customAlias,
      conflictSuffix: conflictSuffix || undefined,
      createdAt: existingAlias?.createdAt || Date.now(),
    };

    // Update mappings
    this.aliases.set(tab.key, tabAlias);
    this.aliasToTab.set(finalAlias, tab.key);

    this.emit("alias-updated", tabAlias);
    logger.debug(`Updated alias for tab ${tab.key}: @${finalAlias}`);

    return tabAlias;
  }

  /**
   * Set a custom alias for a tab
   */
  public setCustomAlias(tabKey: string, customAlias: string): boolean {
    // Validate alias
    if (!this.isValidAlias(customAlias)) {
      logger.warn(`Invalid custom alias: ${customAlias}`);
      return false;
    }

    // Check if alias is reserved
    if (this.reservedAliases.has(customAlias.toLowerCase())) {
      logger.warn(`Cannot use reserved alias: ${customAlias}`);
      return false;
    }

    // Check if alias is already taken
    const existingTabKey = this.aliasToTab.get(customAlias);
    if (existingTabKey && existingTabKey !== tabKey) {
      logger.warn(`Alias ${customAlias} is already taken by another tab`);
      return false;
    }

    // Store custom alias
    this.customAliases.set(tabKey, customAlias);

    // Force update of the tab alias
    const alias = this.aliases.get(tabKey);
    if (alias) {
      // Trigger re-evaluation with the custom alias
      this.updateTabAlias({
        key: tabKey,
        url: alias.hostname, // This will be re-parsed
        title: "",
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
      } as TabState);
    }

    return true;
  }

  /**
   * Get all current aliases
   */
  public getAllAliases(): TabAliasMapping {
    const mapping: TabAliasMapping = {};
    // Return tabKey -> alias mapping for frontend
    for (const [tabKey, tabAlias] of this.aliases) {
      mapping[tabKey] = tabAlias.alias;
    }
    return mapping;
  }

  /**
   * Get alias for a specific tab
   */
  public getTabAlias(tabKey: string): TabAlias | null {
    return this.aliases.get(tabKey) || null;
  }

  /**
   * Resolve aliases to tab keys
   */
  public resolveAliases(aliases: string[]): string[] {
    const tabKeys: string[] = [];

    for (const alias of aliases) {
      const tabKey = this.aliasToTab.get(alias.toLowerCase());
      if (tabKey) {
        tabKeys.push(tabKey);
      } else {
        logger.warn(`No tab found for alias: @${alias}`);
      }
    }

    return [...new Set(tabKeys)]; // Deduplicate
  }

  /**
   * Filter tabs based on extracted aliases
   */
  public filterTabsByAliases(
    tabs: TabState[],
    aliases: string[],
  ): TabContentFilter[] {
    const resolvedTabKeys = new Set(this.resolveAliases(aliases));

    return tabs.map(tab => {
      const tabAlias = this.aliases.get(tab.key);
      const includeInPrompt = resolvedTabKeys.has(tab.key);

      return {
        tabKey: tab.key,
        alias: tabAlias?.alias || "unknown",
        url: tab.url,
        title: tab.title,
        includeInPrompt,
      };
    });
  }

  /**
   * Remove alias when a tab is closed
   */
  public removeTabAlias(tabKey: string): void {
    const alias = this.aliases.get(tabKey);
    if (alias) {
      this.aliasToTab.delete(alias.alias);
      this.aliases.delete(tabKey);
      this.customAliases.delete(tabKey);
      logger.debug(`Removed alias for closed tab ${tabKey}`);
    }
  }

  /**
   * Validate an alias format
   */
  private isValidAlias(alias: string): boolean {
    // Must be alphanumeric with optional hyphens/underscores
    // No spaces, special characters, or @symbol
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(alias) && alias.length > 0 && alias.length <= 50;
  }

  /**
   * Get suggestions for partially typed aliases
   */
  public getAliasSuggestions(partial: string): Array<{
    alias: string;
    tabKey: string;
    title: string;
  }> {
    const suggestions: Array<{ alias: string; tabKey: string; title: string }> =
      [];
    const lowerPartial = partial.toLowerCase();

    for (const [alias, tabKey] of this.aliasToTab) {
      if (alias.startsWith(lowerPartial)) {
        const tabAlias = this.aliases.get(tabKey);
        if (tabAlias) {
          suggestions.push({
            alias,
            tabKey,
            title: "", // Would need tab title from TabManager
          });
        }
      }
    }

    return suggestions;
  }

  /**
   * Clear all aliases
   */
  public clear(): void {
    this.aliases.clear();
    this.aliasToTab.clear();
    this.customAliases.clear();
    logger.info("Cleared all tab aliases");
  }
}
