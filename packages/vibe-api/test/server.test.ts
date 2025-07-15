import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "../server/router";
import { createHTTPServer } from "@trpc/server/adapters/standalone";
import { createRouter } from "../server/router";
import cors from "cors";

// Mock the agent module to avoid initialization issues
vi.mock("../api/agent", () => ({
  getStatus: () => ({ initialized: true, ready: true }),
  initializeAgent: vi.fn(),
}));

describe("API basic functionality", () => {
  let server: any;
  let client: ReturnType<typeof createTRPCClient<AppRouter>>;
  const PORT = 3333; // Use different port to avoid conflicts

  beforeAll(async () => {
    // Create and start test server
    const router = createRouter();
    server = createHTTPServer({
      router,
      middleware: cors(),
      createContext: () => ({}),
    });

    await new Promise<void>(resolve => {
      server.listen(PORT, () => {
        resolve();
      });
    });

    // Create client
    client = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `http://localhost:${PORT}`,
        }),
      ],
    });
  });

  afterAll(async () => {
    // Close server
    if (server) {
      await new Promise<void>(resolve => {
        server.close(() => {
          resolve();
        });
      });
    }
  });

  it("should return health status", async () => {
    const health = await client.health.query();
    expect(health.status).toBe("healthy");
    expect(typeof health.uptime).toBe("number");
    expect(health.uptime).toBeGreaterThanOrEqual(0);
    expect(health.agent).toBeDefined();
    expect(health.timestamp).toBeDefined();
  });

  it("should echo messages", async () => {
    const testMessage = "Hello, tRPC!";
    const echo = await client.echo.mutate({ msg: testMessage });
    expect(echo.msg).toBe(testMessage);
  });

  it("should handle 404 for invalid paths", async () => {
    const response = await fetch(`http://localhost:${PORT}/invalid-path`);
    expect(response.status).toBe(404);
  });
});
