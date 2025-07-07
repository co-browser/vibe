import { useOnlineStatus } from "../../hooks/useOnlineStatus";
import {
  OnlineStatusIndicator,
  OnlineStatusDot,
} from "../ui/OnlineStatusIndicator";
import { useEffect } from "react";
import { onlineStatusService } from "../../services/onlineStatusService";

/**
 * Example component showing different ways to use online status
 */
export function OnlineStatusExample() {
  const isOnline = useOnlineStatus();

  useEffect(() => {
    // Example of using the service directly
    const unsubscribe = onlineStatusService.subscribe(online => {
      console.log("Online status changed:", online);
    });

    return unsubscribe;
  }, []);

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-semibold">Online Status Examples</h2>

      {/* Using the hook directly */}
      <div>
        <h3 className="font-medium">Hook Usage:</h3>
        <p>
          Status: <span id="status">{isOnline ? "online" : "offline"}</span>
        </p>
      </div>

      {/* Using the indicator component */}
      <div>
        <h3 className="font-medium">Component with text:</h3>
        <OnlineStatusIndicator />
      </div>

      {/* Using the dot indicator */}
      <div className="flex items-center gap-2">
        <h3 className="font-medium">Minimal indicator:</h3>
        <OnlineStatusDot />
      </div>

      {/* Custom implementation */}
      <div>
        <h3 className="font-medium">Custom styling:</h3>
        <div
          className={`px-3 py-1 rounded-full inline-block ${
            isOnline ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {isOnline ? "🟢 Connected" : "🔴 Disconnected"}
        </div>
      </div>
    </div>
  );
}
