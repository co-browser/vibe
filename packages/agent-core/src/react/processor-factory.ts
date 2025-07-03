import { openai } from "@ai-sdk/openai";
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
