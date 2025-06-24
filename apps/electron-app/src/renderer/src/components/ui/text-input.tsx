import React, { KeyboardEvent, useEffect, useRef } from "react";

interface TextInputProps {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => boolean | void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  rows?: number;
  className?: string;
}

export const TextInput: React.FC<TextInputProps> = ({
  value,
  onChange,
  onEnter,
  onKeyDown,
  placeholder = "Type here...",
  disabled = false,
  autoFocus = false,
  rows = 1,
  className = "",
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    // Allow parent to intercept keyboard events
    if (onKeyDown) {
      const handled = onKeyDown(event);
      if (handled === true) {
        return; // Parent handled the event, skip default behavior
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onEnter?.();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
    onChange(e.target.value);
    autoResize();
  };

  const autoResize = (): void => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight;

    const computedStyle = window.getComputedStyle(textarea);
    const maxHeight = parseInt(computedStyle.maxHeight, 10);

    if (maxHeight && scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
    } else {
      textarea.style.height = `${scrollHeight}px`;
    }
  };

  useEffect(() => {
    autoResize();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      rows={rows}
      className={`text-input ${className}`}
      style={{ resize: "none", overflow: "hidden" }}
    />
  );
};
