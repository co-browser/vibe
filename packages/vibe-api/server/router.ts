// src/router.ts
import { initTRPC } from "@trpc/server";
import { z } from "zod";
import * as api from "../api";

// Basic tRPC setup -----------------------------------------------------------
const t = initTRPC.create();
const publicProcedure = t.procedure;

// Zod schemas for input validation -------------------------------------------
const agentConfigSchema = z.object({
  openaiApiKey: z.string().optional(),
  model: z.string(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  processorType: z.enum(["react", "coact"]).optional(),
  keepAlive: z.string().optional(),
  mcp: z
    .object({
      enabled: z.boolean(),
      url: z.string(),
    })
    .optional(),
  tools: z.array(z.string()).optional(),
  systemPrompt: z.string().optional(),
  conversationHistory: z.array(z.tuple([z.string(), z.string()])).optional(),
  authToken: z.string().optional(),
});

const extractedPageSchema = z.object({
  // Required PageContent fields
  title: z.string(),
  url: z.string(),
  excerpt: z.string(),
  content: z.string(),
  textContent: z.string(),

  // Optional PageContent fields
  byline: z.string().optional(),
  siteName: z.string().optional(),
  publishedTime: z.string().optional(),
  modifiedTime: z.string().optional(),
  lang: z.string().optional(),
  dir: z.string().optional(),

  // Required ExtractedPage fields
  metadata: z.object({
    openGraph: z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        url: z.string().optional(),
        type: z.string().optional(),
        siteName: z.string().optional(),
      })
      .optional(),
    twitter: z
      .object({
        card: z.string().optional(),
        title: z.string().optional(),
        description: z.string().optional(),
        image: z.string().optional(),
        creator: z.string().optional(),
      })
      .optional(),
    jsonLd: z.array(z.any()).optional(),
    microdata: z.array(z.any()).optional(),
  }),
  images: z.array(
    z.object({
      src: z.string(),
      alt: z.string().optional(),
      title: z.string().optional(),
    }),
  ),
  links: z.array(
    z.object({
      href: z.string(),
      text: z.string(),
      rel: z.string().optional(),
    }),
  ),
  actions: z.array(
    z.object({
      type: z.enum(["button", "link", "form"]),
      selector: z.string(),
      text: z.string(),
      attributes: z.record(z.string()),
    }),
  ),
  extractionTime: z.number(),
  contentLength: z.number(),
});

// Router ---------------------------------------------------------------------
export const createRouter = () =>
  t.router({
    // Health check endpoint
    health: publicProcedure.query(() => api.getHealth()),

    // Agent endpoints
    agent: t.router({
      // Initialize agent
      initialize: publicProcedure
        .input(agentConfigSchema)
        .mutation(async ({ input }) => {
          await api.initializeAgent(input);
          return { success: true };
        }),

      // Get agent status
      status: publicProcedure.query(() => api.getStatus()),

      // Save tab memory
      saveTabMemory: publicProcedure
        .input(extractedPageSchema)
        .mutation(async ({ input }) => {
          await api.saveTabMemory(input);
          return { success: true };
        }),

      // Update auth token
      updateAuthToken: publicProcedure
        .input(z.object({ token: z.string().nullable() }))
        .mutation(async ({ input }) => {
          await api.updateAuthToken(input.token);
          return { success: true };
        }),

      // Reset agent
      reset: publicProcedure.mutation(async () => {
        await api.reset();
        return { success: true };
      }),
    }),

    // Legacy endpoints (kept for compatibility)
    echo: publicProcedure
      .input(z.object({ msg: z.string() }))
      .mutation(({ input }) => ({ msg: input.msg })),
  });

// Export the type for your client
export type AppRouter = ReturnType<typeof createRouter>;
