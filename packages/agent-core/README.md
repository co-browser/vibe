# @vibe/agent-core

Core AI agent framework for browser-integrated chat experiences with tool execution and context awareness.

## Features

- **ReAct Streaming**: Real-time reasoning and action execution using the ReAct framework
- **MCP Integration**: Tool execution via Model Context Protocol for extensible capabilities  
- **Context Awareness**: Automatic integration of browsing history and website content
- **Tab Memory**: Persistent storage of webpage content for knowledge building
- **Clean Architecture**: Dependency injection with focused, testable components

## Quick Start

```typescript
import { AgentFactory } from '@vibe/agent-core';

// Create agent with dependencies
const agent = AgentFactory.create({
  llmProvider: {
    type: "openai",
    apiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o-mini"
  },
  mcpServerUrl: "ws://localhost:3001"
});

// Stream chat responses
for await (const response of agent.handleChatStream(
  "What did I read about climate change?"  // MCP manages all context internally
)) {
  console.log(response);
}

// Save webpage content for future reference
await agent.saveTabMemory(url, title, content);
```

## Architecture

```
Agent (Orchestrator)
├── ContextManager    → Retrieves browsing history context
├── ToolManager       → Executes MCP tools & content operations  
├── StreamProcessor   → Processes ReAct stream parts
└── ReAct Framework   → Reasoning + tool execution pipeline
```

## Key Concepts

- **Agent**: Lightweight orchestrator that coordinates all components
- **MCP Tools**: External capabilities (search, memory, APIs) accessed via Model Context Protocol
- **MCP Memory**: Single source of truth for conversation history and context - no duplicate state
- **Website Context**: Automatic inclusion of relevant browsing history in chat responses
- **ReAct Streaming**: Iterative reasoning → action → observation → response cycle

Built for production use in browser applications requiring intelligent, context-aware AI assistance. 