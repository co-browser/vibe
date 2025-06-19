import dotenv from 'dotenv';
dotenv.config();

import { OpenAI } from "openai";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { parse } from "node-html-parser";
import type { ExtractedPage } from "@vibe/tab-extraction-core";

const REGION = "gcp-europe-west3";
const NAMESPACE = "kb-main";
const TOKEN_CAP = 400;
const OVERLAP_TOKENS = 25;

function log(level: string, message: string, ...args: any[]) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`, ...args);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY environment variable is required");
}
if (!process.env.TURBOPUFFER_API_KEY) {
  throw new Error("TURBOPUFFER_API_KEY environment variable is required");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tpuf = new Turbopuffer({
  apiKey: process.env.TURBOPUFFER_API_KEY!,
  region: REGION as any,
});
const ns = tpuf.namespace(NAMESPACE);

interface ParsedDoc {
  docId: string;
  url: string;
  title: string;
  textContent: string;
  html: string;
  metadata: Record<string, any>;
}

interface Chunk {
  chunkId: string;
  docId: string;
  text: string;
  headingPath: string;
}

interface EnhancedChunk extends Chunk {
  chunkType: 'content' | 'metadata' | 'action' | 'image_context';
  semanticContext: string;
  publishedTime?: string | undefined;
  siteName?: string | undefined;
  domain: string;
  author?: string | undefined;
  contentLength: number;
}

async function fetchAndParse(url: string): Promise<ParsedDoc> {
  const res = await fetch(url, { redirect: "follow" });
  const html = await res.text();
  const dom = new JSDOM(html, { url });
  const { document } = dom.window;

  const { Readability } = await import("@mozilla/readability");
  const article = new Readability(document).parse();
  if (!article) throw new Error("Readability failed");

  const meta = Object.fromEntries(
    [...document.querySelectorAll("meta")].map(m => [
      m.getAttribute("property") || m.getAttribute("name") || "",
      m.getAttribute("content"),
    ]),
  );

  return {
    docId: uuidv4(),
    url,
    title: article.title,
    textContent: article.textContent,
    html: article.content,
    metadata: meta,
  };
}

function tokenLength(str: string): number {
  return Math.ceil(str.split(/\s+/).length * 0.75);
}

function* chunkDocument(doc: ParsedDoc): Generator<Chunk> {
  const root = parse(doc.html);
  let buf = "";
  let headingPath: string[] = [];

  const flush = (): Chunk | undefined => {
    if (buf.trim()) {
      const chunk: Chunk = {
        chunkId: uuidv4(),
        docId: doc.docId,
        text: buf.trim(),
        headingPath: headingPath.join(" » "),
      };
      buf = "";
      return chunk;
    }
    return undefined;
  };

  for (const node of root.childNodes) {
    const element = node as any;
    if (element.tagName && /^h[1-6]$/i.test(element.tagName)) {
      const flushed = flush();
      if (flushed) yield flushed;
      headingPath = [...headingPath.slice(0, Number(element.tagName[1]) - 1), element.text];
      buf += element.text + "\n";
    } else {
      buf += element.text || "";
      if (tokenLength(buf) >= TOKEN_CAP) {
        const flushed = flush();
        if (flushed) yield flushed;
        buf = "";
        const nodeText = element.text || "";
        buf = nodeText.split(" ").slice(-OVERLAP_TOKENS).join(" ");
      }
    }
  }
  const final = flush();
  if (final) yield final;
}

function* chunkExtractedPage(extractedPage: ExtractedPage): Generator<EnhancedChunk> {
  const domain = new URL(extractedPage.url).hostname;
  const baseContext = `${extractedPage.title} - ${extractedPage.excerpt || 'No description'}`;
  
  // Chunk main content with heading awareness
  if (extractedPage.content) {
    const root = parse(extractedPage.content);
    let buf = "";
    let headingPath: string[] = [];

    const flush = (chunkType: 'content' | 'metadata' = 'content'): EnhancedChunk | undefined => {
      if (buf.trim()) {
        const chunk: EnhancedChunk = {
          chunkId: uuidv4(),
          docId: uuidv4(), // Generate new ID for each page ingestion
          text: buf.trim(),
          headingPath: headingPath.join(" » "),
          chunkType,
          semanticContext: baseContext,
          domain,
          contentLength: extractedPage.contentLength || 0,
          ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
          ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
          ...(extractedPage.byline && { author: extractedPage.byline }),
        };
        buf = "";
        return chunk;
      }
      return undefined;
    };

    for (const node of root.childNodes) {
      const element = node as any;
      if (element.tagName && /^h[1-6]$/i.test(element.tagName)) {
        const flushed = flush();
        if (flushed) yield flushed;
        headingPath = [...headingPath.slice(0, Number(element.tagName[1]) - 1), element.text];
        buf += element.text + "\n";
      } else {
        buf += element.text || "";
        if (tokenLength(buf) >= TOKEN_CAP) {
          const flushed = flush();
          if (flushed) yield flushed;
          buf = "";
          const nodeText = element.text || "";
          buf = nodeText.split(" ").slice(-OVERLAP_TOKENS).join(" ");
        }
      }
    }
    const final = flush();
    if (final) yield final;
  }

  // Create metadata chunk with rich context
  const metadataText = `
