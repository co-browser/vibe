import type { IStreamProcessor, CombinedStreamPart } from "../types.js";
import type { StreamResponse } from "@vibe/shared-types";

export class StreamProcessor implements IStreamProcessor {
  processStreamPart(part: CombinedStreamPart): StreamResponse | null {
    switch (part.type) {
      case "reasoning":
        return {
          type: "progress",
          message: part.textDelta,
          stage: "thinking",
        };

      case "planning":
        return {
          type: "progress",
          message: part.textDelta,
          stage: "planning",
        };

      case "task-start":
        return {
          type: "progress",
          message: `🎯 Task ${part.taskIndex}: ${part.taskDescription}`,
          stage: "executing",
        };

      case "replanning":
        return {
          type: "progress",
          message: `🔄 Replanning: ${part.reason}`,
          stage: "replanning",
        };

      case "tool-call":
        // Handle custom ReAct tool-call format
        if ("toolName" in part && "toolArgs" in part && "toolId" in part) {
          return {
            type: "tool-call",
            toolName: part.toolName,
            toolArgs: part.toolArgs,
            toolId: part.toolId,
          };
        }
        // Handle AI SDK tool-call format
        if ("toolCallId" in part && "toolName" in part && "args" in part) {
          return {
            type: "tool-call",
            toolName: part.toolName,
            toolArgs: part.args,
            toolId: part.toolCallId,
          };
        }
        return null;

      case "observation":
        return {
          type: "observation",
          content: part.content,
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.result,
          error: part.error,
        };

      case "text-delta":
        return {
          type: "text-delta",
          textDelta: part.textDelta,
        };

      case "error":
        return {
          type: "error",
          error:
            part.error instanceof Error
              ? part.error.message
              : String(part.error),
        };

      case "finish":
        return { type: "done" };

      // Handle other specific AI SDK stream parts that we want to ignore
      case "step-start":
      case "step-finish":
      case "tool-call-streaming-start":
      case "tool-call-delta":
      case "response-metadata":
        return null;

      default:
        // For any unhandled stream part types, return null to filter them out
        return null;
    }
  }
}
