import React, { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { 
  Lightbulb, 
  ChevronDown, 
  ChevronRight, 
  Wrench, 
  Globe,
  CheckCircle,
  XCircle,
  Loader2
} from "lucide-react";
import { Tooltip } from "antd";
import { markdownComponents } from "../ui/markdown-components";

/**
 * Unified UI Components - Consolidated Display Components
 * 
 * Consolidates multiple UI components into a single module:
 * - ReasoningDisplay
 * - ToolCallDisplay  
 * - BrowserProgressDisplay
 * - StatusIndicator
 * - FaviconPill
 * 
 * Benefits:
 * - Reduced bundle size through shared components
 * - Consistent styling and behavior
 * - Better performance through component reuse
 * - Easier maintenance and updates
 */

// === Shared Types ===

interface BaseDisplayProps {
  isLive?: boolean;
  isCollapsed?: boolean;
  onToggle?: () => void;
}

interface CollapsibleContentProps extends BaseDisplayProps {
  icon: React.ReactNode;
  title: string;
  activeTitle?: string;
  children: React.ReactNode;
  className?: string;
}

// === Base Collapsible Component ===

const CollapsibleDisplay: React.FC<CollapsibleContentProps> = ({
  icon,
  title,
  activeTitle,
  children,
  isLive = false,
  isCollapsed: controlledCollapsed,
  onToggle: controlledToggle,
  className = "",
}) => {
  const [internalCollapsed, setInternalCollapsed] = useState(!isLive);
  const [previousContent, setPreviousContent] = useState("");
  const [contentComplete, setContentComplete] = useState(false);
  const [manuallyToggled, setManuallyToggled] = useState(false);

  const isCollapsed = controlledCollapsed ?? internalCollapsed;
  const onToggle = controlledToggle ?? (() => {
    setInternalCollapsed(!internalCollapsed);
    setManuallyToggled(true);
  });

  // Auto-collapse logic for live content
  useEffect(() => {
    if (isLive && React.Children.count(children) > 0) {
      const currentContent = React.Children.toArray(children).join("");
      if (currentContent !== previousContent) {
        setPreviousContent(currentContent);
        setContentComplete(false);
      }
    }
  }, [children, previousContent, isLive]);

  useEffect(() => {
    if (isLive && React.Children.count(children) > 0) {
      const timer = setTimeout(() => {
        setContentComplete(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [children, isLive]);

  useEffect(() => {
    if (contentComplete && !isCollapsed && !manuallyToggled) {
      const timer = setTimeout(() => {
        setInternalCollapsed(true);
      }, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [contentComplete, isCollapsed, manuallyToggled]);

  const displayTitle = isLive && !contentComplete ? (activeTitle || title) : title;
  const iconClassName = `${className}__icon ${isLive && !contentComplete ? `${className}__icon--active` : ""}`;

  return (
    <div className={`${className}__container`}>
      <div className={`${className}__header`} onClick={onToggle}>
        <div className={iconClassName}>
          {icon}
        </div>
        <span className={`${className}__label`}>
          {displayTitle}
        </span>
        {isCollapsed ? (
          <ChevronRight className={`${className}__chevron`} />
        ) : (
          <ChevronDown className={`${className}__chevron`} />
        )}
      </div>
      {!isCollapsed && (
        <div className={`${className}__content`}>
          {children}
          {isLive && !contentComplete && (
            <div className={`${className}__indicator`}>
              <div className={`${className}__dots`}>
                <div className={`${className}__dot`}></div>
                <div className={`${className}__dot`}></div>
                <div className={`${className}__dot`}></div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// === Reasoning Display ===

interface ReasoningDisplayProps extends BaseDisplayProps {
  reasoning: string;
}

export const ReasoningDisplay: React.FC<ReasoningDisplayProps> = ({
  reasoning,
  isLive = false,
  ...props
}) => {
  return (
    <CollapsibleDisplay
      icon={<Lightbulb />}
      title="Thinking Process"
      activeTitle="Thinking..."
      isLive={isLive}
      className="reasoning"
      {...props}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {reasoning}
      </ReactMarkdown>
    </CollapsibleDisplay>
  );
};

// === Tool Call Display ===

interface ToolCallDisplayProps extends BaseDisplayProps {
  toolName: string;
  toolArgs?: any;
}

export const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({
  toolName,
  toolArgs,
  isLive = false,
  ...props
}) => {
  const formatArgs = useCallback(() => {
    if (!toolArgs) return "No arguments";
    
    try {
      return JSON.stringify(toolArgs, null, 2);
    } catch {
      return String(toolArgs);
    }
  }, [toolArgs]);

  return (
    <CollapsibleDisplay
      icon={<Wrench />}
      title={`Tool: ${toolName}`}
      activeTitle={`Running: ${toolName}`}
      isLive={isLive}
      className="tool-call"
      {...props}
    >
      <div className="tool-call__details">
        <div className="tool-call__name">
          <strong>Tool:</strong> {toolName}
        </div>
        {toolArgs && (
          <div className="tool-call__args">
            <strong>Arguments:</strong>
            <pre className="tool-call__args-content">
              {formatArgs()}
            </pre>
          </div>
        )}
      </div>
    </CollapsibleDisplay>
  );
};

// === Browser Progress Display ===

interface BrowserProgressDisplayProps extends BaseDisplayProps {
  progressText: string;
}

export const BrowserProgressDisplay: React.FC<BrowserProgressDisplayProps> = ({
  progressText,
  isLive = false,
  ...props
}) => {
  return (
    <CollapsibleDisplay
      icon={<Globe />}
      title="Browser Activity"
      activeTitle="Working in browser..."
      isLive={isLive}
      className="browser-progress"
      {...props}
    >
      <div className="browser-progress__content">
        {progressText.split('\n').map((line, index) => (
          <div key={index} className="browser-progress__line">
            {line}
          </div>
        ))}
      </div>
    </CollapsibleDisplay>
  );
};

// === Status Indicator ===

interface StatusIndicatorProps {
  status: "loading" | "connected" | "disconnected" | "success" | "error";
  title: string;
  show: boolean;
  size?: "sm" | "md" | "lg";
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  title,
  show,
  size = "md",
}) => {
  if (!show) return null;

  const getStatusIcon = () => {
    switch (status) {
      case "loading":
        return <Loader2 className="animate-spin" />;
      case "connected":
      case "success":
        return <CheckCircle />;
      case "disconnected":
      case "error":
        return <XCircle />;
      default:
        return <Loader2 />;
    }
  };

  const getStatusColor = () => {
    switch (status) {
      case "connected":
      case "success":
        return "text-green-500";
      case "disconnected":
      case "error":
        return "text-red-500";
      case "loading":
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4", 
    lg: "w-5 h-5"
  };

  return (
    <Tooltip title={title}>
      <div className={`status-indicator status-indicator--${status}`}>
        <div className={`${sizeClasses[size]} ${getStatusColor()}`}>
          {getStatusIcon()}
        </div>
      </div>
    </Tooltip>
  );
};

// === Favicon Pill ===

interface FaviconPillProps {
  favicon?: string;
  title?: string;
  tooltipTitle?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export const FaviconPill: React.FC<FaviconPillProps> = ({
  favicon,
  title,
  tooltipTitle,
  style,
  children,
  size = "md",
}) => {
  const [imageError, setImageError] = useState(false);

  const handleImageError = useCallback(() => {
    setImageError(true);
  }, []);

  const sizeClasses = {
    sm: "w-4 h-4 text-xs",
    md: "w-6 h-6 text-sm",
    lg: "w-8 h-8 text-base"
  };

  const content = (
    <div className={`favicon-pill favicon-pill--${size}`} style={style}>
      {children || (
        <>
          {favicon && !imageError ? (
            <img
              src={favicon}
              alt={title || "Tab"}
              className={`${sizeClasses[size]} rounded`}
              onError={handleImageError}
            />
          ) : (
            <div
              className={`favicon-pill__placeholder ${sizeClasses[size]} rounded bg-gray-200 flex items-center justify-center font-medium text-gray-600`}
            >
              {(title || "T").charAt(0).toUpperCase()}
            </div>
          )}
        </>
      )}
    </div>
  );

  if (tooltipTitle) {
    return (
      <Tooltip
        title={tooltipTitle}
        placement="topLeft"
        overlayStyle={{ maxWidth: 200 }}
      >
        {content}
      </Tooltip>
    );
  }

  return content;
};

// === Tab Context Display ===

interface TabContextItem {
  key: string;
  title?: string;
  url?: string;
  favicon?: string;
}

interface TabContextDisplayProps {
  sharedLoadingEntry?: any;
  completedTabs: TabContextItem[];
  regularTabs: TabContextItem[];
  hasMoreTabs: boolean;
  moreTabsCount: number;
}

export const TabContextDisplay: React.FC<TabContextDisplayProps> = ({
  sharedLoadingEntry,
  completedTabs,
  regularTabs,
  hasMoreTabs,
  moreTabsCount,
}) => {
  const renderTabStack = (tabs: any[], isLoading = false) => {
    if (!tabs || tabs.length === 0) return null;

    return (
      <div className="tab-context__stack">
        {tabs.map((tab, idx) => (
          <div
            key={tab.key || idx}
            className="tab-context__item"
            style={{
              position: idx === 0 ? "static" : "absolute",
              top: idx === 0 ? 0 : `${idx * 2}px`,
              left: idx === 0 ? 0 : `${idx * 2}px`,
              zIndex: tabs.length - idx,
            }}
          >
            <FaviconPill
              favicon={tab.favicon}
              title={tab.title}
              tooltipTitle={tab.title || tab.url}
              size="sm"
            />
          </div>
        ))}
        {isLoading && (
          <div className="tab-context__loading">
            <Loader2 className="w-3 h-3 animate-spin" />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tab-context-display">
      {sharedLoadingEntry && (
        <FaviconPill
          tooltipTitle="Loading tabs..."
          size="md"
        >
          {renderTabStack(sharedLoadingEntry.loadingTabs || [], true)}
        </FaviconPill>
      )}
      
      {completedTabs.map(tab => (
        <FaviconPill
          key={tab.key}
          favicon={tab.favicon}
          title={tab.title}
          tooltipTitle={tab.title || tab.url}
          size="sm"
        />
      ))}
      
      {regularTabs.map(tab => (
        <FaviconPill
          key={tab.key}
          favicon={tab.favicon}
          title={tab.title}
          tooltipTitle={tab.title || tab.url}
          size="sm"
        />
      ))}
      
      {hasMoreTabs && (
        <div className="tab-context__more">
          <span className="tab-context__more-count">+{moreTabsCount}</span>
        </div>
      )}
    </div>
  );
};

// === Export All Components ===

// eslint-disable-next-line react-refresh/only-export-components
export const UnifiedUIComponents = {
  ReasoningDisplay,
  ToolCallDisplay,
  BrowserProgressDisplay,
  StatusIndicator,
  FaviconPill,
  TabContextDisplay,
  CollapsibleDisplay,
};

export default UnifiedUIComponents;