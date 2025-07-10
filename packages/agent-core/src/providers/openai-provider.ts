import { openai } from "@ai-sdk/openai";
import type { LanguageModelV1 } from "ai";
import { ILLMProvider, LLMProviderConfig, LLMProviderError } from "./types.js";

export class OpenAIProvider implements ILLMProvider {
  readonly type = "openai" as const;

  private readonly supportedModels = [
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "gpt-3.5-turbo",
    "gpt-3.5-turbo-16k",
    "o1-preview",
    "o1-mini",
  ];

  createModel(config: LLMProviderConfig): LanguageModelV1 {
    this.validateConfig(config);

    const modelOptions: any = {
      apiKey: config.apiKey || process.env.OPENAI_API_KEY,
    };

    if (config.baseUrl) {
      modelOptions.baseURL = config.baseUrl;
    }

    return openai(config.model, modelOptions);
  }

  validateConfig(config: LLMProviderConfig): void {
    if (config.type !== "openai") {
      throw new LLMProviderError(
        `Invalid provider type: ${config.type}`,
        "openai",
        "INVALID_PROVIDER_TYPE",
      );
    }

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError(
        "OpenAI API key is required. Provide it via config.apiKey or OPENAI_API_KEY environment variable",
        "openai",
        "MISSING_API_KEY",
      );
    }

    if (!config.model) {
      throw new LLMProviderError(
        "Model name is required",
        "openai",
        "MISSING_MODEL",
      );
    }

    if (!this.isModelSupported(config.model)) {
      throw new LLMProviderError(
        `Unsupported OpenAI model: ${config.model}. Supported models: ${this.supportedModels.join(", ")}`,
        "openai",
        "UNSUPPORTED_MODEL",
      );
    }
  }

  getDefaultModel(): string {
    return "gpt-4o-mini";
  }

  getSupportedModels(): string[] {
    return [...this.supportedModels];
  }

  isModelSupported(modelId: string): boolean {
    return this.supportedModels.includes(modelId);
  }
}