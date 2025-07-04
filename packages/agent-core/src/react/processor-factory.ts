import { createOpenAI } from "@ai-sdk/openai";
import {
  ReActProcessor,
  CoActProcessor,
  MAX_REACT_ITERATIONS,
} from "./index.js";
import type { IToolManager, IAgentConfig } from "../interfaces/index.js";
import { createLogger } from "@vibe/shared-types";

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

    // Validate API key presence
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        "OpenAI API key is required but not provided in config or environment variables",
      );
    }

    // Create OpenAI instance with validated API key
    const openai = createOpenAI({
      apiKey: apiKey,
    });

    const model = openai.chat(config.model || "gpt-4o-mini");

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
      `[Agent] ${processorType.toUpperCase()} processor initialized and ready`,
    );
    return processor;
  }
}
