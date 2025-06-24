/**
 * Tab alias system shared types
 */

export interface TabAlias {
  tabKey: string;
  alias: string;
  hostname: string;
  customAlias?: string;
  conflictSuffix?: number;
  createdAt: number;
}

export interface TabAliasMapping {
  [alias: string]: string; // alias -> tabKey
}

export interface TabContentFilter {
  tabKey: string;
  alias: string;
  url: string;
  title: string;
  extractedContent?: string;
  includeInPrompt: boolean;
}

export interface ParsedPrompt {
  originalPrompt: string;
  cleanPrompt: string;
  extractedAliases: string[];
  aliasPositions: Array<{
    alias: string;
    start: number;
    end: number;
  }>;
}

export interface TabContextMessage {
  tabAlias: string;
  url: string;
  title: string;
  content: string;
  metadata?: {
    extractedAt: number;
    contentLength: number;
    contentType?: string;
  };
}

export interface LLMPromptConfig {
  systemPrompt: string;
  tabContexts: TabContextMessage[];
  conversationHistory?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  userPrompt: string;
  maxTokensPerTab?: number;
  includeMetadata?: boolean;
}
