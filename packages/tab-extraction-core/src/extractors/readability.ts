import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { createLogger } from "@vibe/shared-types";
import { extractionConfig } from "../config/extraction";
import type { PageContent } from "../types/index";
import type { CDPConnection } from "../cdp/connector";

const logger = createLogger("readability-extractor");

export class ReadabilityExtractor {
  async extract(connection: CDPConnection): Promise<PageContent | null> {
    try {
      const startTime = Date.now();

      // Get page URL first
      const { frameTree } = await connection.client.Page.getFrameTree();
      const url = frameTree.frame.url;

      // Wait for dynamic content to load (especially for Angular/React sites)
      await this.waitForDynamicContent(connection);

      // Get page HTML after waiting for dynamic content
      const { result } = await connection.client.Runtime.evaluate({
        expression: "document.documentElement.outerHTML",
        returnByValue: true,
      });

      if (!result.value || typeof result.value !== "string") {
        logger.error("Failed to get page HTML");
        return null;
      }

      // Parse HTML with jsdom
      const dom = new JSDOM(result.value, { url });
      const document = dom.window.document;

      // Apply Readability with configuration
      const readabilityOptions = {
        debug: extractionConfig.readability.enableDebug,
        charThreshold: extractionConfig.readability.charThreshold,
        keepClasses: true, // Keep classes for better styling context
        maxElemsToParse: 3000, // Limit for performance
      };

      if (extractionConfig.readability.enableDebug) {
        logger.debug("Readability options:", readabilityOptions);
      }

      const reader = new Readability(document, readabilityOptions);
      const article = reader.parse();

      if (article) {
        logger.info(
          `[Readability] Readability extraction - Content length: ${article.textContent?.length || 0} chars, Title: "${article.title}"`,
        );
      } else {
        logger.warn(`[Readability] Readability parsing failed for ${url}`);
      }

      if (!article) {
        logger.warn(
          "Readability could not parse the page, falling back to basic extraction",
        );

        // Fallback: Extract basic content manually
        const fallbackContent = await this.fallbackExtraction(connection, url);
        if (fallbackContent) {
          return fallbackContent;
        }

        return null;
      }

      const endTime = Date.now();
      const extractionTime = endTime - startTime;

      logger.debug(`Content extracted in ${extractionTime}ms`);

      return {
        title: article.title || "",
        url,
        excerpt: article.excerpt || "",
        content: article.content || "",
        textContent: article.textContent || "",
        byline: article.byline || undefined,
        siteName: article.siteName || undefined,
        publishedTime: article.publishedTime || undefined,
        lang: article.lang || undefined,
        dir: article.dir || undefined,
      };
    } catch (error) {
      logger.error("Error extracting content:", error);
      logger.error("Error details:", (error as Error).message);
      logger.error("Stack trace:", (error as Error).stack);

      // Try fallback extraction on error
      try {
        const { frameTree } = await connection.client.Page.getFrameTree();
        const url = frameTree.frame.url;
        const fallbackContent = await this.fallbackExtraction(connection, url);
        if (fallbackContent) {
          return fallbackContent;
        }
      } catch (fallbackError) {
        logger.error("Fallback extraction also failed:", fallbackError);
      }

      return null;
    }
  }

  /**
   * Fallback extraction method when Readability fails
   */
  private async fallbackExtraction(
    connection: CDPConnection,
    url: string,
  ): Promise<PageContent | null> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            const getMetaContent = (name) => {
              const meta = document.querySelector(\`meta[name="\${name}"], meta[property="\${name}"]\`);
              return meta ? meta.content : '';
            };
            
            const title = document.title || getMetaContent('og:title') || '';
            const description = getMetaContent('description') || getMetaContent('og:description') || '';
            
            // Get main content - try various common selectors
            const contentSelectors = ['main', 'article', '[role="main"]', '#content', '.content', '.article-body'];
            let mainContent = '';
            
            for (const selector of contentSelectors) {
              const element = document.querySelector(selector);
              if (element) {
                const selectorContent = element.innerText || element.textContent || '';
                if (selectorContent.length > 100) {
                  mainContent = selectorContent;
                  break;
                }
              }
            }
            
            // Last resort: get body text but filter out navigation
            if (!mainContent || mainContent.length < 200) {
              // Remove navigation, headers, footers
              const elementsToRemove = ['nav', 'header', 'footer', '.nav', '.navigation', '.menu'];
              elementsToRemove.forEach(selector => {
                document.querySelectorAll(selector).forEach(el => el.remove());
              });
              
              mainContent = document.body.innerText || document.body.textContent || '';
            }
            
            // Get paragraphs if available
            const paragraphs = Array.from(document.querySelectorAll('p'))
              .map(p => p.innerText || p.textContent || '')
              .filter(text => text.length > 50)
              .join('\\n\\n');
            
            return {
              title,
              description,
              content: mainContent,
              paragraphs,
              author: getMetaContent('author') || getMetaContent('article:author') || '',
              siteName: getMetaContent('og:site_name') || '',
              lang: document.documentElement.lang || 'en'
            };
          })()
        `,
        returnByValue: true,
      });

