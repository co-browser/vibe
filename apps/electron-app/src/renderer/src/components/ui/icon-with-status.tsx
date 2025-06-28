import React from "react";
import { Tooltip } from "antd";
import "../styles/ChatView.css";

interface IconWithStatusProps {
  // Icon content
  children: React.ReactNode;

  // Status indicator
  status: "connected" | "disconnected" | "loading";
  statusTitle?: string;

  // Main icon/pill properties
  title?: string;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;

  // Whether to show as favicon pill, gmail pill, or privy pill
  variant?: "gmail" | "favicon" | "privy";

  // Text label to show alongside icon
  label?: string;
}

export const IconWithStatus: React.FC<IconWithStatusProps> = ({
  children,
  status,
  statusTitle,
  title,
  onClick,
  className = "",
  style,
  variant = "gmail",
  label,
}) => {
  const isAuth = variant === "gmail" || variant === "privy";
  const pillClassName = isAuth ? "auth-pill" : "favicon-pill";
  const statusClass = status === "disconnected" ? "disconnected" : "";

  const iconElement = (
    <div
      className={`${pillClassName} ${variant}-pill ${statusClass} ${className}`}
      onClick={onClick}
      title={title || statusTitle}
      style={{
        cursor: onClick ? "pointer" : "default",
        ...style,
      }}
    >
      {children}
      {label && <span className="pill-label">{label}</span>}
    </div>
  );

  // For auth pills, no wrapper needed
  if (isAuth) {
    return iconElement;
  }

  // For favicon pills, keep the existing wrapper structure
  return (
    <div className="gmail-status-container">
      {/* Status indicator comes first */}
      <div className={`status-indicator-pill ${status}`} title={statusTitle}>
        <div className="status-dot" />
      </div>

      {/* Icon/pill comes second */}
      {variant === "favicon" && title ? (
        <Tooltip
          title={title}
          placement="topLeft"
          overlayStyle={{ maxWidth: 200 }}
        >
          {iconElement}
        </Tooltip>
      ) : (
        iconElement
      )}
    </div>
  );
};
