import { z } from "zod";
import { createLogger } from "../utils/logger.js";
import { CDPConnector } from "../cdp/connector.js";
import { activeTabTracker } from "../cdp/tabTracker.js";
import { EnhancedExtractor } from "../extractors/enhanced.js";
import { ExtractionError } from "../types/errors.js";
import type { ExtractedPage } from "../types/index.js";

const logger = createLogger("page-extractor-tool");

// Simplified result types
export type PageExtractionResult = ExtractedPage | PageExtractionError;

export type PageExtractionError = {
  readonly isError: true;
  readonly message: string;
};

// Helper function to safely extract text content from PageExtractionResult
export function extractTextFromPageContent(
  result: PageExtractionResult,
): string {
  if ("isError" in result && result.isError) {
    return result.message;
  }

  // At this point, TypeScript knows it's ExtractedPage
  const extractedPage = result as ExtractedPage;
  return (
    extractedPage.content || extractedPage.textContent || "No content available"
  );
}

// Tool parameter schemas
export const getCurrentPageContentSchema = z.object({
  format: z
    .enum(["full", "summary", "markdown", "raw"])
    .default("full")
    .describe("Output format"),
  includeMetadata: z.boolean().default(true).describe("Include page metadata"),
  includeActions: z
    .boolean()
    .default(false)
    .describe("Include interactive elements"),
  cdpTargetId: z
    .string()
    .optional()
    .describe("CDP target ID for the tab to extract from"),
  url: z
    .string()
    .optional()
    .describe("URL of the tab (used for fallback matching)"),
});

export const getPageSummarySchema = z.object({
  includeMetadata: z.boolean().default(true).describe("Include page metadata"),
  cdpTargetId: z
    .string()
    .optional()
    .describe("CDP target ID for the tab to extract from"),
  url: z
    .string()
    .optional()
    .describe("URL of the tab (used for fallback matching)"),
});

export const extractSpecificContentSchema = z.object({
  selectors: z
    .array(z.string())
    .describe("CSS selectors to extract content from"),
  includeText: z.boolean().default(true).describe("Include text content"),
  includeHtml: z.boolean().default(false).describe("Include HTML structure"),
  cdpTargetId: z
    .string()
    .optional()
    .describe("CDP target ID for the tab to extract from"),
  url: z
    .string()
    .optional()
    .describe("URL of the tab (used for fallback matching)"),
});

export const getPageActionsSchema = z.object({
  groupByType: z
    .boolean()
    .default(true)
    .describe("Group actions by type (buttons, links, forms)"),
  includeDisabled: z
    .boolean()
    .default(false)
    .describe("Include disabled elements"),
  cdpTargetId: z
    .string()
    .optional()
    .describe("CDP target ID for the tab to extract from"),
  url: z
    .string()
    .optional()
    .describe("URL of the tab (used for fallback matching)"),
});

