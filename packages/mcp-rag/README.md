# @vibe/mcp-rag

MCP server providing RAG (Retrieval-Augmented Generation) capabilities for web content ingestion and semantic search via OpenAI embeddings and TurboPuffer vector storage.

## Features

- **Web Content Ingestion**: Automatic extraction and chunking of web pages using Readability
- **Enhanced Metadata**: Rich semantic chunking with page metadata, images, and interactive elements
- **Vector Search**: Semantic search over ingested content using OpenAI embeddings
- **MCP Protocol**: Standard Model Context Protocol server for AI agent integration
- **Production Ready**: Comprehensive error handling, logging, and testing suite

## Quick Start

```bash
# Environment setup
cp .env.example .env
# Add your OPENAI_API_KEY and TURBOPUFFER_API_KEY

# Start the server
npm run dev
# Server runs on http://localhost:3000/mcp
```

## Usage

```typescript
// Available MCP Tools:

// 1. Ingest web content
await mcpClient.callTool('ingest_url', {
  url: 'https://docs.github.com/en/get-started'
});

// 2. Ingest extracted page data
await mcpClient.callTool('ingest_extracted_page', {
  extractedPage: {
    url: 'https://example.com',
    title: 'Page Title',
    content: '<html>...</html>',
    // ... metadata
  }
});

// 3. Search knowledge base
await mcpClient.callTool('query_kb', {
  query: 'GitHub workflow best practices',
  top_k: 5
});
```

## Architecture

```
RAG Pipeline
├── Web Scraper     → Readability.js + JSDOM extraction
├── Content Chunker → Semantic chunking with metadata
├── Embeddings      → OpenAI text-embedding-3-small
├── Vector Store    → TurboPuffer with enhanced schema
└── MCP Server      → HTTP + streaming protocol support
```

## Testing

```bash
npm test            # Core RAG functionality tests
npm run test:agent  # End-to-end agent conversation tests
```

## Performance Optimizations

This server has been optimized for speed and includes several performance modes:

### Fast Mode (Default)
- **Enabled by default** with `FAST_MODE=true` (or unset)
- Uses efficient sentence-based text chunking
- Skips expensive HTML parsing for content chunks
- Processes documents in seconds instead of minutes
- Ideal for real-time applications

### Traditional Mode
- Set `FAST_MODE=false` to enable
- Uses HTML structure-aware chunking with heading hierarchy
- Slower but preserves document structure better
- Good for documents where HTML structure is important

### Perplexity Mode (Experimental)
- Set `ENABLE_PPL_CHUNKING=true` to enable
- Uses AI-powered perplexity analysis to find optimal chunk boundaries
- **Very slow** - can take 60+ seconds for large documents
- Makes many OpenAI API calls (expensive)
- Potentially better semantic chunking quality
- Only recommended for offline batch processing

## Environment Variables

```bash
# Required
OPENAI_API_KEY=your_openai_api_key
TURBOPUFFER_API_KEY=your_turbopuffer_api_key

# Performance Configuration (Optional)
FAST_MODE=true                 # Enable fast optimizations (default: true)
ENABLE_PPL_CHUNKING=false      # Enable perplexity chunking (default: false)
VERBOSE_LOGS=false             # Enable detailed logging (default: false)
```

## Performance Comparison

| Mode | Processing Time | Quality | Use Case |
|------|----------------|---------|----------|
| Fast Mode | 1-5 seconds | Good | Real-time ingestion, chat applications |
| Traditional | 5-15 seconds | Better | Structured documents, offline processing |
| Perplexity | 60+ seconds | Best* | Research, high-quality knowledge bases |

*Quality improvement is theoretical and may not be significant for most use cases.

## Tools Available

### `ingest_url`
Crawls a public webpage and adds it to the knowledge base using fast traditional chunking.

### `ingest_extracted_page`
Adds a pre-extracted page with enhanced metadata. Uses optimized fast chunking by default.

### `query_kb`
Performs hybrid search over the knowledge base with semantic similarity and full-text search.

## Chunk Types

The system creates different types of chunks for comprehensive coverage:

- **content**: Main document content, chunked efficiently
- **metadata**: Page metadata (title, author, publication date, etc.)
- **image_context**: Information about images on the page
- **action**: Interactive elements (buttons, forms, links)

## Usage Example

```typescript
import { RAGTools } from './src/tools.js';

// Ingest a webpage
const result = await RAGTools[1].execute({
  extractedPage: {
    url: "https://example.com/article",
    title: "Example Article",
    content: "Content here...",
    textContent: "Clean text here...",
    // ... other fields
  }
});

console.log(`Ingested ${result.n_chunks} chunks in ${result.processing_time_ms}ms`);

// Query the knowledge base
const searchResults = await RAGTools[2].execute({
  query: "What is the main topic?",
  top_k: 5
});
```

## Performance Monitoring

The system includes built-in performance logging:

```
[INFO] Ingesting ExtractedPage: Example Article (15243 chars)
[INFO] Using fast traditional chunking (PPL chunking disabled)
[INFO] Generated 8 chunks in 245ms
[INFO] Creating embeddings for 12 chunks...
[INFO] Processing embedding 1/12
[INFO] Processing embedding 6/12
[INFO] Processing embedding 11/12
[INFO] Created 12 embeddings in 2341ms
[INFO] Stored 12 chunks in 156ms (total: 2497ms)
[INFO] Successfully ingested 12 enhanced chunks from Example Article in 2742ms
```

## Troubleshooting

### Timeouts
If you're experiencing timeouts:
1. Ensure `FAST_MODE=true` (default)
2. Ensure `ENABLE_PPL_CHUNKING=false` (default)
3. Check that your OpenAI API key has sufficient quota

### Quality Issues
If chunk quality is poor:
1. Try `FAST_MODE=false` for structure-aware chunking
2. For maximum quality (slow): `ENABLE_PPL_CHUNKING=true`
3. Adjust chunk size constants in the code if needed

### Memory Issues
For large documents:
1. The system automatically handles token limits
2. Large documents are chunked appropriately
3. Embeddings are processed sequentially to manage memory

### Verbose Terminal Output
If logs are too verbose and clogging your terminal:
1. Keep `VERBOSE_LOGS=false` (default) for clean output
2. Set `VERBOSE_LOGS=true` only when debugging issues
3. The system automatically truncates long outputs and simplifies error objects
 