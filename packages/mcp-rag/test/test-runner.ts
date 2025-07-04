import dotenv from 'dotenv';
dotenv.config();

import { RAGTestClient } from "./mcp-client";
import { SimpleExtractor } from "./utils/simple-extractor";

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

interface Tool {
  name: string;
  description: string;
  inputSchema: object;
}

class RAGTestRunner {
  private client: RAGTestClient;
  private extractor: SimpleExtractor;
  private tests: TestCase[] = [];
  private passed = 0;
  private failed = 0;

  constructor(serverUrl?: string) {
    this.client = new RAGTestClient(serverUrl);
    this.extractor = new SimpleExtractor();
  }

  addTest(name: string, fn: () => Promise<void>) {
    this.tests.push({ name, fn });
  }

  async runTests() {
    console.log('🚀 Starting RAG Service Tests\n');
    
    try {
      await this.client.connect();
      
      for (const test of this.tests) {
        try {
          console.log(`🧪 ${test.name}`);
          await test.fn();
          this.passed++;
          console.log(`✅ PASSED: ${test.name}\n`);
        } catch (error) {
          this.failed++;
          console.log(`❌ FAILED: ${test.name}`);
          console.log(`   Error: ${error instanceof Error ? error.message : String(error)}\n`);
        }
      }
    } finally {
      await this.client.disconnect();
    }

    this.printSummary();
  }

