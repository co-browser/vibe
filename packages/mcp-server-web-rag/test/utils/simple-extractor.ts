import type { ExtractedPage } from "@vibe/tab-extraction-core";
import fetch from "node-fetch";
import { JSDOM } from "jsdom";

/**
 * Simple extractor that reuses the same logic as tools.ts fetchAndParse
 * but returns an ExtractedPage format for testing
 */
export class SimpleExtractor {
  async extractFromUrl(url: string): Promise<ExtractedPage> {
    // Reuse the same fetch logic as tools.ts
    const res = await fetch(url, { 
      redirect: "follow",
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RAG-Test-Bot/1.0)'
      }
    });
    
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    
    const html = await res.text();
    const dom = new JSDOM(html, { url });
    const { document } = dom.window;

    // Use the same Readability extraction as tools.ts
    const { Readability } = await import("@mozilla/readability");
    const article = new Readability(document).parse();
    
    if (!article) {
      throw new Error("Failed to extract content with Readability");
    }

    // Extract metadata using the same approach as enhanced.ts
    const metadata = this.extractMetadata(document);
    
    // Extract additional elements
    const images = this.extractImages(document, url);
    const links = this.extractLinks(document, url);
    const actions = this.extractActions(document);

    // Convert to ExtractedPage format
    const extractedPage: ExtractedPage = {
      // Core PageContent properties (same as Readability output)
      title: article.title || document.title || "Untitled",
      url,
      excerpt: article.excerpt || this.getMetaContent(document, "description") || "",
      content: article.content || "",
      textContent: article.textContent || "",
      byline: (article as any).byline || undefined,
      siteName: (article as any).siteName || this.getMetaContent(document, "og:site_name") || undefined,
      publishedTime: (article as any).publishedTime || undefined,
      modifiedTime: undefined,
      lang: (article as any).lang || document.documentElement.lang || "en",
      dir: (article as any).dir || document.documentElement.dir || "ltr",

      // Enhanced properties (same as enhanced.ts)
      metadata,
      images,
      links,
      actions,
      extractionTime: Date.now(),
      contentLength: article.textContent?.length || 0,
    };

    return extractedPage;
  }

  /**
   * Extract metadata - same logic as enhanced.ts
   */
  private extractMetadata(document: Document) {
    const metadata = {
      openGraph: {} as Record<string, string>,
      twitter: {} as Record<string, string>,
      jsonLd: [] as any[],
      microdata: [] as any[],
    };

    // Extract Open Graph metadata
    document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
      const property = meta.getAttribute('property')?.replace('og:', '');
      const content = meta.getAttribute('content');
      if (property && content) {
        metadata.openGraph[property] = content;
      }
    });

    // Extract Twitter Card metadata
    document.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
      const name = meta.getAttribute('name')?.replace('twitter:', '');
      const content = meta.getAttribute('content');
      if (name && content) {
        metadata.twitter[name] = content;
      }
    });

    // Extract JSON-LD (limited for performance)
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script, index) => {
      if (index < 3) { // Limit to first 3 JSON-LD entries
        try {
          if (script.textContent) {
            metadata.jsonLd.push(JSON.parse(script.textContent));
          }
        } catch {
          // Ignore malformed JSON-LD
        }
      }
    });

    return metadata;
  }

  /**
   * Extract images - same limits as enhanced.ts
   */
  private extractImages(document: Document, baseUrl: string) {
    const images: ExtractedPage["images"] = [];
    const imageElements = document.querySelectorAll('img');
    
    // Use same limit as enhanced.ts (10 images)
    Array.from(imageElements).slice(0, 10).forEach(img => {
      const src = img.getAttribute('src');
      if (src) {
        try {
          const absoluteUrl = new URL(src, baseUrl).href;
          images.push({
            src: absoluteUrl,
            alt: img.getAttribute('alt') || undefined,
            title: img.getAttribute('title') || undefined,
          });
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return images;
  }

  /**
   * Extract links - same limits as enhanced.ts  
   */
  private extractLinks(document: Document, baseUrl: string) {
    const links: ExtractedPage["links"] = [];
    const linkElements = document.querySelectorAll('a[href]');
    
    // Use same limit as enhanced.ts (20 links)
    Array.from(linkElements).slice(0, 20).forEach(link => {
      const href = link.getAttribute('href');
      const text = link.textContent?.trim();
      
      if (href && text) {
        try {
          const absoluteUrl = new URL(href, baseUrl).href;
          links.push({
            href: absoluteUrl,
            text,
            rel: link.getAttribute('rel') || undefined,
          });
        } catch {
          // Skip invalid URLs
        }
      }
    });

    return links;
  }

  /**
   * Extract actions - same logic as enhanced.ts
   */
  private extractActions(document: Document) {
    const actions: ExtractedPage["actions"] = [];

    // Extract buttons (limit to 10 like enhanced.ts)
    const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
    Array.from(buttons).slice(0, 10).forEach(button => {
      const text = button.textContent?.trim() || (button as HTMLInputElement).value || '';
      if (text) {
        actions.push({
          type: 'button',
          selector: button.id ? `#${button.id}` : button.tagName.toLowerCase(),
          text,
          attributes: {
            type: button.getAttribute('type') || 'button',
          },
        });
      }
    });

    // Extract forms (limit to 5 like enhanced.ts)
    const forms = document.querySelectorAll('form');
    Array.from(forms).slice(0, 5).forEach((form, index) => {
      actions.push({
        type: 'form',
        selector: form.id ? `#${form.id}` : `form:nth-child(${index + 1})`,
        text: form.getAttribute('aria-label') || `Form ${index + 1}`,
        attributes: {
          action: form.getAttribute('action') || '',
          method: form.getAttribute('method') || 'get',
        },
      });
    });

    return actions;
  }

  private getMetaContent(document: Document, name: string): string | undefined {
    const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return meta?.getAttribute('content') || undefined;
  }
} 