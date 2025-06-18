import { Agent } from "./agent.js";
import { ToolManager } from "./managers/tool-manager.js";
import { StreamProcessor } from "./managers/stream-processor.js";
import type { AgentConfig } from "./types.js";

// New AgentFactory class
export class AgentFactory {
  static create(config: AgentConfig): Agent {
    // Wire up manager dependencies without MCP
    const toolManager = new ToolManager();
    const streamProcessor = new StreamProcessor();

    // Create and return configured Agent with pure ReAct implementation
    return new Agent(toolManager, streamProcessor, config);
  }
}

// Backward-compatible createAgent function
export function createAgent(config: AgentConfig): Agent {
  return AgentFactory.create(config);
}
