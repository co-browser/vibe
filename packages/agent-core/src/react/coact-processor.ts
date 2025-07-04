/**
 * PRELIMINARY CoAct Processor
 * Implements the CoAct (Coordinated Act) framework
 * Enables hierarchical task decomposition with global planning and local execution
 * CoAct: Plan → Execute → Observe → Repeat
 * First creates a global plan across multiple steps, then executes each with local reasoning.
 */

import {
  streamText,
  type CoreTool,
  type CoreMessage,
  type TextStreamPart,
  type LanguageModelV1StreamPart,
} from "ai";
import { openai } from "@ai-sdk/openai";
import { REACT_XML_TAGS, MAX_REACT_ITERATIONS } from "./config";
import { extractXmlTagContent, parseReactToolCall } from "./xml-parser";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("CoactProcessor");
import type { ReactObservation, ToolExecutor } from "./types";

// Extended CoAct stream part type
export type CoActStreamPart =
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
    }
  | {
      type: "planning";
      textDelta: string;
    }
  | {
      type: "task-start";
      taskDescription: string;
      taskIndex: number;
    }
  | {
      type: "replanning";
      reason: string;
    };

interface Task {
  id: string;
  description: string;
  priority: number;
  dependencies?: string[];
  status: "pending" | "executing" | "completed" | "failed";
  result?: any;
  error?: string;
}

interface ExecutionPlan {
  tasks: Task[];
  strategy: string;
  context: string;
}

export class CoActProcessor {
  private readonly GLOBAL_PLANNER_SYSTEM_PROMPT = `
You are a Global Planner in a CoAct system. Your role is to decompose complex user queries into structured, actionable tasks.

Available tools: %TOOLS_SIGNATURE%

When planning, follow these guidelines:
1. Break down the user's request into specific, actionable tasks
2. Consider dependencies between tasks
3. Prioritize tasks based on logical execution order
4. Provide clear task descriptions that the Local Executor can understand

Respond with your planning thoughts in <${REACT_XML_TAGS.THOUGHT}> tags, followed by a structured plan in <plan> tags containing JSON with this format:
{
  "strategy": "Brief description of overall approach",
  "context": "Key context for execution",
  "tasks": [
    {
      "id": "task_1",
      "description": "Specific task description",
      "priority": 1,
      "dependencies": [],
      "status": "pending"
    }
  ]
}
`;

  private readonly LOCAL_EXECUTOR_SYSTEM_PROMPT = `
You are a Local Executor in a CoAct system. Your role is to execute specific tasks using available tools.

Available tools: %TOOLS_SIGNATURE%

When executing tasks:
1. Focus on the specific task assigned to you
2. Use <${REACT_XML_TAGS.THOUGHT}> for reasoning about the task
3. Use <${REACT_XML_TAGS.TOOL_CALL}> for tool invocations
4. Use <${REACT_XML_TAGS.RESPONSE}> for final task results when no tools are needed

Execute the task efficiently and report clear results or errors.
`;

  constructor(
    private model: ReturnType<typeof openai>,
    private formattedToolsSignature: string,
    private maxIterations: number = MAX_REACT_ITERATIONS,
    private toolExecutor: ToolExecutor,
    private activeCdpTargetId?: string | null,
  ) {}

  private async generateGlobalPlan(
    query: string,
    chatHistory: CoreMessage[],
  ): Promise<{ plan: ExecutionPlan; reasoning: string }> {
    const systemPrompt = this.GLOBAL_PLANNER_SYSTEM_PROMPT.replace(
      "%TOOLS_SIGNATURE%",
      this.formattedToolsSignature,
    );

    const messages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      {
        role: "user",
        content: `<${REACT_XML_TAGS.QUESTION}>${query}</${REACT_XML_TAGS.QUESTION}>`,
      },
    ];

    const stream = await streamText({
      model: this.model,
      messages,
      temperature: 0.3,
    });

    let fullResponse = "";
    for await (const part of stream.fullStream) {
      if (part.type === "text-delta") {
        fullResponse += part.textDelta;
      }
    }

    const reasoning =
      extractXmlTagContent(fullResponse, REACT_XML_TAGS.THOUGHT) || "";
    const planContent = extractXmlTagContent(fullResponse, "plan");

    let plan: ExecutionPlan;
    try {
      plan = planContent
        ? JSON.parse(planContent)
        : {
            strategy: "Sequential execution",
            context: query,
            tasks: [
              {
                id: "task_1",
                description: query,
                priority: 1,
                dependencies: [],
                status: "pending" as const,
              },
            ],
          };
    } catch {
      logger.warn("[CoActProcessor] Failed to parse plan, using fallback");
      plan = {
        strategy: "Sequential execution",
        context: query,
        tasks: [
          {
            id: "task_1",
            description: query,
            priority: 1,
            dependencies: [],
            status: "pending" as const,
          },
        ],
      };
    }

