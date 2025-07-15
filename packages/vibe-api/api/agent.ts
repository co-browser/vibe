import { Agent, AgentFactory } from "@vibe/agent-core";
import type {
  AgentConfig,
  StreamResponse,
  ExtractedPage,
  AgentStatus,
} from "@vibe/shared-types";

let agent: Agent | null = null;

export async function initializeAgent(config: AgentConfig): Promise<void> {
  agent = await AgentFactory.create(config);
}

export async function* sendMessage(
  message: string,
): AsyncGenerator<StreamResponse> {
  if (!agent) throw new Error("Agent not initialized");
  yield* agent.handleChatStream(message);
}

export function getStatus(): AgentStatus {
  if (!agent) {
    return {
      ready: false,
      initialized: false,
      serviceStatus: "disconnected" as const,
    };
  }
  // Agent doesn't have getStatus method, so we return a basic status
  return {
    ready: true,
    initialized: true,
    serviceStatus: "ready" as const,
  };
}

export async function saveTabMemory(
  extractedPage: ExtractedPage,
): Promise<void> {
  if (!agent) throw new Error("Agent not initialized");
  return agent.saveTabMemory(extractedPage);
}

export async function updateAuthToken(token: string | null): Promise<void> {
  if (!agent) throw new Error("Agent not initialized");
  // Agent uses updateMCPConnections instead of updateAuthToken
  return agent.updateMCPConnections(token);
}

export async function reset(): Promise<void> {
  if (!agent) throw new Error("Agent not initialized");
  return agent.reset();
}
