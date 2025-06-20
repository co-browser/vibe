/**
 * RAG (Retrieval Augmented Generation) related types and interfaces
 */

import type { MCPServerConfig } from "../mcp/index.js";

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
  n_chunks: number;
  processing_time_ms: number;
  chunk_types: Record<string, number>;
  doc_id?: string;
}

// RAG Query Result
export interface RAGQueryResult {
  chunks: RAGChunk[];
  query: string;
  total_results: number;
  search_time_ms?: number;
}

// RAG Tool Response
export interface RAGToolResponse {
  success: boolean;
  data?: any;
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
