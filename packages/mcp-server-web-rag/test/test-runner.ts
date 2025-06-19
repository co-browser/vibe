import dotenv from 'dotenv';
dotenv.config();

import { RAGTestClient } from './mcp-client.js';
import { RAGAgent } from './rag-agent.js';

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

class RAGTestRunner {
  private client: RAGTestClient;
  private tests: TestCase[] = [];
  private passed = 0;
  private failed = 0;

  constructor(serverUrl?: string) {
    this.client = new RAGTestClient(serverUrl);
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
    const requiredTools = ['ingest_url', 'query_kb'];
    
    for (const toolName of requiredTools) {
      const tool = tools.find((t: any) => t.name === toolName);
      if (!tool) {
        throw new Error(`Required tool '${toolName}' not found`);
      }
    }

    console.log(`   Found ${tools.length} tools: ${tools.map((t: any) => t.name).join(', ')}`);
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

    const text = content[0]?.text;
    if (!text) {
      throw new Error('Expected text content in query response');
    }

    console.log(`   Query returned ${content.length} results`);
    console.log(`   Sample result: ${text.substring(0, 100)}...`);
  }

  private async testQueryWithNoResults() {
    const query = 'xyzabc123impossible-query-that-should-not-match-anything';
    const result = await this.client.queryKnowledgeBase(query, 3);
    
    if (!result.success) {
      throw new Error(`Failed to query knowledge base: ${result.error}`);
    }

    console.log(`   Query for non-existent content handled gracefully`);
  }

  private async testAgentConversation() {
    if (!process.env.OPENAI_API_KEY) {
      console.log('   ⚠️  Skipping agent test - OPENAI_API_KEY not set');
      return;
    }

    const serverUrl = process.env.RAG_SERVER_URL || 'http://localhost:3000';
    const agent = new RAGAgent(serverUrl);
    
    try {
      await agent.connect();
      
      console.log('\n' + '='.repeat(80));
      console.log('🎭 AGENT CONVERSATION TEST');
      console.log('='.repeat(80));
      
      const queries = [
        "Please ingest the content from https://example.com and then tell me what the website is about.",
        "What information do we have about examples in our knowledge base?"
      ];

      for (const query of queries) {
        console.log('\n' + '-'.repeat(60));
        let fullResponse = '';
        
        for await (const chunk of agent.query(query)) {
          fullResponse += chunk;
        }
        
        if (!fullResponse.trim()) {
          throw new Error('Agent did not provide a response');
        }
      }
      
      console.log('\n' + '='.repeat(80));
      console.log('🎉 AGENT CONVERSATION COMPLETED');
      console.log('='.repeat(80));
      
    } finally {
      await agent.disconnect();
    }
  }

  async run() {
    this.addTest('Tools are available', () => this.testToolsAvailable());
    this.addTest('URL ingestion works', () => this.testIngestion());
    this.addTest('Knowledge base query works', () => this.testQuery());
    this.addTest('Query with no results handled gracefully', () => this.testQueryWithNoResults());
    this.addTest('Agent conversation flow', () => this.testAgentConversation());

    await this.runTests();
  }
}

async function main() {
  const serverUrl = process.env.RAG_SERVER_URL || 'http://localhost:3000';
  const runner = new RAGTestRunner(serverUrl);
  await runner.run();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Test runner failed:', error);
    process.exit(1);
  });
} 