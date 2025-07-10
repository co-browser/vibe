/**
 * FileDropZone Component
 * Provides visual drop zone with Chrome-like feedback
 */

import React, { useRef, useEffect } from "react";
import { Upload, File, Image, FileText, AlertCircle } from "lucide-react";
import { useFileDrop, DropZoneConfig } from "../../hooks/useFileDrop";

interface FileDropZoneProps extends DropZoneConfig {
  className?: string;
  children?: React.ReactNode;
  showUploadButton?: boolean;
  placeholder?: string;
  style?: React.CSSProperties;
}

export function FileDropZone({
  className = "",
  children,
  showUploadButton = true,
  placeholder = "Drop files here or click to browse",
  style,
  ...dropConfig
}: FileDropZoneProps) {
  const dropZoneRef = useRef<HTMLDivElement>(null);

  const {
    isDragOver,
    isDragActive,
    isProcessing,
    error,
    getDropZoneProps,
    openFileDialog,
  } = useFileDrop(dropConfig);

  useEffect(() => {
    if (dropZoneRef.current) {
      dropZoneRef.current.classList.toggle("drag-over", isDragOver);
    }
  }, [isDragOver]);

  const getFileIcon = (accept: string[] = []) => {
    if (accept.some(type => type.startsWith("image/"))) {
      return <Image className="w-8 h-8 text-blue-500" />;
    }
    if (
      accept.some(type => type.startsWith("text/") || type.includes("document"))
    ) {
      return <FileText className="w-8 h-8 text-green-500" />;
    }
    return <File className="w-8 h-8 text-gray-500" />;
  };

  const dropZoneProps = getDropZoneProps();

  return (
    <div
      ref={dropZoneRef}
      className={`vibe-drop-zone ${className} ${isDragOver ? "drag-over" : ""} ${isDragActive ? "drag-active" : ""}`}
      style={
        {
          position: "relative",
          border: "2px dashed #d1d5db",
          borderRadius: "12px",
          padding: "24px",
          textAlign: "center",
          backgroundColor: isDragOver
            ? "rgba(59, 130, 246, 0.05)"
            : "transparent",
          borderColor: isDragOver ? "#3b82f6" : "#d1d5db",
          transition: "all 0.2s ease",
          cursor: "pointer",
          ...style,
        } as React.CSSProperties
      }
      {...(dropZoneProps as any)}
      onClick={showUploadButton ? openFileDialog : undefined}
    >
      {/* Global drag overlay is handled by the hook */}

      {children ? (
        children
      ) : (
        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <div className="flex flex-col items-center gap-2">
              <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full"></div>
              <span className="text-sm text-gray-600">Processing files...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center gap-2 text-red-500">
              <AlertCircle className="w-8 h-8" />
              <span className="text-sm">{error}</span>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {getFileIcon(dropConfig.accept)}
                <Upload className="w-6 h-6 text-gray-400" />
              </div>

              <div className="space-y-1">
                <p className="text-base font-medium text-gray-700">
                  {placeholder}
                </p>

                {dropConfig.accept && dropConfig.accept.length > 0 && (
                  <p className="text-sm text-gray-500">
                    Accepts: {dropConfig.accept.join(", ")}
                  </p>
                )}

                {dropConfig.maxSize && (
                  <p className="text-xs text-gray-400">
                    Max size: {formatFileSize(dropConfig.maxSize)}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Visual feedback overlay for local drop zone */}
      {isDragOver && (
        <div
          className="absolute inset-0 bg-blue-50 border-2 border-dashed border-blue-400 rounded-12 flex items-center justify-center"
          style={{
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            pointerEvents: "none",
          }}
        >
          <div className="text-blue-600 font-medium">Drop files here</div>
        </div>
      )}
    </div>
  );
}

// File preview component for dropped files
interface FilePreviewProps {
  file: File;
  onRemove?: () => void;
}

export function FilePreview({ file, onRemove }: FilePreviewProps) {
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => setPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  }, [file]);

  const getFileIcon = () => {
    if (file.type.startsWith("image/")) {
      return preview ? (
        <img
          src={preview}
          alt={file.name}
          className="w-10 h-10 object-cover rounded"
        />
      ) : (
        <Image className="w-10 h-10 text-blue-500" />
      );
    }
    if (file.type.startsWith("text/") || file.type.includes("document")) {
      return <FileText className="w-10 h-10 text-green-500" />;
    }
    return <File className="w-10 h-10 text-gray-500" />;
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      {getFileIcon()}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {file.name}
        </p>
        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
      </div>

      {onRemove && (
        <button
          onClick={onRemove}
          className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        >
          <AlertCircle className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