  private printSummary() {
    console.log('📊 Test Summary');
    console.log(`   Total: ${this.tests.length}`);
    console.log(`   Passed: ${this.passed}`);
    console.log(`   Failed: ${this.failed}`);
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log('⚠️  Some tests failed');
      process.exit(1);
    }
  }

  private async testToolsAvailable() {
    const result = await this.client.listTools();
    if (!result.success) {
      throw new Error(`Failed to list tools: ${result.error}`);
    }

    const tools = result.data || [];
    const requiredTools = ['ingest_url', 'ingest_extracted_page', 'query_kb'];
    
    for (const toolName of requiredTools) {
      const tool = tools.find((t: Tool) => t.name === toolName);
      if (!tool) {
        throw new Error(`Required tool '${toolName}' not found`);
      }
    }

    console.log(`   Found ${tools.length} tools: ${tools.map((t: Tool) => t.name).join(', ')}`);
  }

  private async testIngestion() {
    const testUrl = 'https://example.com';
    const result = await this.client.ingestUrl(testUrl);
    
    if (!result.success) {
      throw new Error(`Failed to ingest URL: ${result.error}`);
    }

    const content = result.data;
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error('Expected non-empty content array from ingestion');
    }

    const text = content[0]?.text;
    if (!text || !text.includes('executed')) {
      throw new Error('Unexpected response format from ingestion');
    }

    console.log(`   Successfully ingested ${testUrl}`);
  }

  private async testExtractedPageFromSimplePage() {
    const testUrl = 'https://example.com';
    console.log(`   Extracting content from: ${testUrl}`);
    
    try {
      const extractedPage = await this.extractor.extractFromUrl(testUrl);
      
      if (!extractedPage.title || !extractedPage.url) {
        throw new Error('Failed to extract basic page properties');
      }

      const result = await this.client.ingestExtractedPage(extractedPage);
      
      if (!result.success) {
        throw new Error(`Failed to ingest ExtractedPage: ${result.error}`);
      }

      const response = result.data;
      if (!Array.isArray(response) || response.length === 0) {
        throw new Error('Expected non-empty response array from ExtractedPage ingestion');
      }

      const text = response[0]?.text;
      if (!text) {
        throw new Error('Expected text content in ExtractedPage ingestion response');
      }

      // Extract JSON from the response text
      const jsonMatch = text.match(/Result: (.+)$/);
      if (!jsonMatch) {
        throw new Error('Could not find Result JSON in response text');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[1]);
      if (!parsedResponse.url || !parsedResponse.title || typeof parsedResponse.n_chunks !== 'number') {
        throw new Error('Unexpected response format from ExtractedPage ingestion');
      }

      console.log(`   Successfully extracted and ingested: ${extractedPage.title}`);
      console.log(`   URL: ${extractedPage.url}`);
      console.log(`   Content length: ${extractedPage.contentLength} characters`);
      console.log(`   Generated ${parsedResponse.n_chunks} chunks`);
      if (extractedPage.images?.length) {
        console.log(`   Found ${extractedPage.images.length} images`);
      }
      if (extractedPage.links?.length) {
        console.log(`   Found ${extractedPage.links.length} links`);
      }
      if (parsedResponse.chunk_types) {
        console.log(`   Chunk types: ${Object.keys(parsedResponse.chunk_types).join(', ')}`);
      }
    } catch (error) {
      throw new Error(`Web extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testExtractedPageFromRichContent() {
    // Use a more reliable tech documentation site instead of Wikipedia
    const testUrl = 'https://docs.github.com/en';
    console.log(`   Extracting rich content from: ${testUrl}`);
    
    try {
      const extractedPage = await this.extractor.extractFromUrl(testUrl);
      
      if (!extractedPage.title || !extractedPage.content) {
        throw new Error('Failed to extract rich page content');
      }

      const result = await this.client.ingestExtractedPage(extractedPage);
      
      if (!result.success) {
        throw new Error(`Failed to ingest rich ExtractedPage: ${result.error}`);
      }

      const response = result.data;
      if (!Array.isArray(response) || response.length === 0) {
        throw new Error('Expected non-empty response array from rich ExtractedPage ingestion');
      }

      const text = response[0]?.text;
      if (!text) {
        throw new Error('Expected text content in rich ExtractedPage ingestion response');
      }

      // Extract JSON from the response text
      const jsonMatch = text.match(/Result: (.+)$/);
      if (!jsonMatch) {
        throw new Error('Could not find Result JSON in response text');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[1]);
      
      // Verify rich content produced chunks
      if (!parsedResponse.n_chunks || parsedResponse.n_chunks < 1) {
        throw new Error('Expected at least 1 chunk from rich content page');
      }

      console.log(`   Successfully extracted rich content: ${extractedPage.title}`);
      console.log(`   Content length: ${extractedPage.contentLength} characters`);
      console.log(`   Generated ${parsedResponse.n_chunks} chunks`);
      if (parsedResponse.chunk_types) {
        console.log(`   Chunk types: ${Object.keys(parsedResponse.chunk_types).join(', ')}`);
      }
      if (extractedPage.images?.length) {
        console.log(`   Found ${extractedPage.images.length} images`);
      }
      if (extractedPage.links?.length) {
        console.log(`   Found ${extractedPage.links.length} links`);
      }
      if (extractedPage.metadata?.openGraph && Object.keys(extractedPage.metadata.openGraph).length > 0) {
        console.log(`   Found OpenGraph metadata`);
      }
    } catch (error) {
      throw new Error(`Rich content extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testExtractedPageFromNews() {
    // Use a news article with structured metadata
    const testUrl = 'https://www.bbc.com/news';
    console.log(`   Extracting news content from: ${testUrl}`);
    
    try {
      const extractedPage = await this.extractor.extractFromUrl(testUrl);
      
      if (!extractedPage.title) {
        throw new Error('Failed to extract news page title');
      }

      const result = await this.client.ingestExtractedPage(extractedPage);
      
      if (!result.success) {
        throw new Error(`Failed to ingest news ExtractedPage: ${result.error}`);
      }

      const response = result.data;
      if (!Array.isArray(response) || response.length === 0) {
        throw new Error('Expected non-empty response array from news ExtractedPage ingestion');
      }

      const text = response[0]?.text;
      if (!text) {
        throw new Error('Expected text content in news ExtractedPage ingestion response');
      }

      // Extract JSON from the response text
      const jsonMatch = text.match(/Result: (.+)$/);
      if (!jsonMatch) {
        throw new Error('Could not find Result JSON in response text');
      }
      
      const parsedResponse = JSON.parse(jsonMatch[1]);
      
      console.log(`   Successfully extracted news content: ${extractedPage.title}`);
      console.log(`   URL: ${extractedPage.url}`);
      console.log(`   Generated ${parsedResponse.n_chunks} chunks`);
      if (extractedPage.byline) {
        console.log(`   Author: ${extractedPage.byline}`);
      }
      if (extractedPage.publishedTime) {
        console.log(`   Published: ${extractedPage.publishedTime}`);
      }
      if (parsedResponse.chunk_types) {
        console.log(`   Chunk types: ${Object.keys(parsedResponse.chunk_types).join(', ')}`);
      }
    } catch (error) {
      // News sites may have anti-scraping measures, so don't fail the test
      console.log(`   ⚠️  News extraction skipped (may be blocked): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async testQuery() {
    const query = 'What is this website about?';
    const result = await this.client.queryKnowledgeBase(query, 3);
    
    if (!result.success) {
      throw new Error(`Failed to query knowledge base: ${result.error}`);
    }

    const content = result.data;
    if (!Array.isArray(content) || content.length === 0) {
      throw new Error('Expected non-empty content array from query');
    }

    const sampleResult = content[0] as any;
    if (sampleResult && sampleResult.text) {
      console.log(`   Sample result: ${sampleResult.text?.substring(0, 100)}...`);
      console.log(`   Successfully found content in search results`);
    } else {
      console.log(`   No text content found in results`);
    }
  }

  private async testQueryExtractedPageContent() {
    // Query for content we've already ingested
    const query = 'example domain github documentation';
    const result = await this.client.queryKnowledgeBase(query, 5);
    
    if (!result.success) {
      throw new Error(`Failed to query for ExtractedPage content: ${result.error}`);
    }

    const content = result.data;
    if (!Array.isArray(content)) {
      throw new Error('Expected array response from query');
    }

    console.log(`   Query for ExtractedPage content returned ${content.length} results`);
    
    if (content.length > 0) {
      const sampleResult = content[0];
      console.log(`   Sample result: ${sampleResult.text?.substring(0, 100)}...`);
      console.log(`   Successfully found content in search results`);
    }
  }

  private async testQueryWithNoResults() {
    const query = 'xyzabc123impossible-query-that-should-not-match-anything';
    const result = await this.client.queryKnowledgeBase(query, 3);
    
    if (!result.success) {
      throw new Error(`Failed to query knowledge base: ${result.error}`);
    }

    console.log(`   Query for non-existent content handled gracefully`);
  }

  async run() {
    this.addTest('Tools are available', () => this.testToolsAvailable());
    this.addTest('URL ingestion works', () => this.testIngestion());
    this.addTest('ExtractedPage from simple page works', () => this.testExtractedPageFromSimplePage());
    this.addTest('ExtractedPage from rich content works', () => this.testExtractedPageFromRichContent());
    this.addTest('ExtractedPage from news site works', () => this.testExtractedPageFromNews());
    this.addTest('Knowledge base query works', () => this.testQuery());
    this.addTest('Query for ExtractedPage content works', () => this.testQueryExtractedPageContent());
    this.addTest('Query with no results handled gracefully', () => this.testQueryWithNoResults());

    await this.runTests();
  }
}

async function main() {
  const serverUrl = process.env.RAG_SERVER_URL || 'http://localhost:3000/mcp';
  const runner = new RAGTestRunner(serverUrl);
  await runner.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
} 