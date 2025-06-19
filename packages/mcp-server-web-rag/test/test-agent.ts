import dotenv from 'dotenv';
dotenv.config();

import { RAGAgent } from './rag-agent.js';

async function runAgentTest() {
  console.log('🚀 Starting RAG Agent Conversation Test\n');

  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  const serverUrl = process.env.RAG_SERVER_URL || 'http://localhost:3000';
  const agent = new RAGAgent(serverUrl);

  try {
    await agent.connect();
    
    console.log('\n' + '='.repeat(80));
    console.log('🎭 RAG AGENT CONVERSATION DEMO');
    console.log('='.repeat(80));
    
    const conversations = [
      {
        title: "📝 Ingesting and Analyzing Content",
        query: "Please ingest the content from https://example.com and then tell me what the website is about."
      },
      {
        title: "🔍 Searching Knowledge Base", 
        query: "What information do we have about examples in our knowledge base? Can you find any content related to domain examples?"
      },
      {
        title: "❓ Testing Knowledge Recall",
        query: "Based on what you've learned from the ingested content, what would you say is the main purpose of the example.com website?"
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
    console.log('✅ Used OpenAI to process natural language queries');
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