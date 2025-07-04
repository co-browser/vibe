import React from "react";

export const OverlayComponents = {
  Toast: ({
    message,
    type = "info",
    duration = 3000,
  }: {
    message: string;
    type?: "success" | "error" | "warning" | "info";
    duration?: number;
  }) => {
    // Use duration for future animation/auto-hide functionality
    console.debug("Toast display duration:", duration);
    const colors = {
      success: { bg: "#10b981", icon: "✓" },
      error: { bg: "#ef4444", icon: "✕" },
      warning: { bg: "#f59e0b", icon: "!" },
      info: { bg: "#3b82f6", icon: "i" },
    };
    const { bg, icon } = colors[type];
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "16px 20px",
          backgroundColor: bg,
          color: "white",
          borderRadius: 8,
          boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
          maxWidth: 400,
          fontSize: 14,
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: 18 }}>{icon}</span>
        <span>{message}</span>
      </div>
    );
  },
  Dialog: ({
    title,
    content,
    actions,
    width = 400,
  }: {
    title?: string;
    content: React.ReactNode;
    actions?: React.ReactNode;
    width?: number;
  }) => {
    return (
      <div
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.12)",
          width,
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {title && (
          <div
            style={{
              padding: "20px 24px",
              borderBottom: "1px solid #e5e7eb",
              fontSize: 18,
              fontWeight: 600,
            }}
          >
            {title}
          </div>
        )}
        <div
          style={{
            padding: "20px 24px",
            flex: 1,
            overflow: "auto",
          }}
        >
          {content}
        </div>
        {actions && (
          <div
            style={{
              padding: "16px 24px",
              borderTop: "1px solid #e5e7eb",
              display: "flex",
              gap: 12,
              justifyContent: "flex-end",
            }}
          >
            {actions}
          </div>
        )}
      </div>
    );
  },
};
