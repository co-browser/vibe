import dotenv from 'dotenv';
dotenv.config();

/**
 * RAG Tools for Web Content Ingestion and Search
 * 
 * Environment Variables:
 * - OPENAI_API_KEY: Required for embeddings and optional perplexity chunking
 * - TURBOPUFFER_API_KEY: Required for vector database storage
 * - ENABLE_PPL_CHUNKING: Set to 'true' to enable expensive perplexity-based chunking (default: false)
 * - FAST_MODE: Set to 'false' to disable fast optimizations (default: true)
 * - VERBOSE_LOGS: Set to 'true' to enable detailed logging (default: false)
 * 
 * Performance Notes:
 * - Fast mode uses efficient sentence-based chunking and skips HTML parsing
 * - Perplexity chunking makes many OpenAI API calls and can be very slow (60+ seconds for large documents)
 * - Default configuration prioritizes speed over potential quality improvements from perplexity analysis
 */

import { OpenAI } from "openai";
import { Turbopuffer } from "@turbopuffer/turbopuffer";
import { v4 as uuidv4 } from "uuid";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";
import { parse } from "node-html-parser";
import type { ExtractedPage } from "@vibe/tab-extraction-core";
import { createLogger } from "@vibe/shared-types";

const REGION = "gcp-europe-west3";
const NAMESPACE = "kb-main";
const TOKEN_CAP = 300;
const OVERLAP_TOKENS = 25;
const MAX_EMBEDDING_TOKENS = 8000;
const PPL_THRESHOLD = 0.5;
const MIN_CHUNK_SIZE = 50;
const MAX_CHUNK_SIZE = 800;

// Performance configuration - disable expensive perplexity chunking by default
const ENABLE_PPL_CHUNKING = process.env.ENABLE_PPL_CHUNKING === 'true';
const FAST_MODE = process.env.FAST_MODE !== 'false'; // enabled by default
const VERBOSE_LOGS = process.env.VERBOSE_LOGS === 'true'; // disabled by default

// Create logger instance
const logger = createLogger('rag-tools');

/**
 * Logs messages with level-appropriate methods
 * Uses shared-types logger for consistent formatting
 * @param level - Log level (info, warn, error, debug)
 * @param message - Main log message
 * @param args - Additional arguments to log
 */
function log(level: 'info' | 'warn' | 'error' | 'debug', message: string, ...args: any[]) {
  // Skip detailed logs unless verbose mode is enabled
  if (!VERBOSE_LOGS && level === 'info' && message.includes('Processing embedding')) {
    return; // Skip frequent embedding progress logs
  }

  // Simplify args to avoid verbose output in logs
  const simplifiedArgs = args.map(arg => {
    if (arg instanceof Error) {
      return VERBOSE_LOGS ? arg : `[Error: ${arg.message}]`;
    }
    if (typeof arg === 'object' && arg !== null) {
      // For objects, just show the type or constructor name unless verbose
      return VERBOSE_LOGS ? arg : `[${arg.constructor?.name || 'Object'}]`;
    }
    if (typeof arg === 'string' && arg.length > 100) {
      return VERBOSE_LOGS ? arg : `[String: ${arg.length} chars]`;
    }
    return arg;
  });

  // Use shared logger with appropriate level
  switch (level) {
    case 'info':
      logger.info(message, ...simplifiedArgs);
      break;
    case 'warn':
      logger.warn(message, ...simplifiedArgs);
      break;
    case 'error':
      logger.error(message, ...simplifiedArgs);
      break;
    case 'debug':
      if (VERBOSE_LOGS) {
        logger.debug(message, ...simplifiedArgs);
      }
      break;
  }
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
  region: REGION,
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

interface PPLChunkOptions {
  threshold?: number;
  minChunkSize?: number;
  maxChunkSize?: number;
  useDynamicMerging?: boolean;
}

interface SentenceWithPPL {
  text: string;
  ppl?: number;
  isMinima?: boolean;
}

/**
 * Fetches a webpage URL and parses it into a structured document using Mozilla Readability
 * Extracts clean content, metadata, and creates a unique document ID
 * @param url - The URL to fetch and parse
 * @returns Promise resolving to a ParsedDoc with extracted content and metadata
 * @throws Error if the URL cannot be fetched or Readability extraction fails
 */
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

/**
 * Estimates the token length of a text string using heuristic calculations
 * Uses both character-based and word-based estimates to approximate OpenAI tokenization
 * @param str - The text string to analyze
 * @returns Estimated number of tokens (takes the maximum of char-based and word-based estimates)
 */
function tokenLength(str: string): number {
  const words = str.trim().split(/\s+/);
  const chars = str.length;

  const charBasedEstimate = Math.ceil(chars / 3.5);
  const wordBasedEstimate = Math.ceil(words.length * 1.3);

  return Math.max(charBasedEstimate, wordBasedEstimate);
}

/**
 * Truncates text to fit within a specified token limit using binary search
 * Attempts to break at sentence boundaries when possible, then word boundaries as fallback
 * @param text - The text to truncate
 * @param maxTokens - Maximum number of tokens allowed
 * @returns Truncated text that fits within the token limit
 */
function truncateTextToTokenLimit(text: string, maxTokens: number): string {
  if (tokenLength(text) <= maxTokens) {
    return text;
  }

  let left = 0;
  let right = text.length;
  let result = text;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const truncated = text.substring(0, mid);

    if (tokenLength(truncated) <= maxTokens) {
      result = truncated;
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  const sentences = result.split(/[.!?]+/);
  if (sentences.length > 1) {
    sentences.pop();
    result = sentences.join('.') + '.';
  } else {
    const words = result.trim().split(/\s+/);
    if (words.length > 1) {
      words.pop();
      result = words.join(' ');
    }
  }

  return result.trim();
}

/**
 * Splits text into individual sentences based on punctuation marks
 * @param text - The text to split into sentences
 * @returns Array of sentences, each ending with appropriate punctuation
 */
function splitIntoSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => s + '.');
}

