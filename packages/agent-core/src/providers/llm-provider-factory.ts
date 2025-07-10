import type { LanguageModelV1 } from "ai";
import {
  ILLMProvider,
  LLMProviderConfig,
  LLMProviderError,
  SupportedProvider,
} from "./types.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";

export class LLMProviderFactory {
  private static providers: Map<SupportedProvider, ILLMProvider> = new Map();

  static {
    this.registerProvider(new OpenAIProvider());
    this.registerProvider(new AnthropicProvider());
  }

  static registerProvider(provider: ILLMProvider): void {
    this.providers.set(provider.type, provider);
  }

  static getProvider(type: SupportedProvider): ILLMProvider {
    const provider = this.providers.get(type);
    if (!provider) {
      throw new LLMProviderError(
        `Unknown provider type: ${type}. Available providers: ${Array.from(this.providers.keys()).join(", ")}`,
        type,
        "UNKNOWN_PROVIDER",
      );
    }
    return provider;
  }

  static createModel(config: LLMProviderConfig): LanguageModelV1 {
    const provider = this.getProvider(config.type);
    return provider.createModel(config);
  }

  static getSupportedProviders(): SupportedProvider[] {
    return Array.from(this.providers.keys());
  }

  static isProviderSupported(type: string): type is SupportedProvider {
    return this.providers.has(type as SupportedProvider);
  }

  static getProviderInfo(type: SupportedProvider): {
    defaultModel: string;
    supportedModels: string[];
  } {
    const provider = this.getProvider(type);
    return {
      defaultModel: provider.getDefaultModel(),
      supportedModels: provider.getSupportedModels(),
    };
  }
}
