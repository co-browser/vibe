/**
 * Agent Core Local Types
 * Types specific to the agent-core package - not shared with other packages
 */

import type { CoreMessage } from "ai";
import type {
  StreamResponse,
  ExtractedPage,
  AgentConfig,
  MCPTool,
} from "@vibe/shared-types";
import type { ReActStreamPart } from "./react/react-processor.js";
import type { CoActStreamPart } from "./react/coact-processor.js";
import type { ReactObservation } from "./react/types.js";

// Processor types
export type ProcessorType = "react" | "coact";
export type CombinedStreamPart = ReActStreamPart | CoActStreamPart;

// Tool Manager Interface - only used within agent-core
export interface IToolManager {
  getTools(): Promise<Record<string, MCPTool> | undefined>;
  executeTools(
    toolName: string,
    args: Record<string, unknown>,
    toolCallId: string,
  ): Promise<ReactObservation>;
  formatToolsForReact(): Promise<string>;
  saveTabMemory(extractedPage: ExtractedPage): Promise<void>;
  saveConversationMemory(userMessage: string, response: string): Promise<void>;
  getConversationHistory(): Promise<CoreMessage[]>;
  clearToolCache(): void;
}

// Stream Processor Interface - only used within agent-core
export interface IStreamProcessor {
  processStreamPart(part: CombinedStreamPart): StreamResponse | null;
}

// Re-export shared AgentConfig for local use
export type { AgentConfig };
