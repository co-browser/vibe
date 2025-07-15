// src/router.ts
import { z } from "zod";
import { t } from "./trpc";

// Basic tRPC setup -----------------------------------------------------------
const publicProcedure = t.procedure;

const startTimeS = Date.now() / 1000;

// Minimal router -------------------------------------------------------------
export const createRouter = () =>
  t.router({
    // Simple “health” endpoint (GET /health)
    health: publicProcedure.query(() => ({
      status: "healthy",
      uptimeS: Math.floor(Date.now() / 1000 - startTimeS),
    })),

    // Example echo endpoint (POST /echo)
    echo: publicProcedure
      .input(z.object({ msg: z.string() }))
      .mutation(({ input }) => ({ msg: input.msg })),
  });