      const extracted = result.value as any;

      if (!extracted || !extracted.content) {
        return null;
      }

      // Use paragraphs if available, otherwise use main content
      const contentToUse = extracted.paragraphs || extracted.content;

      return {
        title: extracted.title,
        url,
        excerpt: extracted.description,
        content: contentToUse,
        textContent: contentToUse,
        byline: extracted.author || undefined,
        siteName: extracted.siteName || undefined,
        lang: extracted.lang || undefined,
      };
    } catch (error) {
      logger.error("Fallback extraction failed:", error);
      return null;
    }
  }

  /**
   * Extract content from specific selectors
   */
  async extractFromSelectors(
    connection: CDPConnection,
    selectors: string[],
  ): Promise<string[]> {
    const results: string[] = [];

    for (const selector of selectors) {
      try {
        const { result } = await connection.client.Runtime.evaluate({
          expression: `
            (() => {
              const element = document.querySelector('${selector}');
              return element ? element.textContent : null;
            })()
          `,
          returnByValue: true,
        });

        if (result.value) {
          results.push(result.value as string);
        }
      } catch (error) {
        logger.error(`Error extracting selector ${selector}:`, error);
      }
    }

    return results;
  }

  /**
   * Wait for dynamic content to load (Angular, React, Vue, etc.)
   */
  private async waitForDynamicContent(
    connection: CDPConnection,
  ): Promise<void> {
    try {
      // Wait for page to be ready and dynamic content to load
      await connection.client.Runtime.evaluate({
        expression: `
          new Promise((resolve) => {
            const checkReady = () => {
              // Check if Angular is present and ready
              if (window.ng || window.getAllAngularRootElements) {
                const isAngularReady = () => {
                  try {
                    const elements = window.getAllAngularRootElements ? window.getAllAngularRootElements() : [];
                    return elements.length > 0 || document.querySelector('[ng-version]');
                  } catch (e) {
                    return false;
                  }
                };
                
                if (isAngularReady()) {
                  setTimeout(resolve, 1500); // Give Angular extra time to render
                  return;
                }
              }
              
              // Check if React is present
              if (window.React || document.querySelector('[data-reactroot]')) {
                setTimeout(resolve, 1000); // Give React time to render
                return;
              }
              
              // Check for Vue
              if (window.Vue || document.querySelector('[data-server-rendered="true"]')) {
                setTimeout(resolve, 1000); // Give Vue time to render
                return;
              }
              
              // Check for general SPA indicators
              const spaIndicators = [
                'app-root', 'ng-app', '[ng-controller]', '[data-ng-app]',
                '#app', '#root', '.app', '[data-reactroot]'
              ];
              
              const hasSPAIndicators = spaIndicators.some(selector => document.querySelector(selector));
              
              if (hasSPAIndicators) {
                // Wait longer for SPAs
                setTimeout(resolve, 2000);
              } else {
                // Regular page, shorter wait
                setTimeout(resolve, 500);
              }
            };
            
            if (document.readyState === 'complete') {
              checkReady();
            } else {
              window.addEventListener('load', checkReady);
            }
          })
        `,
        awaitPromise: true,
      });

      logger.debug("Dynamic content wait completed");
    } catch (error) {
      logger.warn("Error waiting for dynamic content:", error);
      // Continue anyway with a basic timeout
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * Check if the page is likely an article or blog post
   */
  async isProbablyArticle(connection: CDPConnection): Promise<boolean> {
    try {
      const { result } = await connection.client.Runtime.evaluate({
        expression: `
          (() => {
            // Check for common article indicators
            const hasArticleTag = !!document.querySelector('article');
            const hasDatePublished = !!document.querySelector('[datetime], time, .published, .post-date');
            const hasAuthor = !!document.querySelector('.author, .byline, [rel="author"]');
            const hasLongText = Array.from(document.querySelectorAll('p')).some(p => p.textContent.length > 100);
            
            return hasArticleTag || (hasDatePublished && hasAuthor) || hasLongText;
          })()
        `,
        returnByValue: true,
      });

      return result.value as boolean;
    } catch (error) {
      logger.error("Error checking if page is article:", error);
      return false;
    }
  }
}
