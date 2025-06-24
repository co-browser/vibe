/**
 * RAG (Retrieval Augmented Generation) types
 * Local to mcp-rag package - these types are only used within this package
 */

import type { MCPServerConfig } from "@vibe/shared-types";

// RAG Server Configuration (extends base MCP config)
export interface RAGServerConfig extends MCPServerConfig {
  turbopufferApiKey?: string;
  enablePerplexityChunking?: boolean;
  fastMode?: boolean;
  verboseLogs?: boolean;
}

// RAG Chunk representation
export interface RAGChunk {
  chunkId: string;
  docId: string;
  text: string;
  headingPath: string;
  chunkType: "content" | "metadata" | "image_context" | "action";
  url: string;
  title: string;
  score?: number;
}

// Enhanced chunk with additional metadata
export interface EnhancedRAGChunk extends RAGChunk {
  metadata?: {
    byline?: string;
    publishedTime?: string;
    siteName?: string;
    excerpt?: string;
    imageCount?: number;
    linkCount?: number;
  };
}

// RAG Ingestion Result
export interface RAGIngestionResult {
  url: string;
  title: string;
  nChunks: number;
  processingTimeMs: number;
  chunkTypes: Record<string, number>;
  docId?: string;
}

// RAG Query Result
export interface RAGQueryResult {
  chunks: RAGChunk[];
  query: string;
  totalResults: number;
  searchTimeMs?: number;
}

// RAG Tool Response
export interface RAGToolResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// RAG Server Status
export interface RAGServerStatus {
  status: "healthy" | "error";
  service: string;
  timestamp: string;
  port: number;
  version?: string;
  capabilities?: string[];
}