/**
 * Calculates the perplexity score for a sentence using GPT-3.5-turbo
 * Perplexity measures how "surprising" a sentence is given the context
 * Lower perplexity = more predictable, higher perplexity = more surprising
 * @param sentence - The sentence to analyze
 * @param context - The preceding context to condition the perplexity calculation
 * @returns Promise resolving to perplexity score (1.0 if calculation fails)
 */
async function calculateSentencePerplexity(sentence: string, context: string): Promise<number> {
  const prompt = context + " " + sentence;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1,
      temperature: 0,
      logprobs: true,
      top_logprobs: 1
    });

    if (!response || !response.choices || response.choices.length === 0) {
      return 1.0;
    }

    const choice = response.choices[0];
    if (!choice || !choice.logprobs || !choice.logprobs.content) {
      return 1.0;
    }

    const logprobs = choice.logprobs.content;
    if (!Array.isArray(logprobs) || logprobs.length === 0) {
      return 1.0;
    }

    let totalLogProb = 0;
    let validTokens = 0;

    for (const token of logprobs) {
      if (token && typeof token.logprob === 'number') {
        totalLogProb += token.logprob;
        validTokens++;
      }
    }

    if (validTokens === 0) {
      return 1.0;
    }

    const avgLogProb = totalLogProb / validTokens;
    return Math.exp(-avgLogProb);
  } catch (error) {
    log('warn', `Failed to calculate perplexity for sentence (truncated)`, error);
    return 1.0;
  }
}

/**
 * Detects perplexity minima (local low points) in a sequence of sentences
 * These minima indicate natural topic boundaries where content transitions occur
 * @param sentences - Array of sentences with their perplexity scores
 * @param threshold - Minimum perplexity difference to consider as a boundary
 * @returns Promise resolving to array of sentence indices where boundaries should be placed
 */
async function detectPPLMinima(sentences: SentenceWithPPL[], threshold: number = PPL_THRESHOLD): Promise<number[]> {
  const boundaries: number[] = [];

  for (let i = 1; i < sentences.length - 1; i++) {
    const currentSentence = sentences[i];
    const prevSentence = sentences[i - 1];
    const nextSentence = sentences[i + 1];

    if (!currentSentence || !prevSentence || !nextSentence) continue;

    const current = currentSentence.ppl || 1.0;
    const prev = prevSentence.ppl || 1.0;
    const next = nextSentence.ppl || 1.0;

    const leftDiff = prev - current;
    const rightDiff = next - current;

    if ((leftDiff > threshold && rightDiff > threshold) ||
      (leftDiff > threshold && rightDiff === 0)) {
      boundaries.push(i);
      currentSentence.isMinima = true;
    }
  }

  return boundaries;
}

