import React from "react";
import { TextInput } from "@/components/ui/text-input";
import { ActionButton } from "@/components/ui/action-button";
import { StatusIndicator } from "@/components/ui/status-indicator";
import { TabContextDisplay } from "@/components/ui/tab-context-display";
import { GmailAuthButton } from "@/components/auth/GmailAuthButton";
import { PrivyAuthButton } from "@/components/auth/PrivyAuthButton";
import { useTabContext } from "@/hooks/useTabContextUtils";
import { TabContextItem } from "@/types/tabContext";

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

  const handleAction = (): void => {
    if (isSending) {
      onStop();
    } else {
      onSend();
    }
  };

  const canSend = !disabled && value.trim().length > 0;
  const buttonDisabled = !isSending && !canSend;

  return (
    <div className="chat-input-container">
      <div className="chat-input-status-section">
        <div className="chat-input-status-left">
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
        <div style={{ display: "flex", gap: "6px" }}>
          <GmailAuthButton />
          <PrivyAuthButton />
        </div>
      </div>

      <div className="chat-input-field-section">
        <TextInput
          value={value}
          onChange={onChange}
          onEnter={handleAction}
          placeholder="Summarize, analyze and act on anything"
          disabled={disabled}
          autoFocus
          rows={1}
          className="chat-input-field"
        />
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