    return { plan, reasoning };
  }

  private async *executeTask(
    task: Task,
    plan: ExecutionPlan,
    chatHistory: CoreMessage[],
  ): AsyncGenerator<CoActStreamPart, Task, undefined> {
    const systemPrompt = this.LOCAL_EXECUTOR_SYSTEM_PROMPT.replace(
      "%TOOLS_SIGNATURE%",
      this.formattedToolsSignature,
    );

    const taskContext = `
Context: ${plan.context}
Strategy: ${plan.strategy}
Current Task: ${task.description}
Task ID: ${task.id}
`;

    const messages: CoreMessage[] = [
      { role: "system", content: systemPrompt },
      ...chatHistory,
      { role: "user", content: taskContext },
    ];

    const executionMessages = [...messages];
    const taskResult: Task = { ...task, status: "executing" };

    for (let iteration = 0; iteration < this.maxIterations; iteration++) {
      let llmResponseContent = "";
      let llmStreamError: Error | null = null;

      try {
        const stream = await streamText({
          model: this.model,
          messages: executionMessages,
          temperature: 0.7,
        });

        // Stream reasoning content
        let inThoughtTag = false;
        let hasStartedStreamingThought = false;
        let partialClosingThoughtTagBuffer = "";

        for await (const part of stream.fullStream) {
          if (part.type === "text-delta") {
            const textDelta = part.textDelta;
            llmResponseContent += textDelta;

            // Handle thought streaming
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
            } else if (!hasStartedStreamingThought) {
              const openingThoughtTag = `<${REACT_XML_TAGS.THOUGHT}>`;
              const openingThoughtTagIndex =
                llmResponseContent.indexOf(openingThoughtTag);

              if (openingThoughtTagIndex !== -1) {
                inThoughtTag = true;
                hasStartedStreamingThought = true;

                const initialThoughtContent = llmResponseContent.substring(
                  openingThoughtTagIndex + openingThoughtTag.length,
                );
                const closingThoughtTag = `</${REACT_XML_TAGS.THOUGHT}>`;
                const closingThoughtTagIndex =
                  initialThoughtContent.indexOf(closingThoughtTag);

                if (closingThoughtTagIndex !== -1) {
                  const thoughtChunk = initialThoughtContent.substring(
                    0,
                    closingThoughtTagIndex,
                  );
                  if (thoughtChunk.length > 0) {
                    yield { type: "reasoning", textDelta: thoughtChunk };
                  }
                  inThoughtTag = false;
                } else {
                  if (initialThoughtContent.length > 0) {
                    yield {
                      type: "reasoning",
                      textDelta: initialThoughtContent,
                    };
                  }
                }
              }
            }
          } else if (part.type === "error") {
            yield part;
            llmStreamError =
              part.error instanceof Error
                ? part.error
                : new Error(String(part.error));
          }
        }

        if (llmStreamError) {
          taskResult.status = "failed";
          taskResult.error = llmStreamError.message;
          return taskResult;
        }

        executionMessages.push({
          role: "assistant",
          content: llmResponseContent,
        });

        // Check for tool call
        const toolCallContent = extractXmlTagContent(
          llmResponseContent,
          REACT_XML_TAGS.TOOL_CALL,
        );
        if (toolCallContent) {
          const parsedToolCall = parseReactToolCall(toolCallContent);
          if (parsedToolCall) {
            yield {
              type: "tool-call",
              toolName: parsedToolCall.name,
              toolArgs: parsedToolCall.arguments,
              toolId: parsedToolCall.id,
            };

            let observation: ReactObservation;
            try {
              observation = await this.toolExecutor(
                parsedToolCall.name,
                parsedToolCall.arguments,
                parsedToolCall.id,
                this.activeCdpTargetId,
              );
            } catch (execError) {
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

            if (observation.error) {
              taskResult.status = "failed";
              taskResult.error = observation.error;
              return taskResult;
            }

            const observationMessage = `<${REACT_XML_TAGS.OBSERVATION}>${JSON.stringify(observation)}</${REACT_XML_TAGS.OBSERVATION}>`;
            executionMessages.push({
              role: "user",
              content: observationMessage,
            });
            continue;
          }
        }

        // Check for final response
        const responseContent = extractXmlTagContent(
          llmResponseContent,
          REACT_XML_TAGS.RESPONSE,
        );
        if (responseContent) {
          taskResult.status = "completed";
          taskResult.result = responseContent;
          return taskResult;
        }

        // If no tool call or response, treat as completion
        const cleanedContent = this.stripReActTags(llmResponseContent);
        if (cleanedContent.trim()) {
          taskResult.status = "completed";
          taskResult.result = cleanedContent;
          return taskResult;
        }
      } catch (error) {
        logger.error(
          `[CoActProcessor] Error in task execution (iteration ${iteration}):`,
          error,
        );
        taskResult.status = "failed";
        taskResult.error =
          error instanceof Error ? error.message : String(error);
        return taskResult;
      }
    }

    taskResult.status = "failed";
    taskResult.error = "Maximum iterations reached without completion";
    return taskResult;
  }

  private stripReActTags(content: string | null): string {
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

  private shouldReplan(failedTask: Task, plan: ExecutionPlan): boolean {
    // Replan if a high priority task fails or if more than 30% of tasks fail
    const failedTasks = plan.tasks.filter(t => t.status === "failed").length;
    const totalTasks = plan.tasks.length;
    return failedTask.priority <= 2 || failedTasks / totalTasks > 0.3;
  }

  public async *process(
    initialUserQuery: string,
    chatHistory: CoreMessage[],
  ): AsyncGenerator<CoActStreamPart, void, undefined> {
    try {
      // Global Planning Phase
      yield {
        type: "planning",
        textDelta: "🧠 Analyzing query and creating execution plan...",
      };

      const { plan, reasoning } = await this.generateGlobalPlan(
        initialUserQuery,
        chatHistory,
      );

      if (reasoning) {
        yield { type: "reasoning", textDelta: reasoning };
      }

      yield {
        type: "planning",
        textDelta: `📋 Created plan with ${plan.tasks.length} tasks using strategy: ${plan.strategy}`,
      };

      // Local Execution Phase
      let currentPlan = { ...plan };
      let replanCount = 0;
      const maxReplans = 2;

      while (replanCount <= maxReplans) {
        let allTasksCompleted = true;
        let shouldReplan = false;

        for (let i = 0; i < currentPlan.tasks.length; i++) {
          const task = currentPlan.tasks[i];

          if (task.status === "completed") continue;
          if (task.status === "failed" && !this.shouldReplan(task, currentPlan))
            continue;

          // Check dependencies
          const dependenciesMet =
            task.dependencies?.every(
              depId =>
                currentPlan.tasks.find(t => t.id === depId)?.status ===
                "completed",
            ) ?? true;

          if (!dependenciesMet) {
            allTasksCompleted = false;
            continue;
          }

          yield {
            type: "task-start",
            taskDescription: task.description,
            taskIndex: i + 1,
          };

          const completedTask = yield* this.executeTask(
            task,
            currentPlan,
            chatHistory,
          );
          currentPlan.tasks[i] = completedTask;

          if (
            completedTask.status === "failed" &&
            this.shouldReplan(completedTask, currentPlan)
          ) {
            shouldReplan = true;
            yield {
              type: "replanning",
              reason: `Critical task failed: ${completedTask.error}. Replanning required.`,
            };
            break;
          }

          if (completedTask.status !== "completed") {
            allTasksCompleted = false;
          }
        }

        if (shouldReplan && replanCount < maxReplans) {
          replanCount++;
          yield {
            type: "planning",
            textDelta: `🔄 Replanning attempt ${replanCount}/${maxReplans}...`,
          };

          const replanQuery = `
Original query: ${initialUserQuery}
Failed execution context: ${JSON.stringify(currentPlan.tasks.filter(t => t.status === "failed"))}
Please create a new plan addressing the failures.
`;

          const { plan: newPlan, reasoning: newReasoning } =
            await this.generateGlobalPlan(replanQuery, chatHistory);
          currentPlan = newPlan;

          if (newReasoning) {
            yield { type: "reasoning", textDelta: newReasoning };
          }
          continue;
        }

        if (allTasksCompleted) {
          break;
        }

        if (!shouldReplan) {
          break;
        }
      }

      // Generate final response
      const completedTasks = currentPlan.tasks.filter(
        t => t.status === "completed",
      );
      const failedTasks = currentPlan.tasks.filter(t => t.status === "failed");

      if (completedTasks.length > 0) {
        const finalResult = completedTasks
          .map(t => t.result)
          .filter(Boolean)
          .join("\n\n");
        if (finalResult) {
          yield { type: "text-delta", textDelta: finalResult };
        }
      }

      if (failedTasks.length > 0) {
        const failureReport = `\n\nNote: ${failedTasks.length} task(s) failed: ${failedTasks.map(t => t.error).join(", ")}`;
        yield { type: "text-delta", textDelta: failureReport };
      }

      yield {
        type: "finish",
        finishReason: "stop",
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    } catch (error) {
      logger.error("[CoActProcessor] Critical error:", error);
      const criticalError =
        error instanceof Error ? error : new Error(String(error));
      yield {
        type: "error",
        error: criticalError,
      } as TextStreamPart<Record<string, CoreTool>>;
      yield {
        type: "finish",
        finishReason: "error",
        usage: { promptTokens: 0, completionTokens: 0 },
      };
    }
  }
}