Title: ${extractedPage.title}
URL: ${extractedPage.url}
${extractedPage.excerpt ? `Description: ${extractedPage.excerpt}` : ''}
${extractedPage.byline ? `Author: ${extractedPage.byline}` : ''}
${extractedPage.publishedTime ? `Published: ${extractedPage.publishedTime}` : ''}
${extractedPage.siteName ? `Site: ${extractedPage.siteName}` : ''}
Content Length: ${extractedPage.contentLength || 0} characters
  `.trim();

  yield {
    chunkId: uuidv4(),
    docId: uuidv4(),
    text: metadataText,
    headingPath: "Page Metadata",
    chunkType: 'metadata',
    semanticContext: baseContext,
    domain,
    contentLength: extractedPage.contentLength || 0,
    ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
    ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
    ...(extractedPage.byline && { author: extractedPage.byline }),
  };

  // Create chunks for images with context
  if (extractedPage.images && extractedPage.images.length > 0) {
    const imageContext = extractedPage.images
      .map(img => `Image: ${img.src}${img.alt ? ` (${img.alt})` : ''}${img.title ? ` - ${img.title}` : ''}`)
      .join('\n');

    yield {
      chunkId: uuidv4(),
      docId: uuidv4(),
      text: `Images from ${extractedPage.title}:\n${imageContext}`,
      headingPath: "Page Images",
      chunkType: 'image_context',
      semanticContext: baseContext,
      domain,
      contentLength: extractedPage.contentLength || 0,
      ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
      ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
      ...(extractedPage.byline && { author: extractedPage.byline }),
    };
  }

  // Create chunks for interactive actions
  if (extractedPage.actions && extractedPage.actions.length > 0) {
    const actionContext = extractedPage.actions
      .map(action => `${action.type}: ${action.text} (${action.selector})`)
      .join('\n');

    yield {
      chunkId: uuidv4(),
      docId: uuidv4(),
      text: `Interactive elements on ${extractedPage.title}:\n${actionContext}`,
      headingPath: "Page Actions",
      chunkType: 'action',
      semanticContext: baseContext,
      domain,
      contentLength: extractedPage.contentLength || 0,
      ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
      ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
      ...(extractedPage.byline && { author: extractedPage.byline }),
    };
  }
}

async function embed(text: string): Promise<number[]> {
  const resp = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  if (!resp.data[0]?.embedding) {
    throw new Error("Failed to get embedding");
  }
  return resp.data[0].embedding as number[];
}

async function upsertChunks(chunks: Chunk[]): Promise<void> {
  const ids: (string | number)[] = [];
  const vecs: number[][] = [];
  const texts: string[] = [];
  const headings: string[] = [];
  const urls: string[] = [];

  for (const c of chunks) {
    ids.push(c.chunkId);
    vecs.push(await embed(c.text));
    texts.push(c.text);
    headings.push(c.headingPath);
    urls.push(`doc://${c.docId}`);
  }

  await ns.write({
    upsert_columns: {
      id: ids,
      vector: vecs,
      text: texts,
      heading_path: headings,
      url: urls,
    },
    distance_metric: "cosine_distance",
    schema: {
      text: { type: "string", full_text_search: true },
      heading_path: { type: "string", full_text_search: true },
      url: { type: "string" },
    },
  });
}

