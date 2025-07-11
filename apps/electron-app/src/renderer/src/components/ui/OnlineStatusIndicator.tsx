import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import { WifiOff, Wifi } from "lucide-react";

interface OnlineStatusIndicatorProps {
  showText?: boolean;
  className?: string;
}

/**
 * Component to display online/offline status
 */
export function OnlineStatusIndicator({
  showText = true,
  className = "",
}: OnlineStatusIndicatorProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className={`flex items-center gap-2 ${className}`} id="online-status">
      {isOnline ? (
        <>
          <Wifi className="h-4 w-4 text-green-500" />
          {showText && <span className="text-sm text-green-600">Online</span>}
        </>
      ) : (
        <>
          <WifiOff className="h-4 w-4 text-red-500" />
          {showText && <span className="text-sm text-red-600">Offline</span>}
        </>
      )}
    </div>
  );
}

/**
 * Minimal status indicator (icon only)
 */
export function OnlineStatusDot({ className = "" }: { className?: string }) {
  const isOnline = useOnlineStatus();

  return (
    <div
      className={`w-2 h-2 rounded-full ${
        isOnline ? "bg-green-500" : "bg-red-500"
      } ${className}`}
      title={isOnline ? "Online" : "Offline"}
    />
  );
}