// Simplified function signature - single overload
export async function getCurrentPageContent(
  args: z.infer<typeof getCurrentPageContentSchema>,
  cdpConnector: CDPConnector,
): Promise<PageExtractionResult> {
  logger.info(`[PageExtractor] getCurrentPageContent called with args:`, args);

  const activeTab = args.cdpTargetId
    ? {
        id: "current",
        url: args.url || "",
        title: "",
        cdpTargetId: args.cdpTargetId,
        isActive: true,
      }
    : activeTabTracker.getActiveTab();

  logger.info(`[PageExtractor] Active tab info:`, activeTab);

  if (!activeTab) {
    logger.error(`[PageExtractor] No active tab found`);
    return {
      isError: true,
      message: "No active tab found. Please make sure you have a tab open.",
    };
  }

  logger.info(`Extracting content from: ${activeTab.url || "unknown URL"}`);

  try {
    logger.debug(
      `[PageExtractor] Attempting to connect to CDP with targetId: ${activeTab.cdpTargetId}, url: ${activeTab.url}`,
    );
    const connection = await cdpConnector.connect(
      activeTab.cdpTargetId,
      activeTab.url,
    );
    logger.info(`[PageExtractor] Successfully connected to CDP`);

    const extractor = new EnhancedExtractor();
    const extractedPage = await extractor.extract(connection);

    if (!extractedPage) {
      throw new ExtractionError(
        "Failed to extract content from the current page.",
      );
    }

    logger.debug(
      `[PageExtractor] Content extracted successfully, format: ${args.format}`,
    );

    await cdpConnector.disconnect(activeTab.cdpTargetId);
    return extractedPage;
  } catch (error) {
    logger.error("Error extracting page content:", error);
    return {
      isError: true,
      message: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}

export async function getPageSummary(
  args: z.infer<typeof getPageSummarySchema>,
  cdpConnector: CDPConnector,
): Promise<PageExtractionResult> {
  return getCurrentPageContent(
    {
      format: "summary",
      includeMetadata: args.includeMetadata,
      includeActions: false,
      cdpTargetId: args.cdpTargetId,
      url: args.url,
    },
    cdpConnector,
  );
}

export async function extractSpecificContent(
  args: z.infer<typeof extractSpecificContentSchema>,
  cdpConnector: CDPConnector,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const activeTab = args.cdpTargetId
    ? {
        id: "current",
        url: args.url || "",
        title: "",
        cdpTargetId: args.cdpTargetId,
        isActive: true,
      }
    : activeTabTracker.getActiveTab();

  if (!activeTab) {
    return {
      content: [
        {
          type: "text",
          text: "No active tab found. Please make sure you have a tab open.",
        },
      ],
      isError: true,
    };
  }

  try {
    const connection = await cdpConnector.connect(
      activeTab.cdpTargetId,
      activeTab.url,
    );
    const results: Record<string, string | null> = {};

    for (const selector of args.selectors) {
      try {
        const { result } = await connection.client.Runtime.evaluate({
          expression: `
            (() => {
              const element = document.querySelector('${selector.replace(/'/g, "\\'")}');
              return element ? element.textContent : null;
            })()
          `,
          returnByValue: true,
        });

        results[selector] = result.value as string | null;
      } catch (error) {
        logger.error(`Error extracting selector ${selector}:`, error);
        results[selector] = null;
      }
    }

    // Process results
    const formattedResults = Object.entries(results)
      .map(([selector, content]) => {
        return `Selector: ${selector}\n${content || "No content found"}`;
      })
      .join("\n\n---\n\n");

    await cdpConnector.disconnect(activeTab.cdpTargetId);

    return { content: [{ type: "text", text: formattedResults }] };
  } catch (error) {
    logger.error("Error extracting specific content:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}

export async function getPageActions(
  args: z.infer<typeof getPageActionsSchema>,
  cdpConnector: CDPConnector,
): Promise<{
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}> {
  const activeTab = args.cdpTargetId
    ? {
        id: "current",
        url: args.url || "",
        title: "",
        cdpTargetId: args.cdpTargetId,
        isActive: true,
      }
    : activeTabTracker.getActiveTab();

  if (!activeTab) {
    return {
      content: [
        {
          type: "text",
          text: "No active tab found. Please make sure you have a tab open.",
        },
      ],
      isError: true,
    };
  }

  try {
    const connection = await cdpConnector.connect(
      activeTab.cdpTargetId,
      activeTab.url,
    );
    const { DOM, Runtime } = connection.client;

    await DOM.enable();
    await Runtime.enable();

    const script = `
      (() => {
        const elements = {
          buttons: [],
          links: [],
          forms: [],
          inputs: []
        };
        
        // Find all buttons
        document.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]').forEach(el => {
          if (${args.includeDisabled} || !el.disabled) {
            elements.buttons.push({
              text: el.innerText || el.value || el.getAttribute('aria-label') || '',
              selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ').join('.') : el.tagName.toLowerCase()),
              disabled: el.disabled || false
            });
          }
        });
        
        // Find all links
        document.querySelectorAll('a[href]').forEach(el => {
          elements.links.push({
            text: el.innerText || el.getAttribute('aria-label') || '',
            href: el.href,
            selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ').join('.') : 'a')
          });
        });
        
        // Find all forms
        document.querySelectorAll('form').forEach(el => {
          elements.forms.push({
            action: el.action || 'No action',
            method: el.method || 'GET',
            selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ').join('.') : 'form')
          });
        });
        
        // Find all inputs
        document.querySelectorAll('input, textarea, select').forEach(el => {
          if (${args.includeDisabled} || !el.disabled) {
            elements.inputs.push({
              type: el.type || el.tagName.toLowerCase(),
              name: el.name || '',
              placeholder: el.placeholder || '',
              selector: el.id ? '#' + el.id : (el.className ? '.' + el.className.split(' ').join('.') : el.tagName.toLowerCase()),
              disabled: el.disabled || false
            });
          }
        });
        
        return elements;
      })()
    `;

    const result = await Runtime.evaluate({
      expression: script,
      returnByValue: true,
    });

    const elements = result.result.value;

    let content = "Interactive elements on the page:\n\n";

    if (args.groupByType) {
      if (elements.buttons.length > 0) {
        content += `BUTTONS (${elements.buttons.length}):\n`;
        elements.buttons.forEach((btn: any) => {
          content += `- "${btn.text}" (selector: ${btn.selector})${btn.disabled ? " [DISABLED]" : ""}\n`;
        });
        content += "\n";
      }

      if (elements.links.length > 0) {
        content += `LINKS (${elements.links.length}):\n`;
        elements.links.forEach((link: any) => {
          content += `- "${link.text}" -> ${link.href}\n`;
        });
        content += "\n";
      }

      if (elements.forms.length > 0) {
        content += `FORMS (${elements.forms.length}):\n`;
        elements.forms.forEach((form: any) => {
          content += `- ${form.method} to ${form.action} (selector: ${form.selector})\n`;
        });
        content += "\n";
      }

      if (elements.inputs.length > 0) {
        content += `INPUT FIELDS (${elements.inputs.length}):\n`;
        elements.inputs.forEach((input: any) => {
          content += `- ${input.type}${input.name ? ` [name="${input.name}"]` : ""}${input.placeholder ? ` (placeholder: "${input.placeholder}")` : ""}${input.disabled ? " [DISABLED]" : ""}\n`;
        });
      }
    } else {
      // List all elements without grouping
      const allElements = [
        ...elements.buttons.map((el: any) => ({
          ...el,
          elementType: "button",
        })),
        ...elements.links.map((el: any) => ({ ...el, elementType: "link" })),
        ...elements.forms.map((el: any) => ({ ...el, elementType: "form" })),
        ...elements.inputs.map((el: any) => ({ ...el, elementType: "input" })),
      ];

      content += `Found ${allElements.length} interactive elements:\n`;
      allElements.forEach((el: any) => {
        content += `- [${el.elementType.toUpperCase()}] `;
        if (el.text) content += `"${el.text}" `;
        if (el.href) content += `-> ${el.href} `;
        if (el.selector) content += `(${el.selector})`;
        if (el.disabled) content += " [DISABLED]";
        content += "\n";
      });
    }

    await cdpConnector.disconnect(activeTab.cdpTargetId);

    return { content: [{ type: "text", text: content }] };
  } catch (error) {
    logger.error("Error getting page actions:", error);
    return {
      content: [
        {
          type: "text",
          text: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      ],
      isError: true,
    };
  }
}
