import React from "react";
import { MessageCircle } from "lucide-react";

interface ChatMinimizedOrbProps {
  onClick: () => void;
  hasUnreadMessages?: boolean;
  enhanced?: boolean; // New prop for showing flames and halo effect
}

export const ChatMinimizedOrb: React.FC<ChatMinimizedOrbProps> = ({
  onClick,
  hasUnreadMessages = false,
  enhanced = false,
}) => {
  const baseStyles = {
    position: "relative" as const,
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    backgroundColor: "#10b981",
    border: "none",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "all 0.2s ease",
    marginRight: "12px",
  };

  const enhancedStyles = enhanced
    ? {
        ...baseStyles,
        boxShadow:
          "0 0 20px rgba(16, 185, 129, 0.6), 0 0 40px rgba(16, 185, 129, 0.4), 0 0 60px rgba(16, 185, 129, 0.2)",
        animation: "pulse-glow 2s infinite",
      }
    : {
        ...baseStyles,
        boxShadow: "0 2px 4px rgba(0, 0, 0, 0.1)",
      };

  return (
    <>
      {enhanced && (
        <style>{`
          @keyframes pulse-glow {
            0%, 100% {
              box-shadow: 0 0 20px rgba(16, 185, 129, 0.6), 0 0 40px rgba(16, 185, 129, 0.4), 0 0 60px rgba(16, 185, 129, 0.2);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 30px rgba(16, 185, 129, 0.8), 0 0 50px rgba(16, 185, 129, 0.6), 0 0 70px rgba(16, 185, 129, 0.4);
              transform: scale(1.05);
            }
          }
          
          @keyframes flame-flicker {
            0%, 100% { opacity: 0.8; transform: translateY(0px) scale(1); }
            25% { opacity: 1; transform: translateY(-2px) scale(1.1); }
            50% { opacity: 0.9; transform: translateY(-1px) scale(0.95); }
            75% { opacity: 1; transform: translateY(-3px) scale(1.05); }
          }
          
          .flame {
            position: absolute;
            background: linear-gradient(to top, #ff6b35, #f7931e, #ffde59);
            border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%;
            animation: flame-flicker 1.5s infinite ease-in-out;
          }
          
          .flame-1 {
            width: 8px;
            height: 12px;
            top: -6px;
            left: 6px;
            animation-delay: 0s;
          }
          
          .flame-2 {
            width: 6px;
            height: 10px;
            top: -4px;
            right: 6px;
            animation-delay: 0.3s;
          }
          
          .flame-3 {
            width: 10px;
            height: 14px;
            top: -8px;
            left: 50%;
            transform: translateX(-50%);
            animation-delay: 0.6s;
          }
          
          .flame-4 {
            width: 7px;
            height: 11px;
            top: -5px;
            left: 2px;
            animation-delay: 0.9s;
          }
          
          .flame-5 {
            width: 5px;
            height: 9px;
            top: -3px;
            right: 2px;
            animation-delay: 1.2s;
          }
        `}</style>
      )}

      <button
        onClick={onClick}
        className="chat-minimized-orb"
        style={enhancedStyles}
        onMouseEnter={e => {
          if (enhanced) {
            e.currentTarget.style.transform = "scale(1.15)";
            e.currentTarget.style.boxShadow =
              "0 0 35px rgba(16, 185, 129, 0.8), 0 0 55px rgba(16, 185, 129, 0.6), 0 0 75px rgba(16, 185, 129, 0.4)";
          } else {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.15)";
          }
        }}
        onMouseLeave={e => {
          if (enhanced) {
            e.currentTarget.style.transform = "scale(1.05)";
            e.currentTarget.style.boxShadow =
              "0 0 30px rgba(16, 185, 129, 0.8), 0 0 50px rgba(16, 185, 129, 0.6), 0 0 70px rgba(16, 185, 129, 0.4)";
          } else {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 2px 4px rgba(0, 0, 0, 0.1)";
          }
        }}
        title={enhanced ? "Open Chat (Enhanced Mode)" : "Open Chat"}
      >
        {/* Green flames around the orb when enhanced */}
        {enhanced && (
          <>
            <div className="flame flame-1" />
            <div className="flame flame-2" />
            <div className="flame flame-3" />
            <div className="flame flame-4" />
            <div className="flame flame-5" />
          </>
        )}

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
              zIndex: 10,
            }}
          />
        )}
      </button>
    </>
  );
};
