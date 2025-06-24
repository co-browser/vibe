import { createLogger } from "@vibe/shared-types";
import type { TabState, ChatMessage } from "@vibe/shared-types";
import type { LLMPromptConfig } from "@vibe/shared-types";
import { TabAliasService } from "./tab-alias-service";
import { TabContentService } from "./tab-content-service";
import { LLMPromptBuilder } from "./llm-prompt-builder";
import type { TabManager } from "../browser/tab-manager";
import type { ViewManager } from "../browser/view-manager";
import type { CDPManager } from "./cdp-service";

const logger = createLogger("TabContextOrchestrator");

/**
 * Main orchestrator for the @tabName feature
 * Coordinates alias parsing, content extraction, and prompt building
 */
export class TabContextOrchestrator {
  private aliasService: TabAliasService;
  private contentService: TabContentService;
  private promptBuilder: LLMPromptBuilder;

  constructor(
    private tabManager: TabManager,
    viewManager: ViewManager,
    cdpManager?: CDPManager,
  ) {
    this.aliasService = new TabAliasService();
    this.contentService = new TabContentService(
      tabManager,
      viewManager,
      cdpManager,
    );
    this.promptBuilder = new LLMPromptBuilder();
  }

  /**
   * Initialize the orchestrator
   */
  public async initialize(): Promise<void> {
    // Set up event listeners
    this.setupEventListeners();

    // Initialize aliases for existing tabs
    await this.initializeExistingTabs();
  }

  /**
   * Process a user prompt with @mentions and build LLM messages
   */
  public async processPromptWithTabContext(
    userPrompt: string,
    systemPrompt: string,
    conversationHistory?: ChatMessage[],
  ): Promise<{
    messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
    parsedPrompt: ReturnType<TabAliasService["parsePrompt"]>;
    includedTabs: Array<{ alias: string; url: string; title: string }>;
    errors: string[];
  }> {
    const errors: string[] = [];
    const includedTabs: Array<{ alias: string; url: string; title: string }> =
      [];

    try {
      // 1. Parse the prompt for @mentions
      const parsedPrompt = this.aliasService.parsePrompt(userPrompt);
      logger.info("Parsed prompt", {
        aliases: parsedPrompt.extractedAliases,
        cleanPrompt: parsedPrompt.cleanPrompt,
      });

      // 2. Get all tabs and determine which to include
      const allTabs = this.tabManager.getAllTabs();
      let tabFilters: ReturnType<TabAliasService["filterTabsByAliases"]>;
      let autoIncludedCurrentTab = false;

      if (parsedPrompt.extractedAliases.length === 0) {
        // No @mentions, auto-include current tab if available
        const activeTab = this.tabManager.getActiveTab();
        if (activeTab) {
          const activeTabAlias = this.aliasService.getTabAlias(activeTab.key);
          if (activeTabAlias) {
            logger.info("Auto-including current tab", {
              tabKey: activeTab.key,
              alias: activeTabAlias.alias,
              url: activeTab.url,
            });
            tabFilters = [
              {
                tabKey: activeTab.key,
                alias: activeTabAlias.alias,
                url: activeTab.url,
                title: activeTab.title,
                includeInPrompt: true,
              },
            ];
            autoIncludedCurrentTab = true;
          } else {
            tabFilters = [];
          }
        } else {
          tabFilters = [];
        }
      } else {
        // Use explicitly mentioned tabs
        tabFilters = this.aliasService.filterTabsByAliases(
          allTabs,
          parsedPrompt.extractedAliases,
        );
      }

      // 3. Extract content from referenced tabs
      const tabContexts =
        await this.contentService.filterAndExtractContent(tabFilters);

      // Track included tabs
      for (const context of tabContexts) {
        includedTabs.push({
          alias: context.tabAlias,
          url: context.url,
          title: context.title,
        });
      }

      // Log any missing aliases
      const foundAliases = new Set(
        tabContexts.map(ctx => ctx.tabAlias.replace("@", "").toLowerCase()),
      );
      for (const requestedAlias of parsedPrompt.extractedAliases) {
        if (!foundAliases.has(requestedAlias.toLowerCase())) {
          errors.push(`Tab with alias @${requestedAlias} not found`);
        }
      }

      // 4. Build LLM prompt configuration
      let modifiedSystemPrompt = systemPrompt;

      // Add note about auto-included current tab if applicable
      if (autoIncludedCurrentTab && tabContexts.length > 0) {
        modifiedSystemPrompt += `\n\nNote: The user's current browser tab (@${tabContexts[0].tabAlias}) has been automatically included as context since no specific tabs were mentioned.`;
      }

      const promptConfig: LLMPromptConfig = {
        systemPrompt: modifiedSystemPrompt,
        tabContexts,
        conversationHistory: conversationHistory?.map(msg => {
          // Validate role type
          if (msg.role !== "user" && msg.role !== "assistant") {
            logger.warn(
              `Invalid role '${msg.role}' in conversation history, defaulting to 'user'`,
            );
          }
          return {
            role:
              msg.role === "user" || msg.role === "assistant"
                ? msg.role
                : "user",
            content: msg.content,
          };
        }),
        userPrompt: parsedPrompt.cleanPrompt,
        includeMetadata: true,
      };

      // 5. Validate configuration
      const validation = this.promptBuilder.validateConfig(promptConfig);
      if (!validation.valid) {
        errors.push(...validation.errors);
      }

      // 6. Build final messages array
      const messages = this.promptBuilder.buildMessages(promptConfig);

      // Log summary for debugging
      logger.info("Built LLM prompt", {
        totalMessages: messages.length,
        tabsIncluded: includedTabs.length,
        errors: errors.length,
      });

      return {
        messages,
        parsedPrompt,
        includedTabs,
        errors,
      };
    } catch (error) {
      logger.error("Error processing prompt with tab context:", error);
      errors.push("Failed to process tab context");

      // Return basic prompt without tab context
      return {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        parsedPrompt: this.aliasService.parsePrompt(userPrompt),
        includedTabs: [],
        errors,
      };
    }
  }

