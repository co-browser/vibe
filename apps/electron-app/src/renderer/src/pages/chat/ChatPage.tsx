import React, { useEffect, useState, useCallback } from "react";
import type { Message as AiSDKMessage } from "@ai-sdk/react";
import { useAppStore } from "@/hooks/useStore";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { useChatInput } from "@/hooks/useChatInput";
import { useChatEvents } from "@/hooks/useChatEvents";
import { useChatRestore } from "@/hooks/useChatRestore";
import { useStreamingContent } from "@/hooks/useStreamingContent";
import { groupMessages } from "@/utils/messageGrouping";
import { Messages } from "@/components/chat/Messages";
import { ChatWelcome } from "@/components/chat/ChatWelcome";
import { AgentStatusIndicator } from "@/components/chat/StatusIndicator";
import { ChatInput } from "@/components/chat/ChatInput";
import { OnlineStatusStrip } from "@/components/ui/OnlineStatusStrip";
import { useContextMenu, ChatContextMenuItems } from "@/hooks/useContextMenu";

import "@/components/styles/ChatView.css";

export function ChatPage(): React.JSX.Element {
  const { tabContext } = useAppStore(state => ({
    tabContext: state.requestedTabContext,
  }));

  const [messages, setMessages] = useState<AiSDKMessage[]>([]);
  const { handleContextMenu } = useContextMenu();
  const { setStreamingContent, currentReasoningText, hasLiveReasoning } =
    useStreamingContent();

  const { isRestoreModeRef } = useChatRestore(setMessages);
  const {
    input,
    handleInputChange,
    sendMessage: sendMessageInput,
    stopGeneration,
    isSending,
    isAiGenerating,
    setIsAiGenerating,
  } = useChatInput(setMessages);

  // Pass streaming content setter to chat events
  useChatEvents(setMessages, setIsAiGenerating, setStreamingContent);
  const { isAgentInitializing } = useAgentStatus();

  const handleInputValueChange = useCallback(
    (value: string): void => {
      handleInputChange({
        target: { value },
      } as React.ChangeEvent<HTMLTextAreaElement>);
    },
    [handleInputChange],
  );

  // Listen for main process events to set input text (e.g., from tray menu)
  useEffect(() => {
    const handleSetInput = (_event: any, text: string) => {
      if (typeof text === "string") {
        handleInputChange({
          target: { value: text },
        } as React.ChangeEvent<HTMLTextAreaElement>);
      }
    };

    window.electron?.ipcRenderer.on("chat:set-input", handleSetInput);
    return () => {
      window.electron?.ipcRenderer.removeListener(
        "chat:set-input",
        handleSetInput,
      );
    };
  }, [handleInputChange]);

  useEffect(() => {
    // Track message updates for state management
  }, [messages, isRestoreModeRef]);

  const handleSend = (): void => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    sendMessageInput(trimmedInput);
  };

  const handleActionChipClick = (prompt: string): void => {
    sendMessageInput(prompt);
  };

  const handleEditMessage = (messageId: string, newContent: string): void => {
    const originalMessage = messages.find(msg => msg.id === messageId);
    if (!originalMessage) return;

    const originalContent =
      typeof originalMessage.content === "string"
        ? originalMessage.content
        : JSON.stringify(originalMessage.content);

    // Check if content actually changed
    if (originalContent.trim() === newContent.trim()) {
      return; // No changes, don't do anything
    }

    // Find the index of the edited message
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    // Remove all messages after the edited message (including assistant responses)
    const messagesUpToEdit = messages.slice(0, messageIndex);

    // Update the edited message content
    const updatedMessage = { ...originalMessage, content: newContent.trim() };
    const newMessages = [...messagesUpToEdit, updatedMessage];

    // Update messages state
    setMessages(newMessages);

    // Re-trigger the agent with the edited message
    setIsAiGenerating(true);
    window.vibe?.chat?.sendMessage?.(newContent.trim());
  };

  const groupedMessages = groupMessages(messages);
  const showWelcome = groupedMessages.length === 0 && !input;

  // Context menu items for chat
  const getChatContextMenuItems = () => [
    ChatContextMenuItems.clearChat,
    ChatContextMenuItems.exportChat,
    ChatContextMenuItems.separator,
    ChatContextMenuItems.regenerate,
  ];

  return (
    <div
      className="chat-container"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
      onContextMenu={handleContextMenu(getChatContextMenuItems())}
    >
      <AgentStatusIndicator isInitializing={isAgentInitializing} />

      <div className="chat-messages-container" style={{ flex: 1 }}>
        {showWelcome ? (
          <ChatWelcome onActionClick={handleActionChipClick} />
        ) : (
          <Messages
            groupedMessages={groupedMessages}
            isAiGenerating={isAiGenerating}
            streamingContent={{ currentReasoningText, hasLiveReasoning }}
            tabContext={tabContext}
            onEditMessage={handleEditMessage}
          />
        )}
      </div>

      <div className="chat-input-section">
        <ChatInput
          value={input}
          onChange={handleInputValueChange}
          onSend={handleSend}
          onStop={stopGeneration}
          isSending={isSending}
          tabContext={tabContext}
        />
        <OnlineStatusStrip />
      </div>
    </div>
  );
}
