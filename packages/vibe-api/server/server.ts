import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import "dotenv/config";
import http from "http";

import { createRouter } from "./router";
import { createContext, onTrpcError } from "./trpc";
import * as api from "../api";

async function parseJSONBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

async function main() {
  console.log(`[API] starting...`);

  // Initialize agent with config from environment
  const agentConfig = {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    openaiApiKey: process.env.OPENAI_API_KEY,
    temperature: 0.7,
    processorType: "react" as const,
  };

  try {
    await api.initializeAgent(agentConfig);
    console.log("[API] Agent initialized");
  } catch (error) {
    console.error("[API] Failed to initialize agent:", error);
    // Continue anyway - endpoints will return appropriate errors
  }

  console.log(`[API] serving...`);
  const router = createRouter();
  const handler = createHTTPHandler({
    middleware: cors(),
    router,
    createContext,
    onError: onTrpcError,
  });

  const trpcPrefix = `/api/`;
  const server = http.createServer(async (req, res) => {
    // Enable CORS for all requests
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    // Handle OPTIONS preflight requests
    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    // SSE endpoint for chat streaming
    if (req.url === "/api/agent/chat" && req.method === "POST") {
      console.log(`[API] SSE chat endpoint called`);

      try {
        const { message } = await parseJSONBody(req);

        if (!message) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Message is required" }));
          return;
        }

        // Set SSE headers
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });

        // Stream responses
        try {
          for await (const event of api.sendMessage(message)) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          res.write('data: {"type":"done"}\n\n');
        } catch (streamError) {
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error:
                streamError instanceof Error
                  ? streamError.message
                  : "Unknown streaming error",
            })}\n\n`,
          );
        }

        res.end();
      } catch (error) {
        console.error("[API] SSE chat error:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error:
              error instanceof Error ? error.message : "Internal server error",
          }),
        );
      }
      return;
    }

    // Handle tRPC requests
    if (req.url?.startsWith(trpcPrefix)) {
      console.log(`[API] serving ${req.method} ${req.url}`);
      req.url = "/" + req.url.slice(trpcPrefix.length);
      handler(req, res);
      return;
    }

    console.log(`[API] SKIPPING ${req.url}`);
    res.writeHead(404);
    res.end();
  });

  const port = Number(process.env.PORT) || 3000;
  server.listen(port);

  console.log(`[API] listening on port ${port}`);
  console.log(
    `[API] SSE chat endpoint: POST http://localhost:${port}/api/agent/chat`,
  );
  console.log(`[API] tRPC endpoints: http://localhost:${port}/api/*`);
}

main().catch(console.error);