async function upsertEnhancedChunks(chunks: EnhancedChunk[]): Promise<void> {
  const ids: (string | number)[] = [];
  const vecs: number[][] = [];
  const texts: string[] = [];
  const headings: string[] = [];
  const urls: string[] = [];
  const domains: string[] = [];
  const siteNames: (string | null)[] = [];
  const publishedTimes: (string | null)[] = [];
  const authors: (string | null)[] = [];
  const chunkTypes: string[] = [];
  const semanticContexts: string[] = [];
  const contentLengths: number[] = [];

  for (const c of chunks) {
    ids.push(c.chunkId);
    vecs.push(await embed(c.text));
    texts.push(c.text);
    headings.push(c.headingPath);
    urls.push(`doc://${c.docId}`);
    domains.push(c.domain);
    siteNames.push(c.siteName || null);
    publishedTimes.push(c.publishedTime || null);
    authors.push(c.author || null);
    chunkTypes.push(c.chunkType);
    semanticContexts.push(c.semanticContext);
    contentLengths.push(c.contentLength);
  }

  await ns.write({
    upsert_columns: {
      id: ids,
      vector: vecs,
      text: texts,
      heading_path: headings,
      url: urls,
      domain: domains,
      site_name: siteNames,
      published_time: publishedTimes,
      author: authors,
      chunk_type: chunkTypes,
      semantic_context: semanticContexts,
      content_length: contentLengths,
    },
    distance_metric: "cosine_distance",
    schema: {
      text: { type: "string", full_text_search: true },
      heading_path: { type: "string", full_text_search: true },
      url: { type: "string" },
      domain: { type: "string", full_text_search: true },
      site_name: { type: "string", full_text_search: true },
      published_time: { type: "string" },
      author: { type: "string", full_text_search: true },
      chunk_type: { type: "string" },
      semantic_context: { type: "string", full_text_search: true },
      content_length: { type: "integer" },
    },
  });
}

export async function ingestUrl(url: string) {
  log('info', `Ingesting URL: ${url}`);
  const doc = await fetchAndParse(url);
  const chunks = [...chunkDocument(doc)];
  await upsertChunks(chunks);
  log('info', `Successfully ingested ${chunks.length} chunks from ${url}`);
  return { doc_id: doc.docId, n_chunks: chunks.length };
}

export async function queryKnowledgeBase(query: string, top_k: number = 5) {
  log('info', `Querying knowledge base: ${query} (top_k=${top_k})`);
  const vec = await embed(query);
  const res = await ns.query({
    top_k,
    rank_by: ["vector", "ANN", vec],
    include_attributes: ["url", "heading_path", "text"],
  });
  const rows = res.rows || [];
  log('info', `Found ${rows.length} results`);
  return rows;
}

export async function ingestExtractedPage(extractedPage: ExtractedPage) {
  log('info', `Ingesting ExtractedPage: ${extractedPage.title}`);
  const chunks = [...chunkExtractedPage(extractedPage)];
  await upsertEnhancedChunks(chunks);
  log('info', `Successfully ingested ${chunks.length} enhanced chunks from ${extractedPage.title}`);
  return { 
    url: extractedPage.url,
    title: extractedPage.title,
    n_chunks: chunks.length,
    chunk_types: chunks.reduce((acc, chunk) => {
      acc[chunk.chunkType] = (acc[chunk.chunkType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };
}

export const RAGTools = [
  {
    name: "ingest_url",
    description: "Crawl a public webpage and add it to the RAG knowledge base",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "https://… target URL" },
      },
      required: ["url"],
    },
    execute: async ({ url }: { url: string }) => {
      return await ingestUrl(url);
    },
  },
  {
    name: "ingest_extracted_page",
    description: "Add a pre-extracted page (ExtractedPage) to the RAG knowledge base with enhanced metadata and semantic chunking",
    inputSchema: {
      type: "object",
      properties: {
        extractedPage: {
          type: "object",
          description: "ExtractedPage object from tab-extraction-core",
          properties: {
            url: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            textContent: { type: "string" },
            excerpt: { type: "string" },
            byline: { type: "string" },
            publishedTime: { type: "string" },
            siteName: { type: "string" },
            contentLength: { type: "number" },
            images: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  src: { type: "string" },
                  alt: { type: "string" },
                  title: { type: "string" }
                }
              }
            },
            actions: {
              type: "array", 
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  text: { type: "string" },
                  selector: { type: "string" }
                }
              }
            }
          },
          required: ["url", "title"]
        }
      },
      required: ["extractedPage"],
    },
    execute: async ({ extractedPage }: { extractedPage: ExtractedPage }) => {
      return await ingestExtractedPage(extractedPage);
    },
  },
  {
    name: "query_kb",
    description: "Hybrid search over the knowledge base. Returns top-k chunks with distances.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        top_k: { type: "integer", default: 5 },
      },
      required: ["query"],
    },
    execute: async ({ query, top_k = 5 }: { query: string; top_k?: number }) => {
      return await queryKnowledgeBase(query, top_k);
    },
  },
];

