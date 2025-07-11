import { useState, useEffect } from "react";

/**
 * Hook to monitor online/offline status
 * @returns {boolean} Whether the browser is online
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const updateOnlineStatus = () => {
      setIsOnline(navigator.onLine);
    };

    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);

    // Check initial status
    updateOnlineStatus();

    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

  return isOnline;
}

/**
 * Utility function to check online status imperatively
 */
export function checkOnlineStatus(): boolean {
  return navigator.onLine;
}

/**
 * Subscribe to online status changes
 * @param callback Function to call when online status changes
 * @returns Cleanup function to unsubscribe
 */
export function subscribeToOnlineStatus(
  callback: (isOnline: boolean) => void,
): () => void {
  const updateStatus = () => {
    callback(navigator.onLine);
  };

  window.addEventListener("online", updateStatus);
  window.addEventListener("offline", updateStatus);

  // Call immediately with current status
  updateStatus();

  // Return cleanup function
  return () => {
    window.removeEventListener("online", updateStatus);
    window.removeEventListener("offline", updateStatus);
  };
}
