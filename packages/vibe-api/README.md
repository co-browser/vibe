# @vibe/api

Remote API interface for the Vibe agent-core, providing HTTP/tRPC endpoints for agent functionality.

## Architecture

This API serves as a remote interface to `@vibe/agent-core`, exposing all agent functionality through:

- **tRPC endpoints** for standard request/response operations
- **Server-Sent Events (SSE)** for streaming chat responses

## Setup

1. Copy `.env.example` to `.env` and configure:

   ```bash
   cp .env.example .env
   ```

2. Add your OpenAI API key to `.env`:

   ```env
   OPENAI_API_KEY=sk-...
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

## Running the API

### Development mode:

```bash
pnpm dev
```

### Production mode:

```bash
pnpm start
```

The API will start on `http://localhost:3000` (or the port specified in your `.env` file).

## Endpoints

### Health Check

- **GET** `/api/health` - Returns API health status

### Agent Operations

- **POST** `/api/agent.initialize` - Initialize the agent with configuration
- **GET** `/api/agent.status` - Get current agent status
- **POST** `/api/agent.saveTabMemory` - Save extracted page content to memory
- **PUT** `/api/agent.updateAuthToken` - Update authentication token
- **POST** `/api/agent.reset` - Reset the agent

### Chat Streaming (SSE)

- **POST** `/api/agent/chat` - Stream chat responses using Server-Sent Events

## Testing

### Quick test with curl:

```bash
# Health check
curl http://localhost:3000/api/health

# Initialize agent
curl -X POST http://localhost:3000/api/agent.initialize \
  -H "Content-Type: application/json" \
  -d '{"model": "gpt-4o-mini"}'

# Chat (streaming)
curl -X POST http://localhost:3000/api/agent/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello!"}' \
  -N
```

### Run the test client:

```bash
node test-client.mjs
```

## Client Usage Example

### TypeScript/JavaScript with tRPC:

```typescript
import { createTRPCClient } from "@trpc/client";
import type { AppRouter } from "@vibe/api";

const client = createTRPCClient<AppRouter>({
  url: "http://localhost:3000/api",
});

// Initialize agent
await client.agent.initialize.mutate({
  model: "gpt-4o-mini",
  openaiApiKey: "sk-...",
});

// Get status
const status = await client.agent.status.query();
```

### Streaming chat with EventSource:

```javascript
const eventSource = new EventSource("http://localhost:3000/api/agent/chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello!" }),
});

eventSource.onmessage = event => {
  const data = JSON.parse(event.data);
  console.log("Received:", data);
};
```

## Environment Variables

| Variable         | Description               | Default       |
| ---------------- | ------------------------- | ------------- |
| `OPENAI_API_KEY` | OpenAI API key            | Required      |
| `OPENAI_MODEL`   | Model to use              | `gpt-4o-mini` |
| `PORT`           | Server port               | `3000`        |
| `MCP_SERVER_*`   | MCP server configurations | Optional      |

## Development

### Lint the code:

```bash
pnpm lint
```

### Build for production:

```bash
pnpm build
```
