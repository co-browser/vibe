import React from "react";

interface StatusPillProps {
  status: "loading" | "connected" | "disconnected";
  title: string;
  show: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({
  status,
  title,
  show,
}) => {
  if (!show) return null;

  return (
    <div className={`status-indicator-pill ${status}`} title={title}>
      <div className="status-dot" />
    </div>
  );
};
