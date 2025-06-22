/**
 * MCP Gmail Local Types
 * Types specific to the mcp-gmail package
 */

import type { z } from 'zod';

/**
 * Gmail Tool interface - used for defining MCP tools for Gmail operations
 */
export interface GmailTool {
  name: string;
  description: string;
  inputSchema: any;
  zodSchema: z.ZodSchema<any>;
  execute: (args: any) => Promise<string>;
}