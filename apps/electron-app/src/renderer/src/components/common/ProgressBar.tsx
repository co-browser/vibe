import React from "react";
import "./ProgressBar.css";

interface ProgressBarProps {
  value: number; // 0-100
  title?: string;
  label?: string;
  className?: string;
  variant?: "default" | "success" | "warning" | "danger";
  indeterminate?: boolean;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  title,
  label,
  className = "",
  variant = "default",
  indeterminate = false,
}) => {
  // Ensure value is between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`progress-bar-container ${variant} ${className}`}>
      {title && (
        <div className="progress-bar-title text-sm font-medium text-gray-700 mb-2">
          {title}
        </div>
      )}

      <div className="progress-bar-wrapper">
        <div className="progress-bar-track">
          <div
            className={`progress-bar-fill ${indeterminate ? "indeterminate" : ""}`}
            style={indeterminate ? {} : { width: `${clampedValue}%` }}
          />
        </div>

        <div className="progress-bar-info">
          {label && <span className="progress-bar-label">{label}</span>}
          {!indeterminate && (
            <span className="progress-bar-percentage">
              {Math.round(clampedValue)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
