import { useOnlineStatus } from "../../hooks/useOnlineStatus";

interface OnlineStatusStripProps {
  className?: string;
}

/**
 * Thin colored strip indicating online/offline status
 * Green when online, red when offline
 */
export function OnlineStatusStrip({ className = "" }: OnlineStatusStripProps) {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`online-status-strip ${className}`}
      style={{
        height: "2px",
        width: "100%",
        backgroundColor: isOnline ? "#10b981" : "#ef4444",
        transition: "background-color 0.3s ease",
      }}
      title={isOnline ? "Connected to the internet" : "No internet connection"}
      aria-label={isOnline ? "Online" : "Offline"}
    />
  );
}
