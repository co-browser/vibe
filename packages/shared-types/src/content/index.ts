/**
 * Content types shared between agent and MCP systems
 */

export interface ContentChunk {
  id: string;
  url: string;
  title?: string;
  content: string;
  text?: string; // Alternative content field
  source_id?: string;
  similarity?: number;
  metadata: {
    title: string;
    sourceId: string;
    similarity?: number;
  };
}
