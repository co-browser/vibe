import { ipcMain } from "electron";
import type { ChatMessage, IAgentProvider } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";
import { mainStore } from "@/store/store";
import { getTabContextOrchestrator } from "./tab-context";

const logger = createLogger("chat-messaging");

/**
 * Chat messaging handlers
 * Updated to use new AgentService architecture with event-based streaming
 */

// Global reference to the agent service instance
// This will be set by the main process during initialization
let agentServiceInstance: IAgentProvider | null = null;

/**
 * Set the agent service instance (called by main process)
 */
export function setAgentServiceInstance(service: IAgentProvider): void {
  agentServiceInstance = service;
}

/**
 * Get the current agent service instance
 */
function getAgentService(): IAgentProvider | null {
  return agentServiceInstance;
}

ipcMain.on("chat:send-message", async (event, message: string) => {
  const agentService = getAgentService();

  if (typeof message !== "string" || message.trim().length === 0) {
    logger.warn("Invalid message received");
    event.sender.send("chat:message", {
      type: "error",
      error: "Invalid message provided",
    });
    return;
  }

  if (!agentService) {
    logger.error("Agent service not available");
    event.sender.send("chat:message", {
      type: "error",
      error: "AgentService not initialized",
    });
    return;
  }

  // Check if agent service is ready
  const serviceStatus = agentService.getStatus();
  if (!serviceStatus.ready) {
    logger.error("Agent service not ready:", serviceStatus.serviceStatus);
    event.sender.send("chat:message", {
      type: "error",
      error: `AgentService not ready: ${serviceStatus.serviceStatus}`,
    });
    return;
  }

  // Get current chat history from shared store
  const currentState = mainStore.getState();
  const chatHistory = currentState.messages;

  logger.debug("Processing user message with chat history:", {
    messageLength: message.trim().length,
    historyCount: chatHistory.length,
  });

  // Process tab context (auto-includes current tab if no @ mentions)
  let processedMessage = message.trim();
  let systemPromptAddition = "";

  try {
    // Validate sender before using it
    if (!event.sender || event.sender.isDestroyed()) {
      logger.warn(
        "Invalid or destroyed sender, skipping tab context processing",
      );
      processedMessage = message.trim();
    } else {
      const orchestrator = getTabContextOrchestrator(event.sender.id);
      if (orchestrator) {
        // Process the prompt with tab context
        const tabResult = await orchestrator.processPromptWithTabContext(
          message.trim(),
          "You are a helpful AI assistant integrated with a web browser. You can access and analyze content from browser tabs when referenced with @aliases.",
          chatHistory,
        );

        // Always use the clean prompt (without @ mentions)
        processedMessage = tabResult.parsedPrompt.cleanPrompt;

        if (tabResult.includedTabs.length > 0) {
          // Extract properly formatted tab context from the orchestrator's messages
          const tabContextSystemMessage = tabResult.messages.find(
            msg =>
              msg.role === "system" && msg.content.includes("TAB CONTEXTS:"),
          );

          if (tabContextSystemMessage) {
            // Use the properly formatted system message content
            systemPromptAddition = "\n\n" + tabContextSystemMessage.content;
          }

          logger.info("Processed tab context", {
            extractedAliases: tabResult.parsedPrompt.extractedAliases,
            includedTabs: tabResult.includedTabs.length,
            errors: tabResult.errors,
            systemPromptAdditionLength: systemPromptAddition.length,
          });
        }

        // If there are errors (e.g., tab not found), include them in the system context
        if (tabResult.errors && tabResult.errors.length > 0) {
          const errorMessage =
            "\n\n[ERRORS: " + tabResult.errors.join("; ") + "]";
          systemPromptAddition = (systemPromptAddition || "") + errorMessage;

          logger.warn("Tab context errors", {
            errors: tabResult.errors,
            extractedAliases: tabResult.parsedPrompt.extractedAliases,
          });
        }

        // Send tab context info to renderer for UI feedback
        event.sender.send("chat:tab-context", {
          includedTabs: tabResult.includedTabs,
          errors: tabResult.errors,
        });
      }
    }
  } catch (error) {
    logger.error("Failed to process tab context:", error);
    // Continue with original message if tab processing fails
  }

  try {
    let partCount = 0;
    let accumulatedText = "";
    let accumulatedReasoning = "";
    let currentReasoningMessageId: string | null = null;

    // Create user message (show original message in UI)
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message.trim(),
      timestamp: new Date(),
    };

    // Add user message to local store (for immediate UI display)
    // Note: MCP manages conversation history for the agent, but UI needs local state for responsiveness
    mainStore.setState({
      messages: [...chatHistory, userMessage],
    });

    // Set up streaming event listener
    const streamHandler = (data: any) => {
      partCount++;

      if (event.sender.isDestroyed()) {
        logger.warn("Renderer destroyed, stopping stream handling");
        return;
      }

      // Handle different stream response types
      if (data.type === "text-delta" && "textDelta" in data) {
        // Accumulate text from streaming parts
        accumulatedText += data.textDelta;

        // Send incremental update to frontend for real-time display
        const assistantMessage: ChatMessage = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: accumulatedText,
          timestamp: new Date(),
          isStreaming: true,
        };
        event.sender.send("chat:message", assistantMessage);
      } else if (data.type === "tool-call") {
        // Send tool call information to frontend
        const toolCallMessage: ChatMessage = {
          id: `tool-call-${Date.now()}`,
          role: "assistant",
          content: `Using ${data.toolName}...`,
          timestamp: new Date(),
          parts: [
            {
              type: "tool-invocation",
              tool_name: data.toolName,
              args: data.toolArgs,
            },
          ] as any,
        };
        event.sender.send("chat:message", toolCallMessage);

        // Track tool usage in Umami
        if (!event.sender.isDestroyed()) {
          try {
            // Validate tool name exists
            if (!data.toolName || typeof data.toolName !== "string") {
              logger.warn("Invalid tool name for tracking:", data.toolName);
              return;
            }

            // Create sanitized event name (professional naming convention)
            const sanitizedToolName = data.toolName
              .replace(/[^a-zA-Z0-9-_]/g, "-")
              .toLowerCase()
              .replace(/^-+|-+$/g, "") // Remove leading/trailing dashes
              .replace(/-+/g, "-"); // Collapse multiple dashes

            const eventName = `tool-${sanitizedToolName}`;

            // Serialize parameters to avoid injection risks
            const trackingData = JSON.stringify({
              eventName,
              timestamp: Date.now(),
            });

            event.sender
              .executeJavaScript(
                `
                (function() {
                  const toolTrackingData = ${trackingData};
                  if (window.umami && typeof window.umami.track === 'function') {
                    window.umami.track(toolTrackingData.eventName, {
                      timestamp: toolTrackingData.timestamp
                    });
                  }
                })();
                `,
              )
              .catch(err => {
                logger.error("Failed to track tool usage:", {
                  toolName: data.toolName,
                  eventName,
                  error: err.message,
                });
              });
          } catch (trackingError) {
            logger.error("Tool tracking error:", {
              toolName: data.toolName,
              error:
                trackingError instanceof Error
                  ? trackingError.message
                  : String(trackingError),
            });
          }
        }
      } else if (data.type === "observation") {
        // Send observation information to frontend
        const observationMessage: ChatMessage = {
          id: `observation-${Date.now()}`,
          role: "assistant",
          content: data.content,
          timestamp: new Date(),
          parts: [
            {
              type: "observation",
              text: data.content,
              tool_call_id: data.toolCallId,
              tool_name: data.toolName,
            },
          ] as any,
        };
        event.sender.send("chat:message", observationMessage);
      } else if (data.type === "progress" && data.stage === "thinking") {
        // Accumulate reasoning text and send incremental updates
        accumulatedReasoning += data.message || "";

        if (!currentReasoningMessageId) {
          currentReasoningMessageId = `reasoning-${Date.now()}`;
        }

        const reasoningMessage: ChatMessage = {
          id: currentReasoningMessageId,
          role: "assistant",
          content: "", // Empty content since reasoning is in parts
          timestamp: new Date(),
          parts: [
            {
              type: "reasoning",
              text: accumulatedReasoning,
            },
          ] as any,
          isStreaming: true,
        };
        event.sender.send("chat:message", reasoningMessage);
      } else if (data.type === "done" || data.type === "error") {
        // Stream completed or errored
        logger.info(`Stream completed (${partCount} parts)`);

        // Track agent response completion
        if (!event.sender.isDestroyed()) {
          // Serialize parameters to avoid injection risks
          const responseTrackingData = JSON.stringify({
            eventName: "agent-response-received",
            responseLength: accumulatedText.length,
            hasReasoning: accumulatedReasoning.trim().length > 0,
            partCount: partCount,
            timestamp: Date.now(),
          });

          event.sender
            .executeJavaScript(
              `
            (function() {
              const responseData = ${responseTrackingData};
              if (window.umami && typeof window.umami.track === 'function') {
                window.umami.track(responseData.eventName, {
                  responseLength: responseData.responseLength,
                  hasReasoning: responseData.hasReasoning,
                  partCount: responseData.partCount,
                  timestamp: responseData.timestamp
                });
              }
            })();
          `,
            )
            .catch(err => {
              logger.error("Failed to track agent response", {
                error: err.message,
              });
            });
        }

        // Create final combined message with reasoning and response parts
        if (
          !event.sender.isDestroyed() &&
          (accumulatedText.trim() || accumulatedReasoning.trim())
        ) {
          const finalParts: any[] = [];

          // Add reasoning part if we have reasoning text
          if (accumulatedReasoning.trim()) {
            finalParts.push({
              type: "reasoning",
              text: accumulatedReasoning.trim(),
            });
          }

          // Add response text part if we have response text
          if (accumulatedText.trim()) {
            finalParts.push({
              type: "text",
              text: accumulatedText.trim(),
            });
          }

          if (data.type === "done" && finalParts.length > 0) {
            const finalMessage: ChatMessage = {
              id: `assistant-final-${Date.now()}`,
              role: "assistant",
              content: accumulatedText.trim(), // Keep content for backward compatibility
              timestamp: new Date(),
              isStreaming: false,
              parts: finalParts,
            };

            // Update the store for persistence
            const updatedState = mainStore.getState();
            mainStore.setState({
              messages: [...updatedState.messages, finalMessage],
            });

            // Send the final combined message to frontend
            event.sender.send("chat:message", finalMessage);

            const finalState = mainStore.getState();
            logger.info(
              "Local chat history now contains:",
              finalState.messages.length,
              "messages (MCP maintains authoritative conversation state for agent)",
            );
          } else if (data.type === "error") {
            // Handle error response
            if (!event.sender.isDestroyed()) {
              event.sender.send("chat:message", {
                type: "error",
                error: data.error || "Stream processing error",
              });
            }
          }
        }

        // Clean up event listener
        agentService.removeListener("message-stream", streamHandler);
      }
    };

    // Set up stream listener before sending message
    agentService.on("message-stream", streamHandler);

    // Send message to agent service
    // Use the exact format that the ReAct system prompt expects for tab content
    let messageToSend = processedMessage;

    if (systemPromptAddition) {
      // The ReAct system prompt expects tab content in a specific format within the user message
      // Extract just the formatted tab content (without the "TAB CONTEXTS:" prefix)
      const formattedTabContent = systemPromptAddition.replace(
        /^[\s\n]*TAB CONTEXTS:[^\n]*\n+/,
        "",
      );

      // Combine user question with tab content in the format expected by system prompt
      messageToSend = `${processedMessage}

${formattedTabContent}`;
    }

    await agentService.sendMessage(messageToSend);
  } catch (error) {
    logger.error("Chat processing error:", error);
    if (!event.sender.isDestroyed()) {
      event.sender.send("chat:message", {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
});
