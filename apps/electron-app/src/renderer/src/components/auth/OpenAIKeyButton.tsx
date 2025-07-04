import React, { useState, useEffect, useRef, useCallback } from "react";
import { Key, Eye, EyeOff, Check, X } from "lucide-react";
import { IconWithStatus } from "@/components/ui/icon-with-status";
import "../styles/OpenAIKeyPopup.css";

interface OpenAIKeyButtonProps {
  onKeyUpdate?: (hasKey: boolean) => void;
}

export const OpenAIKeyButton: React.FC<OpenAIKeyButtonProps> = ({
  onKeyUpdate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  const checkStoredKey = useCallback(async () => {
    try {
      const settings = await window.vibe.settings.getAll();
      const hasKey = !!settings.openaiApiKey;
      setHasStoredKey(hasKey);
      onKeyUpdate?.(hasKey);
    } catch (error) {
      console.error("Error checking OpenAI key:", error);
    }
  }, [onKeyUpdate]);

  useEffect(() => {
    checkStoredKey();
  }, [checkStoredKey]);

  // Handle click outside to close popup
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleSave = async () => {
    if (!apiKey.trim()) return;

    setIsLoading(true);
    setError(null);
    try {
      // Save the key to settings - the agent service will automatically pick up the change
      await window.vibe.settings.set("openaiApiKey", apiKey);

      // Try to create agent service if it doesn't exist
      try {
        await window.vibe.chat.initializeAgent();
      } catch (initError) {
        // Agent might already exist or will be created when needed
        console.debug("Agent initialization:", initError);
      }

      setHasStoredKey(true);
      setIsSaved(true);
      onKeyUpdate?.(true);

      setTimeout(() => {
        setIsOpen(false);
        setIsSaved(false);
        setApiKey("");
        setError(null);
      }, 1500);
    } catch (error) {
      console.error("Error saving OpenAI key:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to save API key. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleClear = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Clear the key from settings - the agent service will automatically pick up the change
      await window.vibe.settings.set("openaiApiKey", null);
      setHasStoredKey(false);
      setApiKey("");
      onKeyUpdate?.(false);
    } catch (error) {
      console.error("Error clearing OpenAI key:", error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to clear API key. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && apiKey.trim()) {
      handleSave();
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <>
      <div
        ref={buttonRef}
        className="inline-block"
        style={{ position: "relative" }}
      >
        <IconWithStatus
          status={hasStoredKey ? "connected" : "disconnected"}
          statusTitle={
            hasStoredKey ? "OpenAI API key configured" : "No OpenAI API key"
          }
          onClick={() => setIsOpen(!isOpen)}
          variant="openai"
          label="API Key"
        >
          <Key className="openai-icon" />
        </IconWithStatus>
      </div>

      {isOpen && (
        <div className="openai-key-popup-container">
          <div ref={popupRef} className="openai-key-popup stamped-card">
            <div className="openai-key-content">
              <div className="openai-key-header">
                <div className="openai-key-title-group">
                  <h3 className="openai-key-title">OpenAI API Key</h3>
                  <span
                    className={`openai-key-status-badge ${hasStoredKey ? "active" : "inactive"}`}
                  >
                    {hasStoredKey ? "Active" : "Inactive"}
                  </span>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="openai-key-close-button"
                >
                  <X className="openai-key-close-icon" />
                </button>
              </div>

              <div className="openai-key-form">
                <div className="openai-key-input-section">
                  {/* Removed the success message from here */}
                  {error && (
                    <div className="openai-key-error-message">{error}</div>
                  )}

                  <div className="openai-key-input-wrapper">
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={e => setApiKey(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Enter your OpenAI API key"
                      className="openai-key-input"
                      autoFocus
                    />
                    <button
                      type="button"
                      className="openai-key-toggle-visibility"
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? (
                        <EyeOff className="openai-key-toggle-icon" />
                      ) : (
                        <Eye className="openai-key-toggle-icon" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="openai-key-footer">
                  <p className="openai-key-help-text">
                    <a
                      href="https://platform.openai.com/api-keys"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="openai-key-link"
                    >
                      Get key →
                    </a>
                  </p>

                  <div className="openai-key-actions">
                    {hasStoredKey && (
                      <button
                        onClick={handleClear}
                        disabled={isLoading}
                        className="openai-key-button openai-key-button-secondary"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      onClick={handleSave}
                      disabled={!apiKey.trim() || isLoading}
                      className={`openai-key-button openai-key-button-primary ${isSaved ? "openai-key-button-success" : ""}`}
                    >
                      {isLoading ? (
                        <>
                          <span className="openai-key-spinner">⟳</span>
                          Saving
                        </>
                      ) : isSaved ? (
                        <>
                          <Check className="openai-key-button-icon" />
                          Saved
                        </>
                      ) : (
                        "Save"
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
