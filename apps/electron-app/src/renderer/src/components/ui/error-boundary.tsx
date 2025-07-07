import React, { Component, ErrorInfo, ReactNode } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ErrorBoundary");

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error("Error caught:", error.name, error.message);
    logger.error("Component stack:", errorInfo.componentStack);

    this.props.onError?.(error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided, otherwise use default
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          style={{
            padding: "var(--spacing-lg)",
            textAlign: "center",
            backgroundColor: "var(--app-background-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            margin: "var(--spacing-md)",
          }}
        >
          <h3
            style={{
              color: "var(--text-primary)",
              marginBottom: "var(--spacing-md)",
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
            }}
          >
            Something went wrong
          </h3>
          <p
            style={{
              color: "var(--text-secondary)",
              marginBottom: "var(--spacing-lg)",
              fontSize: "var(--font-size-sm)",
            }}
          >
            An error occurred while rendering this component. Please try
            refreshing the page.
          </p>
          {import.meta.env.DEV && this.state.error && (
            <details
              style={{
                textAlign: "left",
                backgroundColor: "var(--color-gray-50)",
                padding: "var(--spacing-md)",
                borderRadius: "var(--radius-md)",
                fontSize: "var(--font-size-xs)",
                fontFamily: "monospace",
                marginBottom: "var(--spacing-md)",
              }}
            >
              <summary
                style={{ cursor: "pointer", marginBottom: "var(--spacing-sm)" }}
              >
                Error Details (Development)
              </summary>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
                {this.state.error.stack}
              </pre>
            </details>
          )}
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            style={{
              backgroundColor: "var(--button-primary)",
              color: "var(--button-text-primary)",
              border: "none",
              borderRadius: "var(--radius-md)",
              padding: "var(--spacing-sm) var(--spacing-md)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
              marginRight: "var(--spacing-sm)",
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor =
                "var(--button-primary-hover)";
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor = "var(--button-primary)";
            }}
          >
            Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              backgroundColor: "var(--button-background)",
              color: "var(--button-text)",
              border: "1px solid var(--border-color)",
              borderRadius: "var(--radius-md)",
              padding: "var(--spacing-sm) var(--spacing-md)",
              fontSize: "var(--font-size-sm)",
              fontWeight: "var(--font-weight-medium)",
              cursor: "pointer",
            }}
            onMouseOver={e => {
              e.currentTarget.style.backgroundColor =
                "var(--button-background-hover)";
            }}
            onMouseOut={e => {
              e.currentTarget.style.backgroundColor =
                "var(--button-background)";
            }}
          >
            Refresh Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Specialized error boundary for chat components
export const ChatErrorBoundary = ({
  children,
  ...props
}: Props): React.ReactElement => {
  const handleError = (error: Error, errorInfo: ErrorInfo): void => {
    logger.error("Chat error:", error.name, error.message);
    props.onError?.(error, errorInfo);
  };

  const fallback = (
    <div
      style={{
        padding: "var(--spacing-lg)",
        textAlign: "center",
        backgroundColor: "var(--chat-panel-background)",
        border: "1px solid var(--chat-panel-border)",
        borderRadius: "var(--radius-lg)",
        margin: "var(--spacing-md)",
      }}
    >
      <h3
        style={{
          color: "var(--text-primary)",
          marginBottom: "var(--spacing-md)",
          fontSize: "var(--font-size-lg)",
          fontWeight: "var(--font-weight-semibold)",
        }}
      >
        Chat Unavailable
      </h3>
      <p
        style={{
          color: "var(--text-secondary)",
          marginBottom: "var(--spacing-lg)",
          fontSize: "var(--font-size-sm)",
        }}
      >
        The chat interface encountered an error. You can try reloading or
        continue browsing.
      </p>
      <button
        onClick={() => window.vibe?.interface?.toggleChatPanel?.(false)}
        style={{
          backgroundColor: "var(--button-background)",
          color: "var(--button-text)",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "var(--spacing-sm) var(--spacing-md)",
          fontSize: "var(--font-size-sm)",
          fontWeight: "var(--font-weight-medium)",
          cursor: "pointer",
        }}
      >
        Close Chat Panel
      </button>
    </div>
  );

  return (
    <ErrorBoundary {...props} fallback={fallback} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
};
