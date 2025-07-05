import type { ExtractedPage } from "../types/index.js";

/**
 * Format extracted page content for LLM consumption
 */
export function formatForLLM(page: ExtractedPage): string {
  const sections: string[] = [];

  // Title and basic info
  sections.push(`# ${page.title}`);
  sections.push(`URL: ${page.url}`);

  if (page.byline) {
    sections.push(`Author: ${page.byline}`);
  }

  if (page.publishedTime) {
    sections.push(`Published: ${page.publishedTime}`);
  }

  sections.push(""); // Empty line

  // Excerpt
  if (page.excerpt) {
    sections.push("## Summary");
    sections.push(page.excerpt);
    sections.push("");
  }

  // Main content (cleaned HTML)
  sections.push("## Content");
  sections.push(cleanHtmlForLLM(page.content));
  sections.push("");

  // Metadata
  if (
    page.metadata.openGraph &&
    Object.keys(page.metadata.openGraph).length > 0
  ) {
    sections.push("## Metadata");
    sections.push("### Open Graph");
    for (const [key, value] of Object.entries(page.metadata.openGraph)) {
      if (value) sections.push(`- ${key}: ${value}`);
    }
    sections.push("");
  }

  // Key actions
  if (page.actions.length > 0) {
    sections.push("## Available Actions");
    page.actions
      .slice(0, 10)
      .forEach((action: { type: string; text: string }) => {
        sections.push(`- [${action.type}] ${action.text}`);
      });
    sections.push("");
  }

  // Statistics
  sections.push("## Page Statistics");
  sections.push(`- Content length: ${page.contentLength} characters`);
  sections.push(`- Images: ${page.images.length}`);
  sections.push(`- Links: ${page.links.length}`);
  sections.push(`- Actions: ${page.actions.length}`);
  sections.push(`- Extraction time: ${page.extractionTime}ms`);

  return sections.join("\n");
}

/**
 * Clean HTML content for better LLM readability
 */
function cleanHtmlForLLM(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );
  cleaned = cleaned.replace(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    "",
  );

  // Convert common HTML elements to markdown-like format
  cleaned = cleaned.replace(/<h1[^>]*>(.*?)<\/h1>/gi, "# $1\n");
  cleaned = cleaned.replace(/<h2[^>]*>(.*?)<\/h2>/gi, "## $1\n");
  cleaned = cleaned.replace(/<h3[^>]*>(.*?)<\/h3>/gi, "### $1\n");
  cleaned = cleaned.replace(/<h4[^>]*>(.*?)<\/h4>/gi, "#### $1\n");
  cleaned = cleaned.replace(/<h5[^>]*>(.*?)<\/h5>/gi, "##### $1\n");
  cleaned = cleaned.replace(/<h6[^>]*>(.*?)<\/h6>/gi, "###### $1\n");

  // Convert lists
  cleaned = cleaned.replace(/<li[^>]*>(.*?)<\/li>/gi, "- $1\n");

  // Convert links
  cleaned = cleaned.replace(
    /<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi,
    "[$2]($1)",
  );

  // Convert bold and italic
  cleaned = cleaned.replace(/<b[^>]*>(.*?)<\/b>/gi, "**$1**");
  cleaned = cleaned.replace(/<strong[^>]*>(.*?)<\/strong>/gi, "**$1**");
  cleaned = cleaned.replace(/<i[^>]*>(.*?)<\/i>/gi, "*$1*");
  cleaned = cleaned.replace(/<em[^>]*>(.*?)<\/em>/gi, "*$1*");

  // Remove remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, "");

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Create a concise summary of the page
 */
export function createPageSummary(page: ExtractedPage): string {
  const summary: string[] = [];

  summary.push(`Title: ${page.title}`);
  summary.push(`URL: ${page.url}`);

  if (page.excerpt) {
    summary.push(`Summary: ${page.excerpt}`);
  }

  summary.push(`Content: ${page.textContent.substring(0, 500)}...`);

  return summary.join("\n");
}
