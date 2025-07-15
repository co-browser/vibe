export type {
  AgentConfig,
  StreamResponse,
  ExtractedPage,
  AgentStatus,
  ProcessorType,
} from "@vibe/shared-types";

export interface ChatRequest {
  message: string;
}

export interface ChatEvent {
  type:
    | "text-delta"
    | "error"
    | "done"
    | "progress"
    | "tool-call"
    | "observation";
  [key: string]: any;
}
