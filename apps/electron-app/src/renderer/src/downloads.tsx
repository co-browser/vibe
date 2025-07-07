import React, { useState, useEffect } from "react";
import {
  FileArchive,
  FileText,
  FileImage,
  File,
  MoreHorizontal,
  DownloadCloud,
  Sparkles,
  ExternalLink,
  FolderOpen,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { ProgressBar } from "./components/common/ProgressBar";

// Download history interface matching the backend
interface DownloadHistoryItem {
  id: string;
  fileName: string;
  filePath: string;
  createdAt: number;
  exists?: boolean;
  status?: "downloading" | "completed" | "cancelled" | "error";
  progress?: number; // 0-100
  totalBytes?: number;
  receivedBytes?: number;
  startTime?: number;
}

// Enhanced download item with UI properties
interface DownloadItemUI extends DownloadHistoryItem {
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  size: string;
  date: string;
  context: string;
  isDownloading?: boolean;
}

// Helper functions
const getFileIcon = (
  fileName: string,
): React.ComponentType<{ className?: string }> => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return FileArchive;
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "svg":
    case "webp":
      return FileImage;
    case "pdf":
    case "doc":
    case "docx":
    case "txt":
    case "rtf":
      return FileText;
    default:
      return File;
  }
};

const getFileIconColor = (fileName: string): string => {
  const ext = fileName.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz":
      return "text-purple-600";
    case "jpg":
    case "jpeg":
    case "png":
    case "gif":
    case "svg":
    case "webp":
      return "text-blue-600";
    case "pdf":
      return "text-red-600";
    case "doc":
    case "docx":
    case "txt":
    case "rtf":
      return "text-gray-600";
    default:
      return "text-gray-500";
  }
};

const formatFileSize = (bytes?: number): string => {
  if (!bytes || bytes === 0) return "Unknown size";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Yesterday, ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else {
    return date.toLocaleDateString();
  }
};

const generateContext = (fileName: string): string => {
  // Simple context generation based on file type/name
  const ext = fileName.split(".").pop()?.toLowerCase();
  const name = fileName.toLowerCase();

  if (name.includes("report") || name.includes("document")) {
    return "Business document";
  } else if (ext === "zip" || ext === "rar") {
    return "Archive file";
  } else if (["jpg", "jpeg", "png", "gif"].includes(ext || "")) {
    return "Image file";
  } else if (name.includes("logo") || name.includes("brand")) {
    return "Brand asset";
  } else {
    return "Downloaded file";
  }
};

// Reusable Components
const AgentContextPill = ({ text }: { text: string }) => (
  <div className="flex items-center space-x-1.5 px-2.5 py-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded-full">
    <Sparkles className="w-3.5 h-3.5" />
    <span>{text}</span>
  </div>
);

const DownloadItem = ({
  download,
  onOpenFile,
  onShowInFolder,
  onRemoveFromHistory,
  isOldestDownloading,
}: {
  download: DownloadItemUI;
  onOpenFile: (filePath: string) => void;
  onShowInFolder: (filePath: string) => void;
  onRemoveFromHistory: (id: string) => void;
  isOldestDownloading?: boolean;
}) => {
  const Icon = download.icon;
  const [showActions, setShowActions] = useState(false);

  return (
    <div className="flex items-center justify-between p-3 border-b border-gray-200/80 last:border-b-0 hover:bg-gray-50/80 transition-colors duration-150">
      <div className="flex items-center space-x-4">
        <Icon className={`w-7 h-7 flex-shrink-0 ${download.iconColor}`} />
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <p className="font-semibold text-gray-800 text-sm">
              {download.fileName}
            </p>
            {download.status === "downloading" && (
              <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded-full">
                Downloading
              </span>
            )}
          </div>
          {download.status === "downloading" &&
          download.progress !== undefined &&
          isOldestDownloading ? (
            <ProgressBar
              value={download.progress}
              title="Download Progress"
              label={download.fileName}
            />
          ) : (
            <p className="text-xs text-gray-500">
              {download.size} - {download.date}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <AgentContextPill text={download.context} />
        <div className="relative">
          <button
            onClick={() => setShowActions(!showActions)}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200 rounded-full transition-colors"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showActions && (
            <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
              <button
                onClick={() => {
                  onOpenFile(download.filePath);
                  setShowActions(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                Open File
              </button>
              <button
                onClick={() => {
                  onShowInFolder(download.filePath);
                  setShowActions(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                <FolderOpen className="w-4 h-4 mr-2" />
                Show in Folder
              </button>
              <button
                onClick={() => {
                  onRemoveFromHistory(download.id);
                  setShowActions(false);
                }}
                className="flex items-center w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Remove from History
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Main App Component
export default function App() {
  const [downloads, setDownloads] = useState<DownloadItemUI[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  // Load download history when component mounts
  useEffect(() => {
    // Initial load with loading indicator
    loadDownloadHistory(true);

    // Listen for real-time updates pushed from the main process
    const handleUpdate = (): void => {
      // Subsequent loads should not show the main loading spinner to prevent flickering
      loadDownloadHistory(false);
    };
    window.electron?.ipcRenderer.on("downloads:history-updated", handleUpdate);

    // Cleanup listener on component unmount
    return () => {
      window.electron?.ipcRenderer.removeListener(
        "downloads:history-updated",
        handleUpdate,
      );
    };
  }, []);

  const loadDownloadHistory = async (isInitialLoad = false) => {
    try {
      if (isInitialLoad) setLoading(true);
      setError(null);

      if (window.electron?.ipcRenderer) {
        const history: DownloadHistoryItem[] =
          await window.electron.ipcRenderer.invoke("downloads.getHistory");

        // Transform raw history items to UI items
        const uiItems: DownloadItemUI[] = history.map(item => ({
          ...item,
          icon: getFileIcon(item.fileName),
          iconColor: getFileIconColor(item.fileName),
          size: formatFileSize(item.totalBytes),
          date: formatDate(item.createdAt),
          context: generateContext(item.fileName),
          isDownloading: item.status === "downloading",
        }));

        // Sort by status (downloading first) then by creation date (oldest first for downloads in progress)
        uiItems.sort((a, b) => {
          // Downloads in progress come first
          if (a.status === "downloading" && b.status !== "downloading")
            return -1;
          if (a.status !== "downloading" && b.status === "downloading")
            return 1;

          // For downloads in progress, sort by creation date (oldest first)
          if (a.status === "downloading" && b.status === "downloading") {
            return a.createdAt - b.createdAt;
          }

          // For completed downloads, sort by creation date (newest first)
          return b.createdAt - a.createdAt;
        });

        setDownloads(uiItems);
      }
    } catch (err) {
      console.error("Failed to load download history:", err);
      setError("Failed to load download history");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  const handleCloseDialog = () => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke("dialog:close", "downloads");
    }
  };

  const handleOpenFile = async (filePath: string) => {
    try {
      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke(
          "downloads.openFile",
          filePath,
        );
        if (result.error) {
          setError(`Failed to open file: ${result.error}`);
        }
      }
    } catch (err) {
      console.error("Failed to open file:", err);
      setError("Failed to open file");
    }
  };

  const handleShowInFolder = async (filePath: string) => {
    try {
      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke(
          "downloads.showFileInFolder",
          filePath,
        );
        if (result.error) {
          setError(`Failed to show file in folder: ${result.error}`);
        }
      }
    } catch (err) {
      console.error("Failed to show file in folder:", err);
      setError("Failed to show file in folder");
    }
  };

  const handleRemoveFromHistory = async (id: string) => {
    try {
      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke(
          "downloads.removeFromHistory",
          id,
        );
        if (result.success) {
          // Remove from local state
          setDownloads(prev => prev.filter(d => d.id !== id));
        } else {
          setError("Failed to remove from history");
        }
      }
    } catch (err) {
      console.error("Failed to remove from history:", err);
      setError("Failed to remove from history");
    }
  };

  const handleClearHistory = async () => {
    try {
      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke(
          "downloads.clearHistory",
        );
        if (result.success) {
          setDownloads([]);
          setShowClearConfirm(false);
        } else {
          setError("Failed to clear history");
        }
      }
    } catch (err) {
      console.error("Failed to clear history:", err);
      setError("Failed to clear history");
    }
  };

  return (
    <div className="dialog-window h-screen w-full font-sans text-black">
      <div className="w-full h-full flex flex-col overflow-hidden bg-white">
        {/* Title Bar */}
        <div className="h-[52px] border-b border-gray-200 flex-shrink-0 flex items-center justify-between px-4">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 rounded-full bg-[#FF5F57]"></div>
            <div className="w-3 h-3 rounded-full bg-[#FEBC2E]"></div>
            <div className="w-3 h-3 rounded-full bg-[#28C840]"></div>
          </div>
          <h1 className="font-semibold text-base text-gray-800">Downloads</h1>
          <div className="flex items-center gap-2">
            {downloads.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Clear All
              </button>
            )}
            <button
              onClick={handleCloseDialog}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              Close
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-sm">
            {error}
            <button
              onClick={() => setError(null)}
              className="ml-2 text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 bg-white overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-full text-gray-500">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p>Loading downloads...</p>
              </div>
            </div>
          ) : downloads.length > 0 ? (
            <div className="p-2">
              {(() => {
                // Find the oldest downloading item
                const downloadingItems = downloads.filter(
                  d => d.status === "downloading",
                );
                const oldestDownloadingId =
                  downloadingItems.length > 0
                    ? downloadingItems.sort(
                        (a, b) => a.createdAt - b.createdAt,
                      )[0].id
                    : null;

                return downloads.map(download => (
                  <DownloadItem
                    key={download.id}
                    download={download}
                    onOpenFile={handleOpenFile}
                    onShowInFolder={handleShowInFolder}
                    onRemoveFromHistory={handleRemoveFromHistory}
                    isOldestDownloading={download.id === oldestDownloadingId}
                  />
                ));
              })()}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 p-16">
              <DownloadCloud className="w-16 h-16 mb-4 text-gray-400" />
              <h2 className="text-xl font-semibold text-gray-700">
                No Recent Downloads
              </h2>
              <p className="mt-1 text-sm">
                Files you download will appear here.
              </p>
            </div>
          )}
        </div>

        {/* Clear All Confirmation Modal */}
        {showClearConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm w-full mx-4">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-600" />
                <h3 className="text-lg font-semibold text-gray-800">
                  Clear Download History
                </h3>
              </div>
              <p className="text-gray-600 mb-6">
                Are you sure you want to clear all download history? This action
                cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowClearConfirm(false)}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleClearHistory}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
