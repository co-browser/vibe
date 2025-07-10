import React, { useEffect, useRef, useCallback, memo, useMemo } from "react";
import ReactDOM from "react-dom";
import { FixedSizeList as List } from "react-window";
import "./OmniboxDropdown.css";

interface OmniboxSuggestion {
  id: string;
  type: string;
  text: string;
  url?: string;
  description?: string;
  iconType?: string;
}

interface OmniboxDropdownProps {
  suggestions: OmniboxSuggestion[];
  selectedIndex: number;
  isVisible: boolean;
  onSuggestionClick: (suggestion: OmniboxSuggestion) => void;
  onDeleteHistory?: (suggestionId: string) => void;
  omnibarRef: React.RefObject<HTMLInputElement | null>;
}

// Memoized icon mapping for better performance
const getIcon = (iconType?: string) => {
  switch (iconType) {
    case "search":
      return "🔍";
    case "clock":
      return "🕐";
    case "global":
      return "🌐";
    case "link":
      return "🔗";
    case "robot":
      return "🤖";
    default:
      return "📄";
  }
};

// Helper to format URLs for display (domain + clipped path, no query params)
function formatUrlForDisplay(url?: string): string {
  if (!url) return "";
  try {
    const urlObj = new URL(url);
    let display = urlObj.hostname.replace(/^www\./, "");
    if (urlObj.pathname && urlObj.pathname !== "/") {
      let path = urlObj.pathname;
      if (path.length > 30) path = "/..." + path.slice(-25);
      display += path;
    }
    return display;
  } catch {
    // Not a valid URL, fallback to smart clipping
    if (url.length > 40) return url.slice(0, 18) + "..." + url.slice(-18);
    return url;
  }
}

// Define the Row component for virtualized list - optimized
const Row = memo(
  ({
    index,
    style,
    data,
  }: {
    index: number;
    style: React.CSSProperties;
    data: {
      suggestions: OmniboxSuggestion[];
      selectedIndex: number;
      handleSuggestionClick: (suggestion: OmniboxSuggestion) => void;
      handleDeleteClick: (e: React.MouseEvent, suggestionId: string) => void;
    };
  }) => {
    const {
      suggestions,
      selectedIndex,
      handleSuggestionClick,
      handleDeleteClick,
    } = data;
    const suggestion = suggestions[index];
    if (!suggestion) return null;
    const isSelected = index === selectedIndex;
    return (
      <div
        className={`suggestion-item${isSelected ? " selected" : ""}`}
        style={style}
        onClick={() => handleSuggestionClick(suggestion)}
      >
        <span className="suggestion-icon">{getIcon(suggestion.iconType)}</span>
        <div className="suggestion-content">
          <div className="suggestion-text">
            {suggestion.type === "url" || suggestion.type === "history"
              ? formatUrlForDisplay(suggestion.url || suggestion.text)
              : suggestion.text.length > 60
                ? suggestion.text.slice(0, 40) +
                  "..." +
                  suggestion.text.slice(-15)
                : suggestion.text}
          </div>
          {suggestion.description && (
            <div className="suggestion-description">
              {suggestion.description}
            </div>
          )}
        </div>
        {suggestion.type === "history" && (
          <button
            className="delete-button"
            onClick={e => handleDeleteClick(e, suggestion.id)}
            title="Remove from history"
          >
            🗑️
          </button>
        )}
      </div>
    );
  },
);
Row.displayName = "SuggestionRow";

// Custom outer element for react-window List to make the container click-through
const PointerEventsNoneDiv = React.forwardRef<
  HTMLDivElement,
  React.HTMLProps<HTMLDivElement>
>((props, ref) => (
  <div ref={ref} {...props} style={{ ...props.style, pointerEvents: "none" }} />
));

const OmniboxDropdown: React.FC<OmniboxDropdownProps> = memo(
  ({
    suggestions,
    selectedIndex,
    isVisible,
    onSuggestionClick,
    onDeleteHistory,
    omnibarRef,
  }) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const updatePosition = useCallback(() => {
      if (!omnibarRef.current || !dropdownRef.current) return;
      const omnibar = omnibarRef.current;
      const dropdown = dropdownRef.current;
      const omnibarRect = omnibar.getBoundingClientRect();
      dropdown.style.setProperty("--omnibar-left", `${omnibarRect.left}px`);
      dropdown.style.setProperty(
        "--omnibar-bottom",
        `${omnibarRect.bottom + 4}px`,
      );
      dropdown.style.setProperty("--omnibar-width", `${omnibarRect.width}px`);
    }, [omnibarRef]);
    useEffect(() => {
      if (!isVisible) return;
      updatePosition();
      const handleResize = () => {
        if (isVisible) updatePosition();
      };
      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }, [isVisible, updatePosition]);
    const handleSuggestionClick = useCallback(
      (suggestion: OmniboxSuggestion) => {
        onSuggestionClick(suggestion);
      },
      [onSuggestionClick],
    );
    const handleDeleteClick = useCallback(
      (e: React.MouseEvent, suggestionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        onDeleteHistory?.(suggestionId);
      },
      [onDeleteHistory],
    );
    const itemData = useMemo(
      () => ({
        suggestions,
        selectedIndex,
        handleSuggestionClick,
        handleDeleteClick,
      }),
      [suggestions, selectedIndex, handleSuggestionClick, handleDeleteClick],
    );
    if (!isVisible) return null;
    const ITEM_HEIGHT = 44;
    const omnibarRect = omnibarRef.current?.getBoundingClientRect();

    // Only render if omnibarRect is available, has a valid width, and there are suggestions
    if (
      !omnibarRect ||
      !omnibarRect.width ||
      omnibarRect.width < 10 ||
      suggestions.length === 0
    ) {
      return null;
    }

    // Set CSS variables for positioning only when omnibarRect is valid
    const dropdownStyle: React.CSSProperties = {
      overflow: "visible",
      left: `${omnibarRect.left}px`,
      top: `${omnibarRect.bottom + 4}px`,
      width: `${omnibarRect.width}px`,
      maxWidth: "100vw",
      maxHeight: `${Math.min(suggestions.length * ITEM_HEIGHT, 400)}px`,
      position: "fixed",
      zIndex: 2147483647,
      background: "#fff",
      border: "1px solid var(--nav-border, #d1d5db)",
      borderRadius: 4,
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
      isolation: "isolate",
      pointerEvents: "none",
      padding: 0,
      margin: 0,
    };

    return ReactDOM.createPortal(
      <div
        ref={dropdownRef}
        id="omnibox-dropdown-debug"
        className="omnibox-dropdown"
        style={dropdownStyle}
        onMouseDown={e => e.preventDefault()}
      >
        <List
          height={Math.min(suggestions.length * ITEM_HEIGHT, 400)}
          itemCount={suggestions.length}
          itemSize={ITEM_HEIGHT}
          width={omnibarRect.width}
          itemData={itemData}
          style={{ background: "#fff", borderRadius: 4, pointerEvents: "auto" }}
          outerElementType={PointerEventsNoneDiv}
        >
          {Row}
        </List>
      </div>,
      document.body,
    );
  },
);
OmniboxDropdown.displayName = "OmniboxDropdown";
export default OmniboxDropdown;
