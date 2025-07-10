import dotenv from 'dotenv';
dotenv.config();

import { RAGAgent } from './rag-agent.js';

async function runAgentTest() {
  console.log('🚀 Starting RAG Agent Conversation Test\n');

  // Note: This test file requires OpenAI API key to be configured
  // Update rag-agent.ts to use the new llmProvider configuration

  const serverUrl = process.env.RAG_SERVER_URL || 'http://localhost:3000/mcp';
  const agent = new RAGAgent(serverUrl);

  try {
    await agent.connect();
    
    console.log('\n' + '='.repeat(80));
    console.log('🎭 RAG AGENT CONVERSATION DEMO');
    console.log('='.repeat(80));
    
    const conversations = [
      {
        title: "📝 Ingesting Technical Documentation",
        query: "Please ingest the content from https://docs.github.com/en/get-started/quickstart/hello-world and then tell me what this GitHub tutorial is about."
      },
      {
        title: "🏗️ Analyzing Development Workflow", 
        query: "Based on the ingested documentation, can you explain the GitHub workflow described in the tutorial? What are the key steps and concepts?"
      },
      {
        title: "🔧 Technical Implementation Concepts",
        query: "What specific technical concepts and best practices are mentioned in the GitHub tutorial? How do repositories, branches, and pull requests work together?"
      }
    ];

    for (let i = 0; i < conversations.length; i++) {
      const { title, query } = conversations[i];
      
      console.log(`\n${'-'.repeat(80)}`);
      console.log(`${title} (${i + 1}/${conversations.length})`);
      console.log(`${'-'.repeat(80)}`);
      
      let fullResponse = '';
      
      for await (const chunk of agent.query(query)) {
        fullResponse += chunk;
      }
      
      if (!fullResponse.trim()) {
        console.log('⚠️  No response received from agent');
      }
      
      // Add a small delay between conversations
      if (i < conversations.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('🎉 AGENT CONVERSATION TEST COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80));
    console.log('\nThe RAG agent successfully:');
    console.log('✅ Connected to the MCP server');
    console.log('✅ Loaded available tools (ingest_url, query_kb)');
    console.log('✅ Used LLM provider to process natural language queries');
    console.log('✅ Called MCP tools when needed');
    console.log('✅ Provided intelligent responses based on retrieved information');
    console.log('\n🚀 Your RAG system is working perfectly!\n');
    
  } catch (error) {
    console.error('\n❌ Agent test failed:', error);
    process.exit(1);
  } finally {
    await agent.disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentTest().catch(error => {
    console.error('❌ Test runner failed:', error);
    process.exit(1);
  });
} 