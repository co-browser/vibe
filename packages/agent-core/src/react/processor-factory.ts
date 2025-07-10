import {
  ReActProcessor,
  CoActProcessor,
  MAX_REACT_ITERATIONS,
} from "./index.js";
import type { IToolManager, IAgentConfig } from "../interfaces/index.js";
import { createLogger } from "@vibe/shared-types";
import {
  LLMProviderFactory,
  type LLMProviderConfig,
} from "../providers/index.js";

const logger = createLogger("ProcessorFactory");

export class ProcessorFactory {
  static async create(
    config: IAgentConfig,
    toolManager: IToolManager,
  ): Promise<ReActProcessor | CoActProcessor> {
    const processorType = config.processorType || "react";
    logger.debug(
      `[Agent] Initializing ${processorType.toUpperCase()} processor...`,
    );

    const formattedTools = await toolManager.formatToolsForReact();
    const toolExecutor = toolManager.executeTools.bind(toolManager);
    const systemPrompt = formattedTools;

    // Create LLM provider configuration
    const providerConfig: LLMProviderConfig = {
      ...config.llmProvider,
      temperature: config.llmProvider.temperature ?? config.temperature,
    };

    // Create model using the provider factory
    const model = LLMProviderFactory.createModel(providerConfig);

    const processor =
      processorType === "coact"
        ? new CoActProcessor(
            model,
            systemPrompt,
            MAX_REACT_ITERATIONS,
            toolExecutor,
          )
        : new ReActProcessor(
            model,
            systemPrompt,
            MAX_REACT_ITERATIONS,
            toolExecutor,
          );

    logger.debug(
      `[Agent] ${processorType.toUpperCase()} processor initialized with ${providerConfig.type} provider`,
    );
    return processor;
  }
}
