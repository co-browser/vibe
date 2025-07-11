import { createHTTPHandler } from "@trpc/server/adapters/standalone";
import cors from "cors";
import "dotenv/config";
import http from "http";

import { createRouter } from "./router";
import { createContext, onTrpcError } from "./trpc";

async function main() {
  console.log(`[API] starting...`);

  console.log(`[API] serving...`);
  const router = createRouter();
  const handler = createHTTPHandler({
    middleware: cors(),
    router,
    createContext,
    onError: onTrpcError,
  });

  const trpcPrefix = `/api/`;
  const server = http.createServer((req, res) => {
    if (req.url == null || !req.url.startsWith(trpcPrefix)) {
      console.log(`[API] SKIPPING ${req.url}`);
      res.writeHead(404);
      res.end();
      return;
    }

    console.log(`[API] serving ${req.method} ${req.url}`);

    req.url = "/" + req.url.slice(trpcPrefix.length);
    handler(req, res);
  });

  const port = Number(process.env.PORT) || 3000;
  server.listen(port).address();

  console.log(`[API] listening on port ${port}`);
}

main().catch(console.error);