/**
 * Performs intelligent text chunking based on perplexity analysis
 * Uses AI to identify natural topic boundaries for more semantically coherent chunks
 * @param text - The text to chunk
 * @param options - Configuration options for chunking behavior
 * @returns Promise resolving to array of text chunks split at natural boundaries
 */
async function performPPLChunking(text: string, options: PPLChunkOptions = {}): Promise<string[]> {
  const {
    threshold = PPL_THRESHOLD,
    minChunkSize = MIN_CHUNK_SIZE,
    maxChunkSize = MAX_CHUNK_SIZE,
    useDynamicMerging = true
  } = options;

  const sentences = splitIntoSentences(text);
  if (sentences.length <= 1) {
    return [text];
  }

  const sentencesWithPPL: SentenceWithPPL[] = sentences.map(s => ({ text: s }));

  let context = "";
  for (let i = 0; i < sentencesWithPPL.length; i++) {
    const sentence = sentencesWithPPL[i];
    if (sentence) {
      sentence.ppl = await calculateSentencePerplexity(sentence.text, context);
      context += " " + sentence.text;

      if (tokenLength(context) > MAX_EMBEDDING_TOKENS * 0.8) {
        const sentences_to_keep = Math.floor(sentences.length * 0.3);
        const recentSentences = sentencesWithPPL.slice(-sentences_to_keep);
        context = recentSentences.map(s => s.text).join(" ");
      }
    }
  }

  const boundaries = await detectPPLMinima(sentencesWithPPL, threshold);

  const chunks: string[] = [];
  let currentChunk = "";

  for (let i = 0; i < sentences.length; i++) {
    currentChunk += sentences[i] + " ";

    const shouldSplit = boundaries.includes(i) ||
      tokenLength(currentChunk) >= maxChunkSize;

    if (shouldSplit && tokenLength(currentChunk.trim()) >= minChunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  if (useDynamicMerging) {
    return await dynamicallyMergeChunks(chunks, maxChunkSize);
  }

  return chunks;
}

/**
 * Merges small chunks together to optimize chunk sizes while respecting token limits
 * Attempts to combine chunks up to the target size without exceeding it
 * @param chunks - Array of text chunks to potentially merge
 * @param targetSize - Target token size for merged chunks
 * @returns Promise resolving to array of optimally-sized merged chunks
 */
async function dynamicallyMergeChunks(chunks: string[], targetSize: number): Promise<string[]> {
  const mergedChunks: string[] = [];
  let currentMerged = "";

  for (const chunk of chunks) {
    const combinedLength = tokenLength(currentMerged + " " + chunk);

    if (combinedLength <= targetSize) {
      currentMerged = currentMerged ? currentMerged + " " + chunk : chunk;
    } else {
      if (currentMerged) {
        mergedChunks.push(currentMerged);
      }
      currentMerged = chunk;
    }
  }

  if (currentMerged) {
    mergedChunks.push(currentMerged);
  }

  return mergedChunks;
}

/**
 * Chunks a parsed document into manageable pieces based on HTML structure
 * Respects heading hierarchy and maintains context through heading paths
 * Implements sliding window overlap to preserve context across chunk boundaries
 * @param doc - The parsed document to chunk
 * @returns Generator yielding individual chunks with metadata
 */
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

/**
 * Chunks an extracted page into enhanced chunks with rich metadata
 * Creates separate chunks for content, metadata, images, and interactive elements
 * @param extractedPage - Pre-extracted page data with structured information
 * @returns AsyncGenerator yielding enhanced chunks with semantic context
 */
async function* chunkExtractedPage(extractedPage: ExtractedPage): AsyncGenerator<EnhancedChunk> {
  const domain = new URL(extractedPage.url).hostname;
  const baseContext = `${extractedPage.title} - ${extractedPage.excerpt || 'No description'}`;

  const contentLength = Number.isInteger(extractedPage.contentLength) ? extractedPage.contentLength : 0;

  if (extractedPage.content) {
    yield* chunkContentWithPPL(extractedPage, domain, baseContext, contentLength);
  }

  yield* generateEnhancedMetadataChunks(extractedPage, domain, baseContext, contentLength);
}

/**
 * Chunks page content using advanced perplexity-based analysis
 * Falls back to traditional chunking if perplexity analysis fails
 * @param extractedPage - The extracted page data
 * @param domain - Domain name for metadata
 * @param baseContext - Semantic context for the chunks
 * @param contentLength - Length of the original content
 * @returns AsyncGenerator yielding content chunks with enhanced metadata
 */
async function* chunkContentWithPPL(
  extractedPage: ExtractedPage,
  domain: string,
  baseContext: string,
  contentLength: number
): AsyncGenerator<EnhancedChunk> {
  if (!extractedPage.content) return;

  // Skip expensive perplexity chunking unless explicitly enabled
  if (!ENABLE_PPL_CHUNKING || FAST_MODE) {
    log('info', 'Using fast traditional chunking (PPL chunking disabled)');
    yield* chunkContentTraditional(extractedPage, domain, baseContext, contentLength);
    return;
  }

  try {
    log('info', 'Using perplexity-based chunking (slow but potentially better quality)');
    const pplChunks = await performPPLChunking(extractedPage.content, {
      threshold: PPL_THRESHOLD,
      minChunkSize: MIN_CHUNK_SIZE,
      maxChunkSize: MAX_CHUNK_SIZE,
      useDynamicMerging: true
    });

    for (let i = 0; i < pplChunks.length; i++) {
      const chunkText = pplChunks[i];
      if (chunkText && tokenLength(chunkText) <= MAX_EMBEDDING_TOKENS) {
        yield {
          chunkId: uuidv4(),
          docId: uuidv4(),
          text: chunkText,
          headingPath: `Content Chunk ${i + 1}`,
          chunkType: 'content',
          semanticContext: baseContext,
          domain,
          contentLength,
          ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
          ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
          ...(extractedPage.byline && { author: extractedPage.byline }),
        };
      }
    }
  } catch (error) {
    log('warn', 'PPL chunking failed, falling back to traditional chunking', error);
    yield* chunkContentTraditional(extractedPage, domain, baseContext, contentLength);
  }
}

/**
 * Traditional HTML-structure-based content chunking as fallback method
 * Uses heading hierarchy and token limits to create content chunks
 * @param extractedPage - The extracted page data
 * @param domain - Domain name for metadata
 * @param baseContext - Semantic context for the chunks
 * @param contentLength - Length of the original content
 * @returns Generator yielding content chunks with enhanced metadata
 */
function* chunkContentTraditional(
  extractedPage: ExtractedPage,
  domain: string,
  baseContext: string,
  contentLength: number
): Generator<EnhancedChunk> {
  if (!extractedPage.content) return;

  // Fast mode: use simple text splitting instead of HTML parsing for better performance
  if (FAST_MODE) {
    yield* chunkContentFast(extractedPage, domain, baseContext, contentLength);
    return;
  }

  const root = parse(extractedPage.content);
  let buf = "";
  let headingPath: string[] = [];

  const flush = (): EnhancedChunk | undefined => {
    if (buf.trim()) {
      const chunk: EnhancedChunk = {
        chunkId: uuidv4(),
        docId: uuidv4(),
        text: buf.trim(),
        headingPath: headingPath.join(" » "),
        chunkType: 'content',
        semanticContext: baseContext,
        domain,
        contentLength,
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

/**
 * Fast content chunking that skips HTML parsing for maximum performance
 * Uses simple text splitting with sentence awareness
 * @param extractedPage - The extracted page data
 * @param domain - Domain name for metadata
 * @param baseContext - Semantic context for the chunks
 * @param contentLength - Length of the original content
 * @returns Generator yielding content chunks with enhanced metadata
 */
function* chunkContentFast(
  extractedPage: ExtractedPage,
  domain: string,
  baseContext: string,
  contentLength: number
): Generator<EnhancedChunk> {
  if (!extractedPage.content) return;

  // Use textContent if available for faster processing
  const text = extractedPage.textContent || extractedPage.content;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);

  let currentChunk = "";
  let chunkIndex = 1;

  const flushChunk = (): EnhancedChunk | null => {
    if (currentChunk.trim()) {
      const chunk: EnhancedChunk = {
        chunkId: uuidv4(),
        docId: uuidv4(),
        text: currentChunk.trim(),
        headingPath: `Content Chunk ${chunkIndex}`,
        chunkType: 'content',
        semanticContext: baseContext,
        domain,
        contentLength,
        ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
        ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
        ...(extractedPage.byline && { author: extractedPage.byline }),
      };
      chunkIndex++;
      currentChunk = "";
      return chunk;
    }
    return null;
  };

  for (const sentence of sentences) {
    const testChunk = currentChunk + sentence + ". ";

    if (tokenLength(testChunk) > MAX_CHUNK_SIZE) {
      // Flush current chunk if adding this sentence would exceed limit
      const chunk = flushChunk();
      if (chunk) yield chunk;

      // Start new chunk with overlap
      const words = currentChunk.split(" ");
      const overlapText = words.slice(-OVERLAP_TOKENS).join(" ");
      currentChunk = overlapText + sentence + ". ";
    } else {
      currentChunk = testChunk;
    }
  }

  // Flush final chunk
  const finalChunk = flushChunk();
  if (finalChunk) yield finalChunk;
}

/**
 * Generates enhanced metadata chunks from extracted page information
 * Creates separate chunks for page metadata, images, and interactive elements
 * @param extractedPage - The extracted page data
 * @param domain - Domain name for metadata
 * @param baseContext - Semantic context for the chunks
 * @param contentLength - Length of the original content
 * @returns Generator yielding metadata chunks with different types (metadata, image_context, action)
 */
function* generateEnhancedMetadataChunks(
  extractedPage: ExtractedPage,
  domain: string,
  baseContext: string,
  contentLength: number
): Generator<EnhancedChunk> {
  const metadataComponents = [
    `Title: ${extractedPage.title}`,
    `URL: ${extractedPage.url}`,
    extractedPage.excerpt ? `Description: ${extractedPage.excerpt}` : null,
    extractedPage.byline ? `Author: ${extractedPage.byline}` : null,
    extractedPage.publishedTime ? `Published: ${extractedPage.publishedTime}` : null,
    extractedPage.siteName ? `Site: ${extractedPage.siteName}` : null,
    `Content Length: ${contentLength} characters`
  ].filter((component): component is string => component !== null);

  const metadataChunks = createAdaptiveMetadataChunks(metadataComponents, MAX_CHUNK_SIZE);

  for (let i = 0; i < metadataChunks.length; i++) {
    const chunk = metadataChunks[i];
    if (chunk) {
      const chunkText = chunk.join('\n');

      if (tokenLength(chunkText) <= MAX_EMBEDDING_TOKENS) {
        yield {
          chunkId: uuidv4(),
          docId: uuidv4(),
          text: chunkText,
          headingPath: metadataChunks.length > 1 ? `Page Metadata (${i + 1}/${metadataChunks.length})` : "Page Metadata",
          chunkType: 'metadata',
          semanticContext: baseContext,
          domain,
          contentLength,
          ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
          ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
          ...(extractedPage.byline && { author: extractedPage.byline }),
        };
      }
    }
  }

  if (extractedPage.images && extractedPage.images.length > 0) {
    const imageChunks = createAdaptiveImageChunks(extractedPage.images, extractedPage.title || 'Unknown Page', MAX_CHUNK_SIZE);

    for (let i = 0; i < imageChunks.length; i++) {
      const chunk = imageChunks[i];
      if (!chunk) continue;

      yield {
        chunkId: uuidv4(),
        docId: uuidv4(),
        text: chunk,
        headingPath: imageChunks.length > 1 ? `Page Images (${i + 1}/${imageChunks.length})` : "Page Images",
        chunkType: 'image_context',
        semanticContext: baseContext,
        domain,
        contentLength,
        ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
        ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
        ...(extractedPage.byline && { author: extractedPage.byline }),
      };
    }
  }

  if (extractedPage.actions && extractedPage.actions.length > 0) {
    const actionChunks = createAdaptiveActionChunks(extractedPage.actions, extractedPage.title || 'Unknown Page', MAX_CHUNK_SIZE);

    for (let i = 0; i < actionChunks.length; i++) {
      const chunk = actionChunks[i];
      if (!chunk) continue;

      yield {
        chunkId: uuidv4(),
        docId: uuidv4(),
        text: chunk,
        headingPath: actionChunks.length > 1 ? `Page Actions (${i + 1}/${actionChunks.length})` : "Page Actions",
        chunkType: 'action',
        semanticContext: baseContext,
        domain,
        contentLength,
        ...(extractedPage.publishedTime && { publishedTime: extractedPage.publishedTime }),
        ...(extractedPage.siteName && { siteName: extractedPage.siteName }),
        ...(extractedPage.byline && { author: extractedPage.byline }),
      };
    }
  }
}

/**
 * Creates adaptively-sized metadata chunks that respect token limits
 * Groups metadata components together until the size limit is reached
 * @param components - Array of metadata strings to chunk
 * @param maxChunkSize - Maximum token size per chunk
 * @returns Array of metadata chunk arrays, each respecting the size limit
 */
function createAdaptiveMetadataChunks(components: string[], maxChunkSize: number): string[][] {
  const chunks: string[][] = [];
  let currentChunk: string[] = [];
  let currentSize = 0;

  for (const component of components) {
    const componentSize = tokenLength(component);

    if (currentSize + componentSize > maxChunkSize && currentChunk.length > 0) {
      chunks.push([...currentChunk]);
      currentChunk = [component];
      currentSize = componentSize;
    } else {
      currentChunk.push(component);
      currentSize += componentSize;
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks.length > 0 ? chunks : [components];
}

/**
 * Creates adaptively-sized chunks from page images with descriptions
 * Groups image information together until token limits are reached
 * @param images - Array of image objects with src, alt, and title properties
 * @param title - Page title for context
 * @param maxChunkSize - Maximum token size per chunk
 * @returns Array of text chunks containing image information
 */
function createAdaptiveImageChunks(images: any[], title: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const safeTitle = title || 'Unknown Page';
  let currentChunk = `Images from ${safeTitle}:\n`;
  let currentSize = tokenLength(currentChunk);

  for (const img of images) {
    const imageText = `Image: ${img.src}${img.alt ? ` (${img.alt})` : ''}${img.title ? ` - ${img.title}` : ''}`;
    const imageSize = tokenLength(imageText);

    if (currentSize + imageSize > maxChunkSize && currentChunk !== `Images from ${safeTitle}:\n`) {
      chunks.push(currentChunk.trim());
      currentChunk = `Images from ${safeTitle}:\n${imageText}`;
      currentSize = tokenLength(currentChunk);
    } else {
      currentChunk += imageText + '\n';
      currentSize += imageSize;
    }
  }

  if (currentChunk.trim() !== `Images from ${safeTitle}:`) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Creates adaptively-sized chunks from page interactive elements
 * Groups action information together until token limits are reached
 * @param actions - Array of action objects with type, text, and selector properties
 * @param title - Page title for context
 * @param maxChunkSize - Maximum token size per chunk
 * @returns Array of text chunks containing interactive element information
 */
function createAdaptiveActionChunks(actions: any[], title: string, maxChunkSize: number): string[] {
  const chunks: string[] = [];
  const safeTitle = title || 'Unknown Page';
  let currentChunk = `Interactive elements on ${safeTitle}:\n`;
  let currentSize = tokenLength(currentChunk);

  for (const action of actions) {
    const actionText = `${action.type}: ${action.text} (${action.selector})`;
    const actionSize = tokenLength(actionText);

    if (currentSize + actionSize > maxChunkSize && currentChunk !== `Interactive elements on ${safeTitle}:\n`) {
      chunks.push(currentChunk.trim());
      currentChunk = `Interactive elements on ${safeTitle}:\n${actionText}`;
      currentSize = tokenLength(currentChunk);
    } else {
      currentChunk += actionText + '\n';
      currentSize += actionSize;
    }
  }

  if (currentChunk.trim() !== `Interactive elements on ${safeTitle}:`) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

/**
 * Creates vector embeddings from text using OpenAI's text-embedding-3-small model
 * Includes automatic truncation and retry logic for texts that exceed token limits
 * @param text - The text to create embeddings for
 * @returns Promise resolving to a vector embedding array
 * @throws Error if embedding creation fails after truncation attempts
 */
async function embed(text: string): Promise<number[]> {
  const estimatedTokens = tokenLength(text);

  if (estimatedTokens > MAX_EMBEDDING_TOKENS) {
    log('warn', `Text too long for embedding (${estimatedTokens} tokens), truncating...`);
    text = truncateTextToTokenLimit(text, MAX_EMBEDDING_TOKENS);
  }

  try {
    const resp = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: text,
    });

    if (!resp.data[0]?.embedding) {
      throw new Error("Failed to get embedding");
    }

    return resp.data[0].embedding as number[];
  } catch (error: any) {
    if (error.message?.includes('maximum context length')) {
      log('warn', `Retrying with more aggressive truncation (text was too long)`);
      const moreAggressiveTruncation = truncateTextToTokenLimit(text, Math.floor(MAX_EMBEDDING_TOKENS * 0.7));

      const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: moreAggressiveTruncation,
      });

      if (!resp.data[0]?.embedding) {
        throw new Error("Failed to get embedding after truncation");
      }

      return resp.data[0].embedding as number[];
    }

    throw error;
  }
}

/**
 * Stores basic document chunks in the Turbopuffer vector database
 * Creates embeddings for each chunk and stores them with metadata
 * @param chunks - Array of basic chunks to store
 * @returns Promise that resolves when all chunks are successfully stored
 */
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

/**
 * Stores enhanced document chunks with rich metadata in the Turbopuffer vector database
 * Creates embeddings for each chunk and stores them with extensive metadata fields
 * @param chunks - Array of enhanced chunks with metadata to store
 * @returns Promise that resolves when all chunks are successfully stored
 */
async function upsertEnhancedChunks(chunks: EnhancedChunk[]): Promise<void> {
  if (chunks.length === 0) return;

  log('info', `Creating embeddings for ${chunks.length} chunks...`);
  const startTime = Date.now();

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

  // Process embeddings with progress logging
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    if (!c) continue; // Safety check

    if (i % 5 === 0) {
      log('info', `Processing embedding ${i + 1}/${chunks.length}`);
    }

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
  }

  const embeddingTime = Date.now() - startTime;
  log('info', `Created ${chunks.length} embeddings in ${embeddingTime}ms`);

  const writeStartTime = Date.now();
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
    },
  });

  const writeTime = Date.now() - writeStartTime;
  const totalTime = Date.now() - startTime;
  log('info', `Stored ${chunks.length} chunks in ${writeTime}ms (total: ${totalTime}ms)`);
}

/**
 * Ingests a webpage URL into the RAG knowledge base using basic chunking
 * Fetches, parses, chunks, and indexes the webpage content
 * @param url - The URL to ingest
 * @returns Promise resolving to ingestion results with document ID and chunk count
 */
export async function ingestUrl(url: string) {
  log('info', `Ingesting URL: ${url}`);
  const doc = await fetchAndParse(url);
  const chunks = [...chunkDocument(doc)];
  await upsertChunks(chunks);
  log('info', `Successfully ingested ${chunks.length} chunks from ${url}`);
  return { doc_id: doc.docId, n_chunks: chunks.length };
}

/**
 * Performs semantic search over the knowledge base using vector similarity
 * Creates an embedding for the query and finds the most similar stored chunks
 * @param query - The search query text
 * @param top_k - Number of top results to return (default: 5)
 * @returns Promise resolving to array of matching chunks with similarity scores
 */
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

/**
 * Ingests a pre-extracted page into the RAG knowledge base with enhanced metadata
 * Uses advanced perplexity-based chunking and creates multiple chunk types
 * @param extractedPage - Pre-extracted page data with structured information
 * @returns Promise resolving to ingestion results with detailed chunk type breakdown
 */
export async function ingestExtractedPage(extractedPage: ExtractedPage) {
  const startTime = Date.now();
  log('info', `Ingesting ExtractedPage: ${extractedPage.title} (${extractedPage.contentLength || 'unknown size'} chars)`);

  const chunks: EnhancedChunk[] = [];

  // Collect all chunks
  const chunkStartTime = Date.now();
  for await (const chunk of chunkExtractedPage(extractedPage)) {
    chunks.push(chunk);
  }
  const chunkTime = Date.now() - chunkStartTime;

  log('info', `Generated ${chunks.length} chunks in ${chunkTime}ms`);

  // Store chunks in database
  await upsertEnhancedChunks(chunks);

  const totalTime = Date.now() - startTime;
  log('info', `Successfully ingested ${chunks.length} enhanced chunks from ${extractedPage.title} in ${totalTime}ms`);

  return {
    url: extractedPage.url,
    title: extractedPage.title,
    n_chunks: chunks.length,
    processing_time_ms: totalTime,
    chunk_types: chunks.reduce((acc, chunk) => {
      acc[chunk.chunkType] = (acc[chunk.chunkType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  };
}

export const RAGTools = [
  {
    name: "ingest_url",
    description: "Crawl a public webpage and add it to the RAG knowledge base using fast traditional chunking",
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
    description: "Add a pre-extracted page (ExtractedPage) to the RAG knowledge base with enhanced metadata and optimized fast chunking. Uses efficient sentence-based chunking by default for speed.",
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

