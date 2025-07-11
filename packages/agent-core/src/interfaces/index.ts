import type { CoreMessage } from "ai";
import type { StreamResponse, ProcessorType } from "@vibe/shared-types";
import type { ReActStreamPart } from "../react/react-processor.js";
import type { CoActStreamPart } from "../react/coact-processor.js";
import type { ReactObservation } from "../react/types.js";
import type { ExtractedPage } from "@vibe/shared-types";

export type CombinedStreamPart = ReActStreamPart | CoActStreamPart;

export interface IToolManager {
  getTools(): Promise<any>;
  executeTools(
    toolName: string,
    args: any,
    toolCallId: string,
  ): Promise<ReactObservation>;
  formatToolsForReact(): Promise<string>;
  saveTabMemory(extractedPage: ExtractedPage): Promise<void>;
  saveConversationMemory(userMessage: string, response: string): Promise<void>;
  getConversationHistory(): Promise<CoreMessage[]>;
  clearToolCache(): void;
}

export interface IStreamProcessor {
  processStreamPart(part: CombinedStreamPart): StreamResponse | null;
}

export interface IAgentConfig {
  openaiApiKey?: string;
  model: string;
  temperature?: number;
  maxTokensPerTab?: number;
  processorType?: ProcessorType;
  systemPrompt?: string;
  conversationHistory?: [string, string][];
  authToken?: string;
  mcp?: {
    enabled: boolean;
    url: string;
  };
}
