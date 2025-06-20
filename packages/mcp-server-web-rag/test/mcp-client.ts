import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ExtractedPage } from '@vibe/tab-extraction-core';

interface TestResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class RAGTestClient {
  private client: Client;
  private transport: StreamableHTTPClientTransport;
  private isConnected = false;

  constructor(serverUrl: string = 'http://localhost:3000/mcp') {
    this.client = new Client({
      name: 'rag-test-client',
      version: '1.0.0',
    });

    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
  }

  async connect(): Promise<void> {
    if (this.isConnected) return;
    
    await this.client.connect(this.transport);
    this.isConnected = true;
    console.log('✅ Connected to RAG server');
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;
    
    await this.transport.close();
    this.isConnected = false;
    console.log('✅ Disconnected from RAG server');
  }

  async listTools(): Promise<TestResult> {
    try {
      const result = await this.client.listTools();
      return {
        success: true,
        data: result.tools
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async ingestUrl(url: string): Promise<TestResult> {
    try {
      const result = await this.client.callTool({
        name: 'ingest_url',
        arguments: { url }
      });

      if (result.isError) {
        return {
          success: false,
          error: typeof result.error === 'string' ? result.error : String(result.error)
        };
      }

      return {
        success: true,
        data: result.content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async ingestExtractedPage(extractedPage: ExtractedPage): Promise<TestResult> {
    try {
      const result = await this.client.callTool({
        name: 'ingest_extracted_page',
        arguments: { extractedPage }
      });

      if (result.isError) {
        return {
          success: false,
          error: typeof result.error === 'string' ? result.error : String(result.error)
        };
      }

      return {
        success: true,
        data: result.content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async queryKnowledgeBase(query: string, top_k: number = 5): Promise<TestResult> {
    try {
      const result = await this.client.callTool({
        name: 'query_kb',
        arguments: { query, top_k }
      });

      if (result.isError) {
        return {
          success: false,
          error: typeof result.error === 'string' ? result.error : String(result.error)
        };
      }

      return {
        success: true,
        data: result.content
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
} 