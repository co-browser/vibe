# LLM Provider System

The agent-core package uses a provider abstraction to support multiple LLM providers seamlessly.

## Supported Providers

- **OpenAI** - GPT-4, GPT-4O, GPT-3.5, and other OpenAI models
- **Anthropic** - Claude 3.5, Claude 3, and other Anthropic models
- More providers can be easily added

## Configuration

The LLM provider is configured through the `llmProvider` field in the agent configuration:

```typescript
const agentConfig = {
  llmProvider: {
    type: "openai",           // Provider type
    apiKey: "your-api-key",   // API key (optional if using env var)
    model: "gpt-4o-mini",     // Model to use
    temperature: 0.7,         // Optional temperature override
    baseUrl: "...",          // Optional custom base URL
    options: {}              // Provider-specific options
  },
  // Other agent configuration...
}
```

## API Key Configuration

API keys can be provided in two ways:

1. **Directly in configuration** (recommended for explicit control):
```typescript
llmProvider: {
  type: "openai",
  apiKey: "sk-..."
}
```

2. **Via environment variables** (useful for development):
- OpenAI: `OPENAI_API_KEY`
- Anthropic: `ANTHROPIC_API_KEY`

## Switching Providers

To switch between providers, simply change the `type` and update the model:

```typescript
// Using OpenAI
{
  llmProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini"
  }
}

// Using Anthropic
{
  llmProvider: {
    type: "anthropic",
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: "claude-3-5-haiku-20241022"
  }
}
```

## Available Models

### OpenAI Models
- `gpt-4o` - Most capable GPT-4 model
- `gpt-4o-mini` - Faster, cheaper GPT-4 variant
- `gpt-4-turbo` - GPT-4 Turbo
- `gpt-4` - Standard GPT-4
- `gpt-3.5-turbo` - Fast and cost-effective
- `gpt-3.5-turbo-16k` - Extended context window
- `o1-preview` - Reasoning model (preview)
- `o1-mini` - Smaller reasoning model

### Anthropic Models
- `claude-3-5-sonnet-20241022` - Most capable Claude model
- `claude-3-5-haiku-20241022` - Fast and efficient
- `claude-3-opus-20240229` - Previous generation, very capable
- `claude-3-sonnet-20240229` - Balanced performance
- `claude-3-haiku-20240307` - Fastest Claude model

## Adding a New Provider

To add support for a new LLM provider:

1. Install the provider's SDK:
```bash
npm install @ai-sdk/your-provider
```

2. Create a new provider class implementing `ILLMProvider`:

```typescript
import { yourProvider } from "@ai-sdk/your-provider";
import type { LanguageModelV1 } from "ai";
import { ILLMProvider, LLMProviderConfig, LLMProviderError } from "./types.js";

export class YourProvider implements ILLMProvider {
  readonly type = "your-provider" as const;

  private readonly supportedModels = [
    "model-1",
    "model-2",
  ];

  createModel(config: LLMProviderConfig): LanguageModelV1 {
    this.validateConfig(config);
    
    return yourProvider(config.model, {
      apiKey: config.apiKey || process.env.YOUR_PROVIDER_API_KEY,
    });
  }

  validateConfig(config: LLMProviderConfig): void {
    // Validation logic
  }

  getDefaultModel(): string {
    return "model-1";
  }

  getSupportedModels(): string[] {
    return [...this.supportedModels];
  }

  isModelSupported(modelId: string): boolean {
    return this.supportedModels.includes(modelId);
  }
}
```

3. Register the provider in `llm-provider-factory.ts`:

```typescript
import { YourProvider } from "./your-provider.js";

static {
  this.registerProvider(new OpenAIProvider());
  this.registerProvider(new AnthropicProvider());
  this.registerProvider(new YourProvider()); // Add this line
}
```

4. Update the `SupportedProvider` type in `types.ts`:

```typescript
export type SupportedProvider = "openai" | "anthropic" | "your-provider" | "custom";
```

## Error Handling

The provider system includes comprehensive error handling:

- **Missing API Key**: Clear error message indicating how to provide the key
- **Invalid Model**: Lists all supported models for the provider
- **Provider Errors**: Wrapped with provider context for easier debugging

## Examples

### Basic Usage

```typescript
import { AgentFactory } from '@vibe/agent-core';

// Create an agent with OpenAI
const agent = await AgentFactory.create({
  llmProvider: {
    type: "openai",
    apiKey: "sk-...",
    model: "gpt-4o-mini"
  }
});

// Send a message
await agent.sendMessage("Hello, how can you help me?");
```

### Using Environment Variables

```typescript
// .env file
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...

// In your code
const agent = await AgentFactory.create({
  llmProvider: {
    type: "openai",
    model: "gpt-4o-mini"
    // apiKey will be read from OPENAI_API_KEY
  }
});
```

### Switching Providers Dynamically

```typescript
function createAgentConfig(provider: "openai" | "anthropic") {
  const configs = {
    openai: {
      type: "openai" as const,
      apiKey: process.env.OPENAI_API_KEY,
      model: "gpt-4o-mini"
    },
    anthropic: {
      type: "anthropic" as const,
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: "claude-3-5-haiku-20241022"
    }
  };
  
  return {
    llmProvider: configs[provider]
  };
}

// Use OpenAI
const openaiAgent = await AgentFactory.create(createAgentConfig("openai"));

// Use Anthropic
const anthropicAgent = await AgentFactory.create(createAgentConfig("anthropic"));
```