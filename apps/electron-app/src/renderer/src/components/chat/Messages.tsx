import React, { useState, useMemo } from "react";
import type { Message as AiSDKMessage } from "@ai-sdk/react";
import { useAutoScroll } from "../../hooks/useAutoScroll";
import { createMessageContentRenderer } from "../../utils/messageContentRenderer";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { TabContextDisplay } from "@/components/ui/tab-context-display";
import { GmailAuthButton } from "@/components/auth/GmailAuthButton";
import { useTabContext } from "@/hooks/useTabContextUtils";
import { TabContextItem } from "@/types/tabContext";
import { Edit3, Check, X } from "lucide-react";
import { TabReferencePill } from "./TabReferencePill";
import { useTabAliases } from "@/hooks/useTabAliases";
import { TabContextBar } from "./TabContextBar";

export interface GroupedMessage {
  id: string;
  userMessage: AiSDKMessage;
  assistantMessages: AiSDKMessage[];
}

interface MessagesProps {
  groupedMessages: GroupedMessage[];
  isAiGenerating: boolean;
  streamingContent?: {
    currentReasoningText: string;
    hasLiveReasoning: boolean;
  };
  tabContext?: TabContextItem[];
  onEditMessage?: (messageId: string, newContent: string) => void;
}

export const Messages: React.FC<MessagesProps> = ({
  groupedMessages,
  isAiGenerating,
  streamingContent,
  tabContext = [],
  onEditMessage,
}) => {
  const { currentReasoningText = "", hasLiveReasoning = false } =
    streamingContent || {};
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState<string>("");
  const { getSuggestions, parsePrompt } = useTabAliases();
  const [tabs, setTabs] = useState<any[]>([]);

  const { messagesEndRef, containerRef } = useAutoScroll([
    groupedMessages,
    currentReasoningText,
  ]);

  const renderMessageContent = createMessageContentRenderer(
    groupedMessages,
    isAiGenerating,
  );

  // Fetch tabs to check for current tab
  React.useEffect(() => {
    const fetchTabs = async () => {
      try {
        const allTabs =
          (await window.electron?.ipcRenderer.invoke("tabs:get-all")) || [];
        setTabs(allTabs);
      } catch (error) {
        console.error("Failed to fetch tabs:", error);
      }
    };

    fetchTabs();

    // Listen for tab updates
    const handleTabUpdate = () => {
      fetchTabs();
    };

    window.electron?.ipcRenderer.on("update-tab-state", handleTabUpdate);

    return () => {
      window.electron?.ipcRenderer.removeListener(
        "update-tab-state",
        handleTabUpdate,
      );
    };
  }, []);

  /**
   * Render message text with tab references as pills
   */
  const renderMessageWithTabPills = useMemo(() => {
    const allSuggestions = getSuggestions("");

    return (content: string) => {
      const parsed = parsePrompt(content);

      if (parsed.aliasPositions.length === 0) {
        return <>{content}</>;
      }

      const parts: React.ReactNode[] = [];
      let lastIndex = 0;

      parsed.aliasPositions.forEach((pos, idx) => {
        // Add text before this alias
        if (pos.start > lastIndex) {
          parts.push(
            <span key={`text-${idx}`}>
              {content.substring(lastIndex, pos.start)}
            </span>,
          );
        }

        // Find matching tab info
        const suggestion = allSuggestions.find(
          s => s.alias.toLowerCase() === pos.alias.toLowerCase(),
        );

        // Add the tab pill
        parts.push(
          <TabReferencePill
            key={`pill-${idx}`}
            alias={pos.alias}
            url={suggestion?.url}
            title={suggestion?.title}
          />,
        );

        lastIndex = pos.end;
      });

      // Add any remaining text
      if (lastIndex < content.length) {
        parts.push(<span key="text-end">{content.substring(lastIndex)}</span>);
      }

      return <>{parts}</>;
    };
  }, [getSuggestions, parsePrompt]);

  // Get tab context data for a message
  const getTabContextData = (messageContent: string) => {
    const parsed = parsePrompt(messageContent);
    const allSuggestions = getSuggestions("");
    const tabsData: Array<{
      favicon?: string;
      title: string;
      url: string;
      alias: string;
      tabKey?: string;
    }> = [];
    let isCurrentTabAuto = false;

    // Check if message has @mentions
    if (parsed.extractedAliases.length > 0) {
      parsed.extractedAliases.forEach(alias => {
        const suggestion = allSuggestions.find(
          s => s.alias.toLowerCase() === alias.toLowerCase(),
        );
        if (suggestion) {
          const tab = tabs.find((t: any) => t.key === suggestion.tabKey);
          tabsData.push({
            favicon: tab?.favicon,
            title: suggestion.title,
            url: suggestion.url,
            alias: suggestion.alias,
            tabKey: suggestion.tabKey,
          });
        }
      });
    } else {
      // No @mentions - check if current tab was auto-included
      const currentTab = tabs.find((tab: any) => tab.visible);
      if (currentTab && messageContent.trim().length > 0) {
        const alias =
          allSuggestions.find(s => s.tabKey === currentTab.key)?.alias ||
          currentTab.url?.replace(/^https?:\/\/(www\.)?/, "").split("/")[0] ||
          "current";
        tabsData.push({
          favicon: currentTab.favicon,
          title: currentTab.title || "Untitled",
          url: currentTab.url || "",
          alias: alias,
          tabKey: currentTab.key,
        });
        isCurrentTabAuto = true;
      }
    }

    return { tabs: tabsData, isCurrentTabAuto };
  };

  const {
    globalStatus,
    globalStatusTitle,
    shouldShowStatus,
    sharedLoadingEntry,
    completedTabs,
    regularTabs,
    hasMoreTabs,
    moreTabsCount,
  } = useTabContext(tabContext);

  const handleEditStart = (message: AiSDKMessage) => {
    setEditingMessageId(message.id);
    setEditContent(
      typeof message.content === "string"
        ? message.content
        : JSON.stringify(message.content),
    );
  };

  const handleEditSave = (messageId: string) => {
    if (onEditMessage && editContent.trim()) {
      onEditMessage(messageId, editContent.trim());
    }
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleEditCancel = () => {
    setEditingMessageId(null);
    setEditContent("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, messageId: string) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleEditSave(messageId);
    } else if (e.key === "Escape") {
      handleEditCancel();
    }
  };

  return (
    <>
      <div className="space-y-6" ref={containerRef}>
        {groupedMessages.map((group, index) => {
          const isLatestGroup = index === groupedMessages.length - 1;
          const isEditing = editingMessageId === group.userMessage.id;

          return (
            <div key={group.id} className="message-group">
              <div className="user-message">
                <div className="user-message-bubble">
                  <div className="user-message-status-section">
                    <div className="user-message-status-left">
                      <StatusIndicator
                        status={globalStatus}
                        title={globalStatusTitle}
                        show={shouldShowStatus}
                      />
                      <TabContextDisplay
                        sharedLoadingEntry={sharedLoadingEntry}
                        completedTabs={completedTabs}
                        regularTabs={regularTabs}
                        hasMoreTabs={hasMoreTabs}
                        moreTabsCount={moreTabsCount}
                      />
                    </div>
                    <div className="user-message-actions">
                      {isEditing ? (
                        <>
                          <button
                            className="message-edit-button save"
                            onClick={() => handleEditSave(group.userMessage.id)}
                            title="Save changes"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            className="message-edit-button cancel"
                            onClick={handleEditCancel}
                            title="Cancel editing"
                          >
                            <X size={14} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            className="message-edit-button edit"
                            onClick={() => handleEditStart(group.userMessage)}
                            title="Edit message"
                          >
                            <Edit3 size={14} />
                          </button>
                          <GmailAuthButton />
                        </>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const tabContextData = getTabContextData(
                      typeof group.userMessage.content === "string"
                        ? group.userMessage.content
                        : "",
                    );
                    return tabContextData.tabs.length > 0 ? (
                      <TabContextBar
                        tabs={tabContextData.tabs}
                        isCurrentTabAuto={tabContextData.isCurrentTabAuto}
                      />
                    ) : null;
                  })()}
                  <div className="user-message-content">
                    {isEditing ? (
                      <textarea
                        className="user-message-edit-field"
                        value={editContent}
                        onChange={e => setEditContent(e.target.value)}
                        onKeyDown={e => handleKeyDown(e, group.userMessage.id)}
                        autoFocus
                        rows={2}
                      />
                    ) : (
                      <span className="user-message-text">
                        {typeof group.userMessage.content === "string"
                          ? renderMessageWithTabPills(group.userMessage.content)
                          : JSON.stringify(group.userMessage.content)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {group.assistantMessages.length > 0 && (
                <div className="assistant-messages">
                  {group.assistantMessages.map((aiMsg, msgIndex) => {
                    const isLatestMessage =
                      isLatestGroup &&
                      msgIndex === group.assistantMessages.length - 1;

                    if (
                      aiMsg.id.startsWith("agent-progress-") &&
                      msgIndex > 0 &&
                      group.assistantMessages
                        .slice(0, msgIndex)
                        .some(m => m.id.startsWith("agent-progress-"))
                    ) {
                      return null;
                    }

                    return (
                      <div key={aiMsg.id} className="assistant-message">
                        <div className="assistant-message-content">
                          {renderMessageContent(
                            aiMsg,
                            isLatestMessage,
                            group.assistantMessages,
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {isAiGenerating && hasLiveReasoning && currentReasoningText && (
        <div className="message-group">
          <div className="assistant-messages">
            <div className="assistant-message">
              <div className="assistant-message-content">
                <div className="text-sm text-gray-600 italic">
                  {currentReasoningText}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </>
  );
};
