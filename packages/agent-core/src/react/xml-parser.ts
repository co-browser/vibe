/**
 * ReAct XML Parser Utilities
 * Handles parsing of XML tags and tool calls in ReAct framework
 */

import type { ParsedReactToolCall } from "./types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("XmlParser");

let toolCallCounter = 0;
const sessionId = Date.now().toString(36); // Unique session identifier

export function extractXmlTagContent(
  xmlString: string,
  tagName: string,
): string | null {
  const safeTagName = String(tagName);
  const regex = new RegExp(
    "<" + safeTagName + ">([\\s\\S]*?)</" + safeTagName + ">",
    "i",
  );
  const match = xmlString.match(regex);
  return match && match[1] ? match[1].trim() : null;
}

export function parseReactToolCall(
  toolCallXmlContent: string,
): ParsedReactToolCall | null {
  try {
    logger.debug(
      `[ReAct XML Parser] Parsing tool call XML content: "${toolCallXmlContent}"`,
    );

    // Remove any trailing content after the closing brace
    const jsonMatch = toolCallXmlContent.match(/^(\{[\s\S]*\})/);
    if (!jsonMatch) {
      logger.error(
        "[ReAct XML Parser] No valid JSON object found in tool call content",
      );
      return null;
    }

    const cleanedContent = jsonMatch[1];
    const parsed = JSON.parse(cleanedContent);
    logger.debug(`[ReAct XML Parser] Parsed tool call:`, parsed);
    if (
      parsed &&
      typeof parsed.name === "string" &&
      typeof parsed.arguments === "object" &&
      parsed.arguments !== null // Ensure arguments is not null
    ) {
      // If ID is missing or not a string, generate a consistent one
      if (!parsed.id || typeof parsed.id !== "string") {
        toolCallCounter++;
        // Format: call_<session>_<counter> - ensures uniqueness and debuggability
        const generatedId = `call_${sessionId}_${String(toolCallCounter).padStart(3, "0")}`;
        logger.warn(
          `[ReAct XML Parser] Tool call missing ID, generated: ${generatedId} for tool: ${parsed.name}`,
        );
        parsed.id = generatedId;
      } else {
        // Log when agent provides its own ID format for monitoring
        if (!parsed.id.startsWith("call_")) {
          logger.debug(
            `Agent provided custom ID format: ${parsed.id} for tool: ${parsed.name}`,
          );
        }
      }

      return {
        id: parsed.id,
        name: parsed.name,
        arguments: parsed.arguments as Record<string, any>,
      };
    }
    logger.warn(
      "[ReAct XML Parser] Parsed tool call JSON does not match expected structure:",
      parsed,
    );
    return null;
  } catch (error) {
    logger.error(
      "[ReAct XML Parser] Error parsing tool call JSON:",
      error,
      "Raw content:",
      toolCallXmlContent,
    );
    return null;
  }
}
