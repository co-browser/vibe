// src/router.ts
import { initTRPC } from "@trpc/server";
import { z } from "zod";

// Basic tRPC setup -----------------------------------------------------------
const t = initTRPC.create();
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

