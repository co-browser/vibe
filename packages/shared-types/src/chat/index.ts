/**
 * Chat-related shared types
 */

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  parts?: Array<{
    type: string;
    text?: string;
    tool_name?: string;
    args?: any;
    tool_call_id?: string;
    [key: string]: any;
  }>;
}

export interface AgentProgress {
  type:
    | "thinking"
    | "action"
    | "complete"
    | "error"
    | "extracting"
    | "responding";
  message: string;
  details?: any;
}

export interface StreamResponse {
  type:
    | "text-delta"
    | "error"
    | "done"
    | "progress"
    | "tool-call"
    | "observation";
  // Text streaming fields
  textDelta?: string;
  error?: string;
  message?: string;
  stage?: string;
  // Tool call fields
  toolName?: string;
  toolArgs?: Record<string, any>;
  toolId?: string;
  // Observation fields
  toolCallId?: string;
  content?: string;
  result?: any;
}
