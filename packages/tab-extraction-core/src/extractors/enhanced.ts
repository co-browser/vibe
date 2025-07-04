import { createLogger } from "@vibe/shared-types";
import type { ExtractedPage, PageMetadata } from "../types/index";
import type { CDPConnection } from "../cdp/connector";
import { ReadabilityExtractor } from "./readability";
import { extractionConfig } from "../config/extraction";

const logger = createLogger("enhanced-extractor");

export class EnhancedExtractor {
  private readabilityExtractor: ReadabilityExtractor;
  private maxImages = extractionConfig.limits.maxImages;
  private maxLinks = extractionConfig.limits.maxLinks;
  private maxActions = extractionConfig.limits.maxActions;

  constructor() {
    this.readabilityExtractor = new ReadabilityExtractor();
  }

  async extract(connection: CDPConnection): Promise<ExtractedPage | null> {
    try {
      const startTime = Date.now();

      // Get basic content with Readability
      const basicContent = await this.readabilityExtractor.extract(connection);
      if (!basicContent) {
        return null;
      }

      // Extract metadata
      const metadata = await this.extractMetadata(connection);

      // Extract images
      const images = await this.extractImages(connection);

      // Extract links
      const links = await this.extractLinks(connection);

      // Extract actions
      const actions = await this.extractActions(connection);

      const extractionTime = Date.now() - startTime;

      return {
        ...basicContent,
        metadata,
        images,
        links,
        actions,
        extractionTime,
        contentLength: basicContent.textContent.length,
      };
    } catch (error) {
      logger.error("Error in enhanced extraction:", error);
      return null;
    }
  }

  private async extractMetadata(
    connection: CDPConnection,
  ): Promise<PageMetadata> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            const metadata = {
              openGraph: {},
              twitter: {},
              jsonLd: [],
              microdata: []
            };

            // Extract Open Graph metadata
            document.querySelectorAll('meta[property^="og:"]').forEach(meta => {
              const property = meta.getAttribute('property').replace('og:', '');
              metadata.openGraph[property] = meta.content;
            });

            // Extract Twitter Card metadata
            document.querySelectorAll('meta[name^="twitter:"]').forEach(meta => {
              const name = meta.getAttribute('name').replace('twitter:', '');
              metadata.twitter[name] = meta.content;
            });

            // Extract JSON-LD
            document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
              try {
                metadata.jsonLd.push(JSON.parse(script.textContent));
              } catch (e) {}
            });

            return metadata;
          })()
        `,
        returnByValue: true,
      });

      return result.value as PageMetadata;
    } catch (error) {
      logger.error("Error extracting metadata:", error);
      return { openGraph: {}, twitter: {}, jsonLd: [], microdata: [] };
    }
  }

  private async extractImages(
    connection: CDPConnection,
  ): Promise<ExtractedPage["images"]> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            const maxImages = ${this.maxImages};
            const images = Array.from(document.querySelectorAll('img'))
              .slice(0, maxImages)
              .map(img => ({
                src: img.src,
                alt: img.alt || undefined,
                title: img.title || undefined
              }))
              .filter(img => img.src);
            
            if (document.querySelectorAll('img').length > maxImages) {
              // Image limit applied
            }
            
            return images;
          })()
        `,
        returnByValue: true,
      });

      return result.value as ExtractedPage["images"];
    } catch (error) {
      logger.error("Error extracting images:", error);
      return [];
    }
  }

  private async extractLinks(
    connection: CDPConnection,
  ): Promise<ExtractedPage["links"]> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            const maxLinks = ${this.maxLinks};
            const links = Array.from(document.querySelectorAll('a[href]'))
              .slice(0, maxLinks)
              .map(link => ({
                href: link.href,
                text: link.textContent.trim(),
                rel: link.rel || undefined
              }))
              .filter(link => link.href && link.text);
            
            if (document.querySelectorAll('a[href]').length > maxLinks) {
              // Link limit applied
            }
            
            return links;
          })()
        `,
        returnByValue: true,
      });

      return result.value as ExtractedPage["links"];
    } catch (error) {
      logger.error("Error extracting links:", error);
      return [];
    }
  }

  private async extractActions(
    connection: CDPConnection,
  ): Promise<ExtractedPage["actions"]> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            const actions = [];
            const maxActions = ${this.maxActions};

            // Extract buttons
            const buttons = document.querySelectorAll('button, input[type="button"], input[type="submit"]');
            const maxButtons = Math.floor(maxActions / 3);
            Array.from(buttons).slice(0, maxButtons).forEach(button => {
              actions.push({
                type: 'button',
                selector: button.tagName + (button.id ? '#' + button.id : ''),
                text: button.textContent?.trim() || button.value || '',
                attributes: {
                  type: button.type || 'button',
                  disabled: button.disabled ? 'true' : 'false'
                }
              });
            });

            // Extract interactive links
            const interactiveLinks = document.querySelectorAll('a[onclick], a[href^="javascript:"]');
            const maxInteractiveLinks = Math.floor(maxActions / 3);
            Array.from(interactiveLinks).slice(0, maxInteractiveLinks).forEach(link => {
              actions.push({
                type: 'link',
                selector: 'a' + (link.id ? '#' + link.id : ''),
                text: link.textContent?.trim() || '',
                attributes: {
                  href: link.href
                }
              });
            });

            // Extract forms
            const forms = document.querySelectorAll('form');
            const maxForms = Math.floor(maxActions / 3);
            Array.from(forms).slice(0, maxForms).forEach((form, index) => {
              actions.push({
                type: 'form',
                selector: 'form' + (form.id ? '#' + form.id : '[' + index + ']'),
                text: form.getAttribute('aria-label') || 'Form ' + (index + 1),
                attributes: {
                  action: form.action || '',
                  method: form.method || 'get'
                }
              });
            });

            return actions;
          })()
        `,
        returnByValue: true,
      });

      return result.value as ExtractedPage["actions"];
    } catch (error) {
      logger.error("Error extracting actions:", error);
      return [];
    }
  }
}
