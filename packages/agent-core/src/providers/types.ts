import type { LanguageModelV1 } from "ai";

export type SupportedProvider = "openai" | "anthropic" | "cohere" | "custom";

export interface LLMProviderConfig {
  type: SupportedProvider;
  apiKey?: string;
  baseUrl?: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  options?: Record<string, any>;
}

export interface ILLMProvider {
  readonly type: SupportedProvider;
  
  createModel(config: LLMProviderConfig): LanguageModelV1;
  
  validateConfig(config: LLMProviderConfig): void;
  
  getDefaultModel(): string;
  
  getSupportedModels(): string[];
  
  isModelSupported(modelId: string): boolean;
}

export class LLMProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: SupportedProvider,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "LLMProviderError";
  }
}