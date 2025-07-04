/**
 * ReAct Processor
 * Implements the ReAct (Reason + Act) prompting framework
 * Enables iterative reasoning, action execution, and observation
 * ReAct: Think → Act → Observe → Repeat
 * Each thought only considers the immediate next step. It reacts to the last observation.
 */

import {
  streamText,
  type CoreTool,
  type CoreMessage,
  type TextStreamPart,
  type LanguageModelV1StreamPart,
} from "ai";
import { openai } from "@ai-sdk/openai";
import {
  REACT_XML_TAGS,
  REACT_SYSTEM_PROMPT_TEMPLATE,
  MAX_REACT_ITERATIONS,
} from "./config";
import { extractXmlTagContent, parseReactToolCall } from "./xml-parser";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ReactProcessor");
import type { ReactObservation, ToolExecutor } from "./types";

// Extended ReAct stream part type
export type ReActStreamPart =
  | LanguageModelV1StreamPart
  | TextStreamPart<Record<string, CoreTool>>
  | {
      type: "tool-call";
      toolName: string;
      toolArgs: Record<string, any>;
      toolId: string;
    }
  | {
      type: "observation";
      content: string;
      toolCallId: string;
      toolName: string;
      result: any;
      error?: string;
    };

export class ReActProcessor {
  /**
   * Constructs a new ReActProcessor instance.
   * @param model The language model instance to use for generating responses.
   * @param formattedToolsSignature A string describing the available tools for the model.
   * @param maxIterations The maximum number of ReAct iterations to perform.
   * @param toolExecutor A function that executes a given tool with provided arguments.
   * @param activeCdpTargetId Optional CDP target ID for context in tool execution.
   */
  constructor(
    private model: ReturnType<typeof openai>,
    private formattedToolsSignature: string,
    private maxIterations: number = MAX_REACT_ITERATIONS, // Default to imported constant
    private toolExecutor: ToolExecutor,
    private activeCdpTargetId?: string | null, // Optional CDP target ID for the tool executor
  ) {}

  /**
   * Removes all ReAct XML tags from a given string.
   * @param content The string content, potentially containing ReAct XML tags.
   * @returns The content string with all ReAct XML tags stripped.
   */
  private _stripReActTags(content: string | null): string {
    if (!content) return "";
    let cleanedContent = content;
    for (const tagName of Object.values(REACT_XML_TAGS)) {
      const openingTagRegex = new RegExp(`<${tagName}(?:\\s[^>]*)?>`, "gi");
      const closingTagRegex = new RegExp(`</${tagName}>`, "gi");
      cleanedContent = cleanedContent.replace(openingTagRegex, "");
      cleanedContent = cleanedContent.replace(closingTagRegex, "");
    }
    return cleanedContent.trim();
  }

  /**
   * Extracts content from a specified XML tag within a string and then cleans it by removing all ReAct tags.
   * @param xmlString The string containing XML-like structures.
   * @param tagName The name of the tag from which to extract content.
   * @returns The cleaned content of the specified tag, or null if the tag is not found or has no content.
   */
  private _extractAndCleanTag(
    xmlString: string,
    tagName: string,
  ): string | null {
    const content = extractXmlTagContent(xmlString, tagName);
    return content ? this._stripReActTags(content) : null;
  }

  /**
   * Processes an initial user query through the ReAct framework, yielding parts of the language model's response and actions.
   * This generator function iteratively calls the language model, parses its output for thoughts, tool calls, or final responses,
   * executes tools if necessary, and feeds observations back into the model until a final response is generated or iterations are maxed out.
   * It streams delta updates for thoughts and responses to provide real-time output.
   *
   * @param initialUserQuery The initial query or problem statement from the user.
   * @param chatHistory An array of previous messages in the conversation, used to provide context to the model.
   * @yields {LanguageModelV1StreamPart | TextStreamPart<Record<string, CoreTool>>} Stream parts representing text deltas, errors, or finish reasons.
   * @returns {Promise<void>} A promise that resolves when the ReAct processing is complete.
   */
  public async *process(
    initialUserQuery: string,
    chatHistory: CoreMessage[],
  ): AsyncGenerator<ReActStreamPart, void, undefined> {
    const currentMessages: CoreMessage[] = [];
    const systemPrompt = REACT_SYSTEM_PROMPT_TEMPLATE.replace(
      "%TOOLS_SIGNATURE%",
      this.formattedToolsSignature,
    );
    currentMessages.push({ role: "system", content: systemPrompt });
    currentMessages.push({
      role: "user",
      content: `<${REACT_XML_TAGS.QUESTION}>${initialUserQuery}</${REACT_XML_TAGS.QUESTION}>`,
    });

    for (let i = 0; i < this.maxIterations; i++) {
      let llmResponseContent = "";
      let assistantMessageToAddToHistory: CoreMessage | null = null;
      let llmStreamError: Error | null = null;

      let inResponseTag = false;
      let hasStartedStreamingThisResponse = false;
      let partialClosingTagBuffer = "";

      let inThoughtTag = false;
      let hasStartedStreamingThisThought = false;
      let partialClosingThoughtTagBuffer = "";

      try {
        const stream = await streamText({
          model: this.model,
          messages: [...chatHistory, ...currentMessages],
          temperature: 0.7,
        });

        for await (const part of stream.fullStream) {
          if (part.type === "text-delta") {
            const textDelta = part.textDelta;
            llmResponseContent += textDelta;

            if (inThoughtTag) {
              const effectiveThoughtDelta =
                partialClosingThoughtTagBuffer + textDelta;
              partialClosingThoughtTagBuffer = "";
              const closingThoughtTag = `</${REACT_XML_TAGS.THOUGHT}>`;
              const closingThoughtTagIndex =
                effectiveThoughtDelta.indexOf(closingThoughtTag);

              if (closingThoughtTagIndex !== -1) {
                const contentBeforeClosing = effectiveThoughtDelta.substring(
                  0,
                  closingThoughtTagIndex,
                );
                if (contentBeforeClosing.length > 0) {
                  yield { type: "reasoning", textDelta: contentBeforeClosing };
                }
                inThoughtTag = false;
              } else {
                const L = effectiveThoughtDelta.length;
                const K = closingThoughtTag.length;
                let breakPoint = L;
                for (let len = Math.min(L, K - 1); len >= 1; len--) {
                  const suffix = effectiveThoughtDelta.substring(L - len);
                  if (closingThoughtTag.startsWith(suffix)) {
                    breakPoint = L - len;
                    break;
                  }
                }
                const contentToYield = effectiveThoughtDelta.substring(
                  0,
                  breakPoint,
                );
                partialClosingThoughtTagBuffer =
                  effectiveThoughtDelta.substring(breakPoint);
                if (contentToYield.length > 0) {
                  yield { type: "reasoning", textDelta: contentToYield };
                }
              }
            } else if (inResponseTag) {
              const effectiveDelta = partialClosingTagBuffer + textDelta;
              partialClosingTagBuffer = "";
              const closingTag = `</${REACT_XML_TAGS.RESPONSE}>`;
              const closingTagIndexInEffectiveDelta =
                effectiveDelta.indexOf(closingTag);

              if (closingTagIndexInEffectiveDelta !== -1) {
                const contentBeforeClosingTag = effectiveDelta.substring(
                  0,
                  closingTagIndexInEffectiveDelta,
                );
                if (contentBeforeClosingTag.length > 0) {
                  yield {
                    type: "text-delta",
                    textDelta: contentBeforeClosingTag,
                  };
                }
                inResponseTag = false;
              } else {
                const L = effectiveDelta.length;
                const K = closingTag.length;
                let breakPoint = L;
                for (let len = Math.min(L, K - 1); len >= 1; len--) {
                  const suffix = effectiveDelta.substring(L - len);
                  if (closingTag.startsWith(suffix)) {
                    breakPoint = L - len;
                    break;
                  }
                }
                const contentToYield = effectiveDelta.substring(0, breakPoint);
                partialClosingTagBuffer = effectiveDelta.substring(breakPoint);

                if (contentToYield.length > 0) {
                  yield { type: "text-delta", textDelta: contentToYield };
                }
              }
            } else if (
              !hasStartedStreamingThisThought &&
              !hasStartedStreamingThisResponse
            ) {
              const openingThoughtTag = `<${REACT_XML_TAGS.THOUGHT}>`;
              const openingThoughtTagIndexInAccumulated =
                llmResponseContent.indexOf(openingThoughtTag);

              if (openingThoughtTagIndexInAccumulated !== -1) {
                inThoughtTag = true;
                hasStartedStreamingThisThought = true;

                const initialThoughtContentToStream =
                  llmResponseContent.substring(
                    openingThoughtTagIndexInAccumulated +
                      openingThoughtTag.length,
                  );
                const closingThoughtTag = `</${REACT_XML_TAGS.THOUGHT}>`;
                const closingThoughtTagIndexInInitial =
                  initialThoughtContentToStream.indexOf(closingThoughtTag);

                if (closingThoughtTagIndexInInitial !== -1) {
                  const thoughtChunk = initialThoughtContentToStream.substring(
                    0,
                    closingThoughtTagIndexInInitial,
                  );
                  if (thoughtChunk.length > 0) {
                    yield { type: "reasoning", textDelta: thoughtChunk };
                  }
                  inThoughtTag = false;
                } else {
                  if (initialThoughtContentToStream.length > 0) {
                    yield {
                      type: "reasoning",
                      textDelta: initialThoughtContentToStream,
                    };
                  }
                }
              } else {
                const openingTag = `<${REACT_XML_TAGS.RESPONSE}>`;
                const openingTagIndexInAccumulated =
                  llmResponseContent.indexOf(openingTag);

                if (openingTagIndexInAccumulated !== -1) {
                  inResponseTag = true;
                  hasStartedStreamingThisResponse = true;

                  const initialContentToStream = llmResponseContent.substring(
                    openingTagIndexInAccumulated + openingTag.length,
                  );
                  const closingTag = `</${REACT_XML_TAGS.RESPONSE}>`;
                  const closingTagIndexInInitialContent =
                    initialContentToStream.indexOf(closingTag);

                  if (closingTagIndexInInitialContent !== -1) {
                    const finalChunk = initialContentToStream.substring(
                      0,
                      closingTagIndexInInitialContent,
                    );
                    if (finalChunk.length > 0) {
                      yield { type: "text-delta", textDelta: finalChunk };
                    }
                    inResponseTag = false;
                  } else {
                    if (initialContentToStream.length > 0) {
                      yield {
                        type: "text-delta",
                        textDelta: initialContentToStream,
                      };
                    }
                  }
                }
              }
            }
          } else if (part.type === "error") {
            logger.warn(
              "[ReActProcessor] Error part from inner LLM stream:",
              part.error,
            );
            yield part;
            llmStreamError =
              part.error instanceof Error
                ? part.error
                : new Error(String(part.error));
          } else if (part.type === "finish") {
            if (llmStreamError) {
              logger.warn(
                `[ReActProcessor] LLM stream finished after an error. Reason: ${part.finishReason}`,
              );
            }
          }
        }

        if (llmStreamError) {
          logger.error(
            `[ReActProcessor] LLM call failed critically (iteration ${i}):`,
            llmStreamError.message,
          );
          return;
        }

        assistantMessageToAddToHistory = {
          role: "assistant",
          content: llmResponseContent,
        };
        currentMessages.push(assistantMessageToAddToHistory);
      } catch (error) {
        logger.error(
          `[ReActProcessor] Error in LLM call (iteration ${i}):`,
          error,
        );
        const yieldError =
          error instanceof Error ? error : new Error(String(error));
        yield {
          type: "error",
          error: yieldError,
        } as TextStreamPart<Record<string, CoreTool>>;
        return;
      }

      const thought = this._extractAndCleanTag(
        llmResponseContent,
        REACT_XML_TAGS.THOUGHT,
      );
      const toolCallContent = extractXmlTagContent(
        llmResponseContent,
        REACT_XML_TAGS.TOOL_CALL,
      );

      if (thought && !hasStartedStreamingThisResponse) {
        // Thought received, and we haven't started streaming a direct response yet.
        // This is typical: thought often precedes action or final response.
        // No specific action needed here beyond acknowledging the thought occurred.
      } else if (thought && hasStartedStreamingThisResponse) {
        // Thought received, but we ALREADY started streaming a direct response.
        // This is an unusual state. It might indicate the model is trying to "think"
        // after it already decided on a final answer. For now, we'll just log this.
        logger.warn(
          "[ReActProcessor] Thought received after response streaming started. Thought:",
          thought,
        );
      }

      if (toolCallContent && !hasStartedStreamingThisResponse) {
        logger.debug(
          `[ReActProcessor] Found tool call content: ${toolCallContent}`,
        );
        const parsedToolCall = parseReactToolCall(toolCallContent);
        logger.debug(`[ReActProcessor] Parsed tool call:`, parsedToolCall);

        if (parsedToolCall) {
          // Log if arguments are empty to help debug the issue
          if (Object.keys(parsedToolCall.arguments).length === 0) {
            logger.warn(
              `[ReActProcessor] Tool ${parsedToolCall.name} has empty arguments`,
            );
            logger.warn(
              `[ReActProcessor] Full accumulated content:`,
              llmResponseContent,
            );
          }

          yield {
            type: "tool-call",
            toolName: parsedToolCall.name,
            toolArgs: parsedToolCall.arguments,
            toolId: parsedToolCall.id,
          };

          logger.debug(
            `[ReActProcessor] Executing tool (post-accumulation, no live response): ${parsedToolCall.name} with args:`,
            parsedToolCall.arguments,
            `(ID: ${parsedToolCall.id})`,
          );

          let observation: ReactObservation;
          try {
            observation = await this.toolExecutor(
              parsedToolCall.name,
              parsedToolCall.arguments,
              parsedToolCall.id,
              this.activeCdpTargetId,
            );
          } catch (execError) {
            logger.error(
              `[ReActProcessor] Tool executor failed for ${parsedToolCall.name}:`,
              execError,
            );
            observation = {
              tool_call_id: parsedToolCall.id,
              tool_name: parsedToolCall.name,
              result: null,
              error:
                execError instanceof Error
                  ? execError.message
                  : String(execError),
            };
          }

          // Yield observation information to frontend
          yield {
            type: "observation",
            content: JSON.stringify(observation, null, 2),
            toolCallId: parsedToolCall.id,
            toolName: parsedToolCall.name,
            result: observation.result,
            error: observation.error,
          };

          const observationMessage = `<${REACT_XML_TAGS.OBSERVATION}>${JSON.stringify(observation)}</${REACT_XML_TAGS.OBSERVATION}>`;
          currentMessages.push({ role: "user", content: observationMessage });
          continue;
        } else {
          logger.warn(
            "[ReActProcessor] Failed to parse tool call (post-accumulation):",
            toolCallContent,
          );
          const errorObservationMsg = `<${REACT_XML_TAGS.OBSERVATION}>${JSON.stringify(
            {
              error:
                "Malformed tool call XML or JSON content (post-accumulation).",
              tool_call_content: toolCallContent,
            },
          )}</${REACT_XML_TAGS.OBSERVATION}>`;
          currentMessages.push({ role: "user", content: errorObservationMsg });
          const malformedToolError = new Error(
            "Malformed tool call from LLM (post-accumulation).",
          );
          yield {
            type: "error",
            error: malformedToolError,
          } as TextStreamPart<Record<string, CoreTool>>;
          continue;
        }
      } else if (toolCallContent) {
        // Handle tool call even when streaming has started
        logger.debug(
          `[ReActProcessor] Found tool call content during streaming: ${toolCallContent}`,
        );
        const parsedToolCall = parseReactToolCall(toolCallContent);
        logger.debug(
          `[ReActProcessor] Parsed tool call during streaming:`,
          parsedToolCall,
        );

        if (parsedToolCall) {
          yield {
            type: "tool-call",
            toolName: parsedToolCall.name,
            toolArgs: parsedToolCall.arguments,
            toolId: parsedToolCall.id,
          };

          logger.debug(
            `[ReActProcessor] Executing tool during streaming: ${parsedToolCall.name} with args:`,
            parsedToolCall.arguments,
            `(ID: ${parsedToolCall.id})`,
          );

          let observation: ReactObservation;
          try {
            observation = await this.toolExecutor(
              parsedToolCall.name,
              parsedToolCall.arguments,
              parsedToolCall.id,
              this.activeCdpTargetId,
            );
          } catch (execError) {
            logger.error(
              `[ReActProcessor] Tool executor failed for ${parsedToolCall.name}:`,
              execError,
            );
            observation = {
              tool_call_id: parsedToolCall.id,
              tool_name: parsedToolCall.name,
              result: null,
              error:
                execError instanceof Error
                  ? execError.message
                  : String(execError),
            };
          }

          yield {
            type: "observation",
            content: JSON.stringify(observation, null, 2),
            toolCallId: parsedToolCall.id,
            toolName: parsedToolCall.name,
            result: observation.result,
            error: observation.error,
          };

          const observationMessage = `<${REACT_XML_TAGS.OBSERVATION}>${JSON.stringify(observation)}</${REACT_XML_TAGS.OBSERVATION}>`;
          currentMessages.push({ role: "user", content: observationMessage });
          continue;
        } else {
          logger.warn(
            "[ReActProcessor] Failed to parse tool call during streaming:",
            toolCallContent,
          );
          const errorObservationMsg = `<${REACT_XML_TAGS.OBSERVATION}>${JSON.stringify(
            {
              error:
                "Malformed tool call XML or JSON content during streaming.",
              tool_call_content: toolCallContent,
            },
          )}</${REACT_XML_TAGS.OBSERVATION}>`;
          currentMessages.push({ role: "user", content: errorObservationMsg });
          const malformedToolError = new Error(
            "Malformed tool call from LLM during streaming.",
          );
          yield {
            type: "error",
            error: malformedToolError,
          } as TextStreamPart<Record<string, CoreTool>>;
          continue;
        }
      } else if (hasStartedStreamingThisResponse) {
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0 },
        };
        return;
      } else if (
        extractXmlTagContent(llmResponseContent, REACT_XML_TAGS.RESPONSE)
      ) {
        const finalResponse = this._extractAndCleanTag(
          llmResponseContent,
          REACT_XML_TAGS.RESPONSE,
        );
        if (finalResponse && finalResponse.trim().length > 0) {
          yield { type: "text-delta", textDelta: finalResponse };
        }
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0 },
        };
        return;
      } else {
        logger.warn(
          `[ReActProcessor] No tool call or <response> tag in accumulated content. Fallback. Raw: "${llmResponseContent}"`,
        );
        const cleanedFallback = this._stripReActTags(llmResponseContent);
        if (cleanedFallback.trim().length > 0) {
          yield { type: "text-delta", textDelta: cleanedFallback };
        } else if (!thought) {
          logger.warn(
            "[ReActProcessor] LLM produced empty/whitespace with no ReAct tags & no thought.",
          );
        }
        yield {
          type: "finish",
          finishReason: "stop",
          usage: { promptTokens: 0, completionTokens: 0 },
        };
        return;
      }
    }

    logger.warn("[ReActProcessor] Maximum iterations reached.");
    const maxIterationsError = new Error(
      "Agent reached maximum iterations without a final answer.",
    );
    yield {
      type: "error",
      error: maxIterationsError,
    } as TextStreamPart<Record<string, CoreTool>>;
    yield {
      type: "finish",
      finishReason: "error",
      usage: { promptTokens: 0, completionTokens: 0 },
    };
  }
}
