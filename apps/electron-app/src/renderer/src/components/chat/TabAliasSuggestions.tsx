import React, { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";

interface TabAliasSuggestion {
  alias: string;
  tabKey: string;
  title: string;
  url: string;
  favicon?: string;
  status?: "active" | "loading" | "error";
}

interface TabAliasSuggestionsProps {
  suggestions: TabAliasSuggestion[];
  onSelect: (alias: string) => void;
  show: boolean;
  searchTerm?: string;
  loading?: boolean;
  onClose?: () => void;
}

export const TabAliasSuggestions: React.FC<TabAliasSuggestionsProps> = ({
  suggestions,
  onSelect,
  show,
  searchTerm = "",
  loading = false,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!show) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle events if the suggestions dropdown is visible
      if (
        !containerRef.current?.contains(document.activeElement) &&
        !document.activeElement?.closest(".chat-input-field")
      ) {
        return;
      }

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0,
          );
          break;
        case "ArrowUp":
          e.preventDefault();
          e.stopPropagation();
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1,
          );
          break;
        case "Enter":
        case "Tab":
          e.preventDefault();
          e.stopPropagation();
          if (suggestions[selectedIndex]) {
            onSelect(suggestions[selectedIndex].alias);
          }
          break;
        case "Escape":
          // Escape is handled by the parent component
          break;
      }
    };

    // Use capture phase to intercept events before other handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [show, suggestions, selectedIndex, onSelect]);

  // Scroll selected item into view
  useEffect(() => {
    if (itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    }
  }, [selectedIndex]);

  // Highlight matching text
  const highlightText = (text: string, term: string) => {
    if (!term) return text;

    const regex = new RegExp(`(${term})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="tab-suggestion-highlight">
          {part}
        </span>
      ) : (
        part
      ),
    );
  };

  // Get domain icon or first letter
  const getTabIcon = (suggestion: TabAliasSuggestion) => {
    if (suggestion.favicon) {
      return <img src={suggestion.favicon} alt="" />;
    }

    // Extract domain from URL
    try {
      const domain = new URL(suggestion.url).hostname;
      if (domain.includes("github")) return "🐙";
      if (domain.includes("notion")) return "📝";
      if (domain.includes("gmail") || domain.includes("mail")) return "📧";
      if (domain.includes("slack")) return "💬";
      if (domain.includes("docs.google")) return "📄";
      if (domain.includes("sheets.google")) return "📊";
      if (domain.includes("drive.google")) return "📁";
      if (domain.includes("youtube")) return "📺";
      if (domain.includes("twitter") || domain.includes("x.com")) return "𝕏";
      if (domain.includes("linkedin")) return "💼";
      if (domain.includes("stackoverflow")) return "🤔";
      return domain.charAt(0).toUpperCase();
    } catch {
      return suggestion.title.charAt(0).toUpperCase();
    }
  };

  if (!show) {
    return null;
  }

  // Loading state
  if (loading) {
    return (
      <Card className="tab-alias-suggestions">
        <div className="tab-alias-suggestions-loading" />
      </Card>
    );
  }

  // Empty state
  if (suggestions.length === 0) {
    return (
      <Card className="tab-alias-suggestions">
        <div className="tab-alias-suggestions-empty">
          No matching tabs found
        </div>
      </Card>
    );
  }

  // Group suggestions by domain/type
  const groupedSuggestions = suggestions.reduce(
    (acc, suggestion) => {
      try {
        const domain = new URL(suggestion.url).hostname;
        const key = domain.split(".").slice(-2).join(".");
        if (!acc[key]) acc[key] = [];
        acc[key].push(suggestion);
      } catch {
        if (!acc["other"]) acc["other"] = [];
        acc["other"].push(suggestion);
      }
      return acc;
    },
    {} as Record<string, TabAliasSuggestion[]>,
  );

  const showGroups =
    Object.keys(groupedSuggestions).length > 1 && suggestions.length > 5;

  return (
    <Card className="tab-alias-suggestions" ref={containerRef}>
      {showGroups ? (
        // Grouped view
        Object.entries(groupedSuggestions).map(([group, items]) => (
          <div key={group}>
            <div className="suggestions-header">
              {group === "other" ? "Other" : group}
            </div>
            {items.map(suggestion => {
              const globalIndex = suggestions.indexOf(suggestion);
              return (
                <button
                  key={suggestion.tabKey}
                  ref={el => {
                    if (el) itemRefs.current[globalIndex] = el;
                  }}
                  className={globalIndex === selectedIndex ? "selected" : ""}
                  onClick={() => onSelect(suggestion.alias)}
                  onMouseEnter={() => setSelectedIndex(globalIndex)}
                >
                  <div className="tab-suggestion-content">
                    <div className="tab-suggestion-icon">
                      {getTabIcon(suggestion)}
                    </div>
                    <div className="tab-suggestion-text">
                      <div>
                        <span className="tab-suggestion-alias">
                          @{highlightText(suggestion.alias, searchTerm)}
                        </span>
                        <span className="tab-suggestion-title">
                          {suggestion.title}
                        </span>
                        {suggestion.status && (
                          <span
                            className={`tab-status-indicator ${suggestion.status}`}
                          />
                        )}
                      </div>
                      <div className="tab-suggestion-url">{suggestion.url}</div>
                    </div>
                    {globalIndex === selectedIndex && (
                      <div className="tab-suggestion-hint">Enter</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))
      ) : (
        // Flat view
        <>
          <div className="suggestions-header">
            Available tabs
            <span className="suggestions-keyboard-hints">
              ↑↓ Navigate • ⏎ Select • Esc Close
            </span>
          </div>
          {suggestions.map((suggestion, index) => (
            <button
              key={suggestion.tabKey}
              ref={el => {
                if (el) itemRefs.current[index] = el;
              }}
              className={index === selectedIndex ? "selected" : ""}
              onClick={() => onSelect(suggestion.alias)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div className="tab-suggestion-content">
                <div className="tab-suggestion-icon">
                  {getTabIcon(suggestion)}
                </div>
                <div className="tab-suggestion-text">
                  <div>
                    <span className="tab-suggestion-alias">
                      @{highlightText(suggestion.alias, searchTerm)}
                    </span>
                    <span className="tab-suggestion-title">
                      {suggestion.title}
                    </span>
                    {suggestion.status && (
                      <span
                        className={`tab-status-indicator ${suggestion.status}`}
                      />
                    )}
                  </div>
                  <div className="tab-suggestion-url">{suggestion.url}</div>
                </div>
                {index === selectedIndex && (
                  <div className="tab-suggestion-hint">Enter</div>
                )}
              </div>
            </button>
          ))}
        </>
      )}
    </Card>
  );
};
