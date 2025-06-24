import React from "react";

interface TabContextCardProps {
  favicon?: string;
  title: string;
  url: string;
  alias: string;
  onRemove?: () => void;
  editable?: boolean;
}

export const TabContextCard: React.FC<TabContextCardProps> = ({
  favicon,
  title,
  url,
  onRemove,
  editable = false,
}) => {
  // Extract domain from URL for display
  const getDomain = (url: string) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace("www.", "");
    } catch {
      return url;
    }
  };

  return (
    <div className="tab-context-card">
      <div className="tab-context-card-icon">
        {favicon ? (
          <img
            src={favicon}
            alt=""
            className="tab-context-card-favicon"
            onError={e => {
              e.currentTarget.style.display = "none";
              const placeholder = e.currentTarget.nextElementSibling;
              if (placeholder) {
                (placeholder as HTMLElement).style.display = "flex";
              }
            }}
          />
        ) : null}
        <div
          className="tab-context-card-favicon-placeholder"
          style={{ display: favicon ? "none" : "flex" }}
        >
          {title.charAt(0).toUpperCase()}
        </div>
      </div>
      <div className="tab-context-card-info">
        <div className="tab-context-card-title">{title}</div>
        <div className="tab-context-card-url">{getDomain(url)}</div>
      </div>
      {editable && onRemove && (
        <button
          className="tab-context-card-remove"
          onClick={onRemove}
          aria-label="Remove tab"
        >
          ×
        </button>
      )}
    </div>
  );
};
