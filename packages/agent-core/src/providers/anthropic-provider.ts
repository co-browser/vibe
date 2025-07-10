import { anthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV1 } from "ai";
import { ILLMProvider, LLMProviderConfig, LLMProviderError } from "./types.js";

export class AnthropicProvider implements ILLMProvider {
  readonly type = "anthropic" as const;

  private readonly supportedModels = [
    "claude-3-5-sonnet-20241022",
    "claude-3-5-haiku-20241022",
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229",
    "claude-3-haiku-20240307",
  ];

  createModel(config: LLMProviderConfig): LanguageModelV1 {
    this.validateConfig(config);

    const modelOptions: any = {
      apiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
    };

    if (config.baseUrl) {
      modelOptions.baseURL = config.baseUrl;
    }

    return anthropic(config.model, modelOptions);
  }

  validateConfig(config: LLMProviderConfig): void {
    if (config.type !== "anthropic") {
      throw new LLMProviderError(
        `Invalid provider type: ${config.type}`,
        "anthropic",
        "INVALID_PROVIDER_TYPE",
      );
    }

    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError(
        "Anthropic API key is required. Provide it via config.apiKey or ANTHROPIC_API_KEY environment variable",
        "anthropic",
        "MISSING_API_KEY",
      );
    }

    if (!config.model) {
      throw new LLMProviderError(
        "Model name is required",
        "anthropic",
        "MISSING_MODEL",
      );
    }

    if (!this.isModelSupported(config.model)) {
      throw new LLMProviderError(
        `Unsupported Anthropic model: ${config.model}. Supported models: ${this.supportedModels.join(", ")}`,
        "anthropic",
        "UNSUPPORTED_MODEL",
      );
    }
  }

  getDefaultModel(): string {
    return "claude-3-5-haiku-20241022";
  }

  getSupportedModels(): string[] {
    return [...this.supportedModels];
  }

  isModelSupported(modelId: string): boolean {
    return this.supportedModels.includes(modelId);
  }
}