/**
 * MCP Gmail Local Types
 * Types specific to the mcp-gmail package
 */

import type { z } from 'zod';

/**
 * Gmail Tool interface - used for defining MCP tools for Gmail operations
 */
export interface GmailTool<T = Record<string, unknown>> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  zodSchema: z.ZodSchema<T>;
  execute: (args: T) => Promise<string>;
}