import assert from "node:assert";
import test from "node:test";
import { createTRPCClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../server/router';

const client = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: 'http://localhost:3000/api',
    }),
  ],
});

test("API basic functionality", async () => {
  // Test 1: Health endpoint
  await test("health endpoint", async () => {
    const health = await client.health.query();
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(typeof health.uptimeS, 'number');
    assert.ok(health.uptimeS >= 0);
  });

  // Test 2: Echo endpoint
  await test("echo endpoint", async () => {
    const testMessage = 'Hello, tRPC!';
    const echo = await client.echo.mutate({ msg: testMessage });
    assert.strictEqual(echo.msg, testMessage);
  });

  // Test 3: Invalid endpoint (404 handling)
  await test("404 handling", async () => {
    const response = await fetch('http://localhost:3000/invalid-path');
    assert.strictEqual(response.status, 404);
  });
});