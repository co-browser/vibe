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

    const handleUpdateError = (_event: any, error: any) => {
      console.error("Update error:", error);
      setDownloading(false);
      setUpdateAvailable(false);
      setError(error?.message || "Failed to check for updates");
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

    // Add listeners
    window.api.on("update-update-available", handleUpdateAvailable);
    window.api.on("update-download-progress", handleDownloadProgress);
    window.api.on("update-update-downloaded", handleUpdateDownloaded);
    window.api.on("update-error", handleUpdateError);
    window.api.on("update-checking-for-update", handleCheckingForUpdate);
    window.api.on("update-update-not-available", handleUpdateNotAvailable);

    // Check for updates on mount
    window.api.app.checkForUpdate().catch(console.error);

    // Cleanup
    return () => {
      window.api.removeAllListeners("update-update-available");
      window.api.removeAllListeners("update-download-progress");
      window.api.removeAllListeners("update-update-downloaded");
      window.api.removeAllListeners("update-error");
      window.api.removeAllListeners("update-checking-for-update");
      window.api.removeAllListeners("update-update-not-available");
    };
  }, []);

  const handleInstallUpdate = async () => {
    try {
      await window.api.app.showUpdateDialog();
    } catch (error) {
      console.error("Failed to show update dialog:", error);
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
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4">
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            {error ? (
              <AlertCircle className="w-5 h-5 text-red-500 mt-0.5" />
            ) : showNoUpdate ? (
              <CheckCircle2 className="w-5 h-5 text-green-500 mt-0.5" />
            ) : checking ? (
              <div className="w-5 h-5 mt-0.5">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
              </div>
            ) : (
              <Download className="w-5 h-5 text-blue-500 mt-0.5" />
            )}
            <div>
              <h4 className="font-medium text-gray-900 dark:text-gray-100">
                {error
                  ? "Update Error"
                  : showNoUpdate
                    ? "No Updates Available"
                    : checking
                      ? "Checking for Updates..."
                      : updateReady
                        ? "Update Ready!"
                        : "Update Available"}
              </h4>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {error
                  ? error
                  : showNoUpdate
                    ? "You're running the latest version"
                    : checking
                      ? "Looking for new updates..."
                      : updateReady
                        ? `Version ${updateInfo?.version} is ready to install`
                        : `Version ${updateInfo?.version} is available`}
              </p>

              {downloading && downloadProgress && (
                <div className="mt-2">
                  <div className="w-full bg-gray-200 rounded-full h-2 dark:bg-gray-700">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-200"
                      style={{ width: `${downloadProgress.percent}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {Math.round(downloadProgress.percent)}% downloaded
                  </p>
                </div>
              )}

              {updateReady && (
                <button
                  onClick={handleInstallUpdate}
                  className="mt-2 px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                  Restart and Install
                </button>
              )}
            </div>
          </div>

          {!downloading && !checking && (
            <button
              onClick={handleDismiss}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
