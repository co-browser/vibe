import React from "react";
import { MessageCircle } from "lucide-react";

interface ChatMinimizedOrbProps {
  onClick: () => void;
  hasUnreadMessages?: boolean;
}

export const ChatMinimizedOrb: React.FC<ChatMinimizedOrbProps> = ({
  onClick,
  hasUnreadMessages = false,
}) => {
  return (
    <button
      onClick={onClick}
      className="chat-minimized-orb"
      style={{
        position: "relative",
        width: "32px",
        height: "32px",
        borderRadius: "50%",
        backgroundColor: "#10b981",
        border: "none",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
        transition: "all 0.2s ease",
        marginRight: "12px",
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = "scale(1.1)";
        e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = "scale(1)";
        e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
      }}
      title="Open Chat"
    >
      <MessageCircle size={18} color="white" />
      {hasUnreadMessages && (
        <div
          style={{
            position: "absolute",
            top: "-2px",
            right: "-2px",
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "#ef4444",
            border: "2px solid white",
          }}
        />
      )}
    </button>
  );
};