  /**
   * Update aliases for all tabs
   */
  public updateAllTabAliases(): void {
    const tabs = this.tabManager.getAllTabs();
    for (const tab of tabs) {
      this.aliasService.updateTabAlias(tab);
    }
  }

  /**
   * Get current alias mappings
   */
  public getAliasMapping(): ReturnType<TabAliasService["getAllAliases"]> {
    return this.aliasService.getAllAliases();
  }

  /**
   * Set custom alias for a tab
   */
  public setCustomAlias(tabKey: string, customAlias: string): boolean {
    const success = this.aliasService.setCustomAlias(tabKey, customAlias);
    if (success) {
      // Refresh the tab's alias
      const tab = this.tabManager.getTab(tabKey);
      if (tab) {
        this.aliasService.updateTabAlias(tab);
      }
    }
    return success;
  }

  /**
   * Get suggestions for partial alias
   */
  public getAliasSuggestions(partial: string): Array<{
    alias: string;
    tabKey: string;
    title: string;
    url: string;
  }> {
    const suggestions = this.aliasService.getAliasSuggestions(partial);

    // Enrich with tab data
    return suggestions.map(suggestion => {
      const tab = this.tabManager.getTab(suggestion.tabKey);
      return {
        ...suggestion,
        title: tab?.title || "Unknown",
        url: tab?.url || "",
      };
    });
  }

  /**
   * Initialize aliases for existing tabs
   */
  private initializeExistingTabs(): void {
    const tabs = this.tabManager.getAllTabs();
    logger.info(`Initializing aliases for ${tabs.length} tabs`);

    for (const tab of tabs) {
      const alias = this.aliasService.updateTabAlias(tab);
      logger.debug(`Initialized alias for tab ${tab.key}:`, {
        url: tab.url,
        title: tab.title,
        alias: alias.alias,
      });
    }

    const mapping = this.aliasService.getAllAliases();
    logger.info(`Initialized aliases:`, {
      tabCount: tabs.length,
      aliasCount: Object.keys(mapping).length,
      aliases: mapping,
    });
  }

  /**
   * Set up event listeners for tab changes
   */
  private setupEventListeners(): void {
    // Update alias when tab is created
    this.tabManager.on("tab-created", (tabKey: string) => {
      const tab = this.tabManager.getTab(tabKey);
      if (tab) {
        this.aliasService.updateTabAlias(tab);
      }
    });

    // Update alias when tab URL/title changes
    this.tabManager.on("tab-updated", (tab: TabState) => {
      this.aliasService.updateTabAlias(tab);
      // Clear content cache for updated tab
      this.contentService.clearCache(tab.key);
    });

    // Remove alias when tab is closed
    this.tabManager.on("tab-closed", (tabKey: string) => {
      this.aliasService.removeTabAlias(tabKey);
      this.contentService.clearCache(tabKey);
    });
  }

  /**
   * Clean up resources
   */
  public async destroy(): Promise<void> {
    await this.contentService.destroy();
    this.aliasService.clear();
  }
}
