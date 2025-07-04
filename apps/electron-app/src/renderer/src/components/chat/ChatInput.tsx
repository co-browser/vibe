import React, { useState, useCallback } from "react";
import { TextInput } from "@/components/ui/text-input";
import { ActionButton } from "@/components/ui/action-button";
import { StatusPill } from "@/components/ui/status-pill";
import { TabContextDisplay } from "@/components/ui/tab-context-display";
import { GmailAuthButton } from "@/components/auth/GmailAuthButton";
import { PrivyAuthButton } from "@/components/auth/PrivyAuthButton";
import { OpenAIKeyButton } from "@/components/auth/OpenAIKeyButton";
import { TabAliasSuggestions } from "./TabAliasSuggestions";
import { TabContextBar } from "./TabContextBar";
import { useTabContext } from "@/hooks/useTabContextUtils";
import { useTabAliases } from "@/hooks/useTabAliases";
import { useAgentStatus } from "@/hooks/useAgentStatus";
import { TabContextItem } from "@/types/tabContext";
import "@/components/styles/TabAliasSuggestions.css";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  isSending: boolean;
  disabled?: boolean;
  tabContext: TabContextItem[];
}

export const ChatInput: React.FC<ChatInputProps> = ({
  value,
  onChange,
  onSend,
  onStop,
  isSending,
  disabled = false,
  tabContext,
}) => {
  // Import useAgentStatus to get hasApiKey status
  const { hasApiKey } = useAgentStatus();

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

  const { getSuggestions } = useTabAliases();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [currentSuggestions, setCurrentSuggestions] = useState<any[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<
    Array<{
      tabKey: string;
      alias: string;
      title: string;
      url: string;
      favicon?: string;
    }>
  >([]);

  // Handle input changes and detect @ mentions
  const handleInputChange = useCallback(
    (newValue: string) => {
      onChange(newValue);

      // Check if we should show suggestions
      const lastAtIndex = newValue.lastIndexOf("@");
      console.log("[ChatInput] Input changed:", {
        newValue,
        lastAtIndex,
        isAtEnd: lastAtIndex === newValue.length - 1,
      });

      if (lastAtIndex !== -1 && lastAtIndex === newValue.length - 1) {
        // Just typed @, show all suggestions
        const suggestions = getSuggestions("");
        console.log("[ChatInput] Just typed @, suggestions:", suggestions);
        setCurrentSuggestions(suggestions);
        setShowSuggestions(true);
      } else if (lastAtIndex !== -1) {
        // Check if we're in the middle of typing an alias
        const textAfterAt = newValue.substring(lastAtIndex + 1);
        const spaceIndex = textAfterAt.indexOf(" ");

        if (spaceIndex === -1) {
          // Still typing the alias
          const suggestions = getSuggestions(textAfterAt);
          console.log("[ChatInput] Typing after @:", {
            textAfterAt,
            suggestions,
          });
          setCurrentSuggestions(suggestions);
          setShowSuggestions(suggestions.length > 0);
        } else {
          setShowSuggestions(false);
        }
      } else {
        setShowSuggestions(false);
      }

      // Log using state setter pattern to avoid dependency
      setShowSuggestions(prevShow => {
        setCurrentSuggestions(prevSuggestions => {
          console.log("[ChatInput] State after change:", {
            showSuggestions: prevShow,
            suggestionsCount: prevSuggestions.length,
          });
          return prevSuggestions;
        });
        return prevShow;
      });
    },
    [onChange, getSuggestions],
  );

  // Memoize a stable reference for getting current value
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback(
    (alias: string) => {
      // Use functional updates to avoid dependencies
      setCurrentSuggestions(prevSuggestions => {
        const suggestion = prevSuggestions.find(s => s.alias === alias);
        if (suggestion) {
          setSelectedTabs(prevSelected => {
            // Check if tab is already selected
            const isAlreadySelected = prevSelected.some(
              t => t.tabKey === suggestion.tabKey,
            );
            if (!isAlreadySelected) {
              return [
                ...prevSelected,
                {
                  tabKey: suggestion.tabKey,
                  alias: suggestion.alias,
                  title: suggestion.title,
                  url: suggestion.url,
                  favicon: suggestion.favicon,
                },
              ];
            }
            return prevSelected;
          });
        }
        return prevSuggestions;
      });

      // Remove the @ from input using ref to avoid dependency
      const currentValue = valueRef.current;
      const lastAtIndex = currentValue.lastIndexOf("@");
      if (lastAtIndex !== -1) {
        const beforeAt = currentValue.substring(0, lastAtIndex);
        onChange(beforeAt);
      }

      setShowSuggestions(false);
    },
    [onChange],
  );

  const handleAction = (): void => {
    if (isSending) {
      onStop();
    } else {
      // Add selected tabs to the message before sending
      if (selectedTabs.length > 0) {
        const tabMentions = selectedTabs.map(t => `@${t.alias}`).join(" ");
        const messageWithTabs = value.trim()
          ? `${value} ${tabMentions}`
          : tabMentions;
        onChange(messageWithTabs);
        // Clear selected tabs after adding to message
        setSelectedTabs([]);
        // Use setTimeout to ensure the onChange propagates before sending
        setTimeout(() => onSend(), 0);
      } else {
        onSend();
      }
    }
  };

  const canSend =
    !disabled && (value.trim().length > 0 || selectedTabs.length > 0);
  const buttonDisabled = !isSending && !canSend;
  const characterCount = value.length;
  const showCharacterCount = characterCount > 500;

  return (
    <div className="chat-input-container">
      <div className="chat-input-status-section">
        <div className="chat-input-status-left">
          <StatusPill
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
        <div style={{ display: "flex", gap: "6px" }}>
          <OpenAIKeyButton />
          <GmailAuthButton />
          <PrivyAuthButton />
        </div>
      </div>
      {selectedTabs.length > 0 && (
        <TabContextBar
          tabs={selectedTabs}
          isCurrentTabAuto={false}
          editable={true}
          onRemoveTab={tabKey => {
            setSelectedTabs(selectedTabs.filter(t => t.tabKey !== tabKey));
          }}
        />
      )}

      <div
        className="chat-input-field-section"
        style={{ position: "relative" }}
      >
        <TabAliasSuggestions
          suggestions={currentSuggestions}
          onSelect={handleSuggestionSelect}
          show={showSuggestions}
        />
        <TextInput
          value={value}
          onChange={handleInputChange}
          onEnter={handleAction}
          onKeyDown={event => {
            if (showSuggestions && event.key === "Escape") {
              event.preventDefault();
              setShowSuggestions(false);
              return true;
            }
            return false;
          }}
          placeholder={
            !hasApiKey
              ? "OpenAI API key required to use chat"
              : "Type @ to reference tabs"
          }
          disabled={disabled}
          autoFocus={!disabled}
          rows={1}
          className="chat-input-field"
        />
        {showCharacterCount && (
          <span className="character-count">{characterCount}</span>
        )}
        <ActionButton
          variant={isSending ? "stop" : "send"}
          onClick={handleAction}
          disabled={buttonDisabled}
          className="chat-action-button"
        />
      </div>
    </div>
  );
};
