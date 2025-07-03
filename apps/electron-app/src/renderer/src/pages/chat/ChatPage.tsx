import React, { useEffect, useState, useMemo } from "react";
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
import { Card, CardContent, CardHeader } from "@/components/ui/card";

import "@/components/styles/ChatView.css";

// A new component for the larger, colorful "gem" lights
function GemLight({
  color,
  label,
  isOn,
}: {
  color: string;
  label: string;
  isOn: boolean;
}) {
  const bezelStyle: React.CSSProperties = {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "linear-gradient(145deg, #888, #444)",
    boxShadow: "inset 1px 1px 2px #222, 1px 1px 4px #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const lightStyle: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: isOn ? color : "#333", // Dim color when off
    boxShadow: isOn ? `0 0 12px 2px ${color}A0` : "none", // No glow when off
    border: "1px solid #111",
    transition: "all 0.3s ease",
  };

  return (
    <div style={{ textAlign: "center", color: "#F5DEB3" }}>
      <div style={bezelStyle}>
        <div style={lightStyle} />
      </div>
      <div style={{ marginTop: "4px", fontSize: "8px" }}>{label}</div>
    </div>
  );
}

// A component for steampunk-style status lights
function SteampunkLight({ isOn, label }: { isOn: boolean; label: string }) {
  const bezelStyle: React.CSSProperties = {
    width: "22px",
    height: "22px",
    borderRadius: "50%",
    background: "linear-gradient(145deg, #B8860B, #8B4513)",
    boxShadow: "inset 1px 1px 2px #654321, 1px 1px 4px #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  const lightStyle: React.CSSProperties = {
    width: "12px",
    height: "12px",
    borderRadius: "50%",
    backgroundColor: isOn ? "#FFD700" : "#333",
    boxShadow: isOn ? "0 0 12px 2px #FFD700A0" : "none",
    border: "1px solid #111",
    transition: "all 0.3s ease",
  };

  return (
    <div style={{ textAlign: "center", color: "#F5DEB3" }}>
      <div style={bezelStyle}>
        <div style={lightStyle} />
      </div>
      <div style={{ marginTop: "4px", fontSize: "8px" }}>{label}</div>
    </div>
  );
}

// A component for the debug panel power switch
function PowerSwitch({
  isOn,
  onToggle,
}: {
  isOn: boolean;
  onToggle: () => void;
}) {
  const switchStyle: React.CSSProperties = {
    width: "22px",
    height: "22px",
    borderRadius: "2px",
    background: "linear-gradient(145deg, #B8860B, #8B4513)",
    boxShadow: "inset 1px 1px 2px #654321, 1px 1px 4px #000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "all 0.2s ease",
  };

  const switchInnerStyle: React.CSSProperties = {
    width: "14px",
    height: "14px",
    borderRadius: "1px",
    backgroundColor: isOn ? "#00FF00" : "#333",
    boxShadow: isOn ? "0 0 8px 1px #00FF00A0" : "none",
    border: "1px solid #111",
    transition: "all 0.2s ease",
    fontSize: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#000",
    fontWeight: "bold",
  };

  return (
    <div style={{ textAlign: "center", color: "#F5DEB3" }}>
      <div style={switchStyle} onClick={onToggle}>
        <div style={switchInnerStyle}>{isOn ? "I" : "O"}</div>
      </div>
      <div style={{ marginTop: "4px", fontSize: "8px" }}>PWR</div>
    </div>
  );
}

// A component for the blinking dots placeholder
function BlinkingDots() {
  const [dots, setDots] = useState(".");
  useEffect(() => {
    const interval = setInterval(() => {
      setDots(prev => (prev.length >= 3 ? "." : prev + "."));
    }, 600);
    return () => clearInterval(interval);
  }, []);

  return <span style={{ width: "12px", display: "inline-block" }}>{dots}</span>;
}

