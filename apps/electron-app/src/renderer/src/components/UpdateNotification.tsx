import { useEffect, useState } from "react";
import { Download, X, AlertCircle, CheckCircle2 } from "lucide-react";

interface UpdateInfo {
  version: string;
  releaseNotes?: string;
}

interface DownloadProgress {
  percent: number;
  bytesPerSecond: number;
  total: number;
  transferred: number;
}

/**
 * Update notification component that displays update status and progress.
 *
 * IMPORTANT: This component should be used as a singleton in the app.
 * Due to limitations in the legacy window.api interface, we use removeAllListeners
 * which removes all listeners for a channel. Multiple instances would interfere
 * with each other's event handling.
 */
export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNoUpdate, setShowNoUpdate] = useState(false);

  useEffect(() => {
    // Store cleanup functions for proper listener removal
    const cleanupFunctions: Array<() => void> = [];

    // Listen for update events
    const handleUpdateAvailable = (_event: any, info: UpdateInfo) => {
      setUpdateInfo(info);
      setUpdateAvailable(true);
      setDismissed(false);
      setChecking(false);
      setError(null);
    };

    const handleDownloadProgress = (
      _event: any,
      progress: DownloadProgress,
    ) => {
      setDownloadProgress(progress);
      setDownloading(true);
    };

    const handleUpdateDownloaded = (_event: any, info: UpdateInfo) => {
      setUpdateInfo(info);
      setUpdateReady(true);
      setDownloading(false);
    };

    const handleUpdateError = (
      _event: any,
      error: { code?: string; message?: string },
    ) => {
      setDownloading(false);
      setUpdateAvailable(false);
      setChecking(false);
      // User-friendly error messages
      const errorMessage =
        error?.code === "ENOTFOUND"
          ? "Unable to connect to update server"
          : error?.code === "ETIMEDOUT"
            ? "Update check timed out"
            : error?.message || "Unable to check for updates";
      setError(errorMessage);
      setTimeout(() => setError(null), 5000);
    };

    const handleCheckingForUpdate = () => {
      setChecking(true);
      setError(null);
    };

    const handleUpdateNotAvailable = () => {
      setChecking(false);
      setUpdateAvailable(false);
      setShowNoUpdate(true);
      setTimeout(() => setShowNoUpdate(false), 3000);
    };

    // Helper to add listeners with proper cleanup
    const addListener = (channel: string, handler: any) => {
      // Create a wrapper that extracts event data
      const listener = (event: any, ...args: any[]) => {
        handler(event, ...args);
      };

      // Use the legacy API but store individual cleanup functions
      window.api.on(channel, listener);

      // Store cleanup function that removes only this specific listener
      cleanupFunctions.push(() => {
        // Note: Since window.api only exposes removeAllListeners, we need to be careful
        // For now, we'll use it but document that this component should be singleton
        window.api.removeAllListeners(channel);
      });
    };

    addListener("update-update-available", handleUpdateAvailable);
    addListener("update-download-progress", handleDownloadProgress);
    addListener("update-update-downloaded", handleUpdateDownloaded);
    addListener("update-error", handleUpdateError);
    addListener("update-checking-for-update", handleCheckingForUpdate);
    addListener("update-update-not-available", handleUpdateNotAvailable);

    // Check for updates on mount using modern API
    window.vibe.update.checkForUpdate().catch(error => {
      // Log error for debugging but don't show to user on mount
      console.error("Update check failed on mount:", error);
    });

    // Cleanup all listeners on unmount
    return () => {
      cleanupFunctions.forEach(cleanup => cleanup());
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      await window.vibe.update.showUpdateDialog();
    } catch (error) {
      console.error("Failed to show update dialog:", error);
      // Show error to user
      setError("Failed to install update. Please try again.");
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
  };

  // Don't show if dismissed or no update
  if (
    dismissed ||
    (!updateAvailable && !updateReady && !error && !showNoUpdate && !checking)
  ) {
    return null;
  }

  return (
    <div
      className="fixed top-[8px] right-4 z-[9999]"
      style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
    >
      <div
        className="bg-white dark:bg-gray-800 rounded-full shadow-md border border-gray-200 dark:border-gray-700 px-3 py-1.5 flex items-center gap-2 text-xs"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <div className="flex items-center gap-2">
          {error ? (
            <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
          ) : showNoUpdate ? (
            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
          ) : checking ? (
            <div className="animate-spin rounded-full h-3 w-3 border-2 border-blue-500 border-t-transparent flex-shrink-0" />
          ) : (
            <Download className="w-3 h-3 text-blue-500 flex-shrink-0" />
          )}

          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {error
                ? "Update Error"
                : showNoUpdate
                  ? "Up to date"
                  : checking
                    ? "Checking..."
                    : updateReady
                      ? `v${updateInfo?.version} ready`
                      : `v${updateInfo?.version} available`}
            </p>

            {downloading && downloadProgress && (
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1 overflow-hidden">
                  <div
                    className="bg-blue-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                <span className="text-gray-500 dark:text-gray-400 whitespace-nowrap">
                  {Math.round(downloadProgress.percent)}%
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 ml-auto">
          {updateReady && (
            <button
              onClick={handleInstallUpdate}
              className="px-2.5 py-0.5 font-medium bg-blue-500 hover:bg-blue-600 text-white rounded-full transition-colors text-[11px]"
            >
              Install
            </button>
          )}

          {!downloading && !checking && (
            <button
              onClick={handleDismiss}
              className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