// The mini console view for live logs
function MiniConsole({ logs }: { logs: string[] }) {
  const consoleRef = React.useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [logs]);

  return (
    <div
      style={{
        borderTop: "1px solid #008B8B",
        marginTop: "5px",
        paddingTop: "5px",
      }}
    >
      {logs.length === 0 ? (
        <div
          style={{
            color: "#FFD700", // Changed to visible yellow/gold
            textAlign: "center",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
          }}
        >
          waiting for logs
          <BlinkingDots />
        </div>
      ) : (
        <pre
          ref={consoleRef}
          style={{
            height: "40px",
            overflow: "hidden",
            fontSize: "10px",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
            columnCount: 2,
            columnGap: "20px",
          }}
        >
          {logs.map((log, index) => (
            <div key={index}>{`> ${log}`}</div>
          ))}
        </pre>
      )}
    </div>
  );
}

// The main debug panel component
function DebugPanel() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editMode, setEditMode] = useState<{
    index: number;
    currentValue: string;
  } | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const settingsContainerRef = React.useRef<HTMLDivElement>(null);

  const { isAgentInitializing } = useAgentStatus();
  const DEBUG_MODE = import.meta.env.VITE_DEBUG_MODE === "true";

  const settingKeys = useMemo(
    () => [
      "openaiApiKey",
      "anthropicApiKey",
      "geminiApiKey",
      "perplexityApiKey",
      "llamaApiKey",
      "turbopufferApiKey",
      "theme",
      "language",
    ],
    [],
  );

  useEffect(() => {
    if (!DEBUG_MODE) return;
    const originalConsole = { ...console };
    const logToState = (type: string, args: any[]) => {
      const message = args
        .map(arg =>
          typeof arg === "object" ? JSON.stringify(arg) : String(arg),
        )
        .join(" ");
      setLogs(prevLogs => [...prevLogs.slice(-100), `[${type}] ${message}`]);
    };
    console.log = (...args) => {
      originalConsole.log(...args);
      logToState("LOG", args);
    };
    console.warn = (...args) => {
      originalConsole.warn(...args);
      logToState("WARN", args);
    };
    console.error = (...args) => {
      originalConsole.error(...args);
      logToState("ERROR", args);
    };
    return () => {
      Object.assign(console, originalConsole);
    };
  }, [DEBUG_MODE]);

  const fetchSettings = async () => {
    const allSettings = await window.vibe.settings.getAllUnmasked();
    setSettings(allSettings);
  };

  useEffect(() => {
    if (!DEBUG_MODE) return;
    fetchSettings();
    const unsubscribe = window.vibe.settings.onChange(fetchSettings);
    return () => unsubscribe();
  }, [DEBUG_MODE]);

  React.useLayoutEffect(() => {
    const el = settingsContainerRef.current;
    if (el) {
      setIsOverflowing(el.scrollHeight > el.clientHeight);
    }
  }, [settings]);

  useEffect(() => {
    if (!DEBUG_MODE) return;
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (editMode) {
        if (e.key === "Enter") {
          const keyToUpdate = settingKeys[editMode.index];
          await window.vibe.settings.set(keyToUpdate, editMode.currentValue);
          setEditMode(null);
          if (keyToUpdate === "openaiApiKey") {
            console.log("API key updated. Re-initializing agent...");
            await window.vibe.chat.initializeAgent(editMode.currentValue);
          }
        } else if (e.key === "Escape") {
          setEditMode(null);
        }
        return;
      }
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex(prev => Math.max(0, prev - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex(prev => Math.min(settingKeys.length - 1, prev + 1));
          break;
        case "Enter":
          e.preventDefault();
          setEditMode({
            index: selectedIndex,
            currentValue: String(settings[settingKeys[selectedIndex]] ?? ""),
          });
          break;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [DEBUG_MODE, settings, selectedIndex, editMode, settingKeys]);

  if (!DEBUG_MODE) return null;

  const terminalStyle: React.CSSProperties = {
    backgroundColor: "#2E4647",
    color: "#F5DEB3",
    fontFamily: "monospace",
    fontSize: "11px",
    border: "1px solid #008B8B",
    borderRadius: "0.5rem",
    height: "240px",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  };

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#314F4F",
    color: "#F5DEB3",
    fontFamily: "monospace",
    fontSize: "11px",
    border: "1px solid #008B8B",
    outline: "none",
    width: "100%",
    padding: "0 4px",
  };

  const agentIsOn = !isAgentInitializing;
  const mcpIsOn = false;

  return (
    <>
      <style>
        {`.no-scrollbar::-webkit-scrollbar { display: none; } .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }`}
        {`.woven-texture::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-image:
            linear-gradient(45deg, #F5DEB31A 25%, transparent 25%),
            linear-gradient(-45deg, #F5DEB31A 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #F5DEB31A 75%),
            linear-gradient(-45deg, transparent 75%, #F5DEB31A 75%);
          background-size: 4px 4px;
          z-index: 0;
          opacity: 0.2;
        }`}
      </style>
      <Card className="m-2 woven-texture" style={terminalStyle}>
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <CardHeader className="flex-row items-center justify-center p-2">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "2px 8px",
                flexWrap: "wrap",
                justifyContent: "center",
                maxWidth: "100%",
              }}
            >
              <GemLight
                color="#00FFFF"
                label="OPENAI"
                isOn={!!settings.openaiApiKey}
              />
              <GemLight
                color="#EE82EE"
                label="ANTHRPC"
                isOn={!!settings.anthropicApiKey}
              />
              <GemLight
                color="#FFFF00"
                label="GEMINI"
                isOn={!!settings.geminiApiKey}
              />
              <GemLight
                color="#FF6347"
                label="PRPLXTY"
                isOn={!!settings.perplexityApiKey}
              />
              <GemLight
                color="#9ACD32"
                label="LLAMA"
                isOn={!!settings.llamaApiKey}
              />
              <GemLight
                color="#FFFFFF"
                label="TRBOPFR"
                isOn={!!settings.turbopufferApiKey}
              />
              <span style={{ color: "#008B8B", margin: "0 3px" }}>|</span>
              <SteampunkLight isOn={agentIsOn} label="AGENT" />
              <SteampunkLight isOn={mcpIsOn} label="MCP" />
              <span style={{ color: "#008B8B", margin: "0 3px" }}>|</span>
              <PowerSwitch
                isOn={isPanelVisible}
                onToggle={() => setIsPanelVisible(!isPanelVisible)}
              />
            </div>
          </CardHeader>
          {isPanelVisible && (
            <CardContent
              className="pt-0 p-2"
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <div
                ref={settingsContainerRef}
                className="no-scrollbar"
                style={{ flex: 1, overflowY: "auto" }}
              >
                {settingKeys.map((key, index) => {
                  const isSelected = index === selectedIndex;
                  const isEditing = editMode?.index === index;
                  const value = settings[key];
                  return (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        backgroundColor: isSelected
                          ? "#008B8B40"
                          : "transparent",
                      }}
                    >
                      <span style={{ width: "150px", flexShrink: 0 }}>
                        {key}:
                      </span>
                      {isEditing ? (
                        <input
                          type="text"
                          autoFocus
                          style={inputStyle}
                          value={editMode.currentValue}
                          onChange={e =>
                            setEditMode({
                              ...editMode,
                              currentValue: e.target.value,
                            })
                          }
                          onBlur={() => setEditMode(null)}
                        />
                      ) : (
                        <span
                          style={{
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {value !== null && value !== undefined
                            ? String(value)
                            : "Not Set"}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              {isOverflowing && (
                <div
                  style={{
                    position: "absolute",
                    bottom: "5px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    color: "#8C7853",
                    fontSize: "14px",
                    pointerEvents: "none",
                  }}
                >
                  ▼
                </div>
              )}
            </CardContent>
          )}
          {isPanelVisible && <MiniConsole logs={logs} />}
        </div>
      </Card>
    </>
  );
}

export function ChatPage(): React.JSX.Element {
  const { tabContext } = useAppStore(state => ({
    tabContext: state.requestedTabContext,
  }));

  const [messages, setMessages] = useState<AiSDKMessage[]>([]);
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

  useEffect(() => {
    // Track message updates for state management
  }, [messages, isRestoreModeRef]);

  const handleSend = (): void => {
    const trimmedInput = input.trim();
    if (!trimmedInput) return;
    sendMessageInput(trimmedInput);
  };

  const handleInputValueChange = (value: string): void => {
    handleInputChange({
      target: { value },
    } as React.ChangeEvent<HTMLTextAreaElement>);
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

  return (
    <div
      className="chat-container"
      style={{ height: "100%", display: "flex", flexDirection: "column" }}
    >
      <DebugPanel />
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
      </div>
    </div>
  );
}
