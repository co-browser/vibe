/**
 * React hook for handling file drag and drop operations
 * Provides Chrome-like visual feedback with green "+" cursor
 */

import { useEffect, useRef, useCallback, useState } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("useFileDrop");

export interface DropZoneConfig {
  accept?: string[]; // File extensions or mime types
  maxFiles?: number;
  maxSize?: number; // in bytes (default 100MB)
  multiple?: boolean;
  onDrop?: (files: File[]) => void;
  onDragEnter?: () => void;
  onDragLeave?: () => void;
  onError?: (error: string) => void;
}

export interface DropZoneState {
  isDragOver: boolean;
  isDragActive: boolean;
  isProcessing: boolean;
  error: string | null;
}

export function useFileDrop(config: DropZoneConfig = {}) {
  const {
    accept = [],
    maxFiles = 10,
    maxSize = 100 * 1024 * 1024, // 100MB
    multiple = true,
    onDrop,
    onDragEnter,
    onDragLeave,
    onError,
  } = config;

  const [state, setState] = useState<DropZoneState>({
    isDragOver: false,
    isDragActive: false,
    isProcessing: false,
    error: null,
  });

  const dragCounterRef = useRef(0);
  const dropZoneRef = useRef<HTMLElement | null>(null);

  // Create global drop overlay
  const createDropOverlay = useCallback(() => {
    const existingOverlay = document.getElementById("vibe-global-drop-overlay");
    if (existingOverlay) return existingOverlay;

    const overlay = document.createElement("div");
    overlay.id = "vibe-global-drop-overlay";
    overlay.className = "vibe-drop-overlay";
    overlay.innerHTML = `
      <div class="vibe-drop-message">
        <div class="vibe-drop-icon">📁</div>
        <div class="vibe-drop-text">Drop files here</div>
        <div class="vibe-drop-hint">
          ${accept.length > 0 ? `Accepts: ${accept.join(", ")}` : "All file types accepted"}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    return overlay;
  }, [accept]);

  const removeDropOverlay = useCallback(() => {
    const overlay = document.getElementById("vibe-global-drop-overlay");
    if (overlay) {
      overlay.remove();
    }
  }, []);

  // Custom cursor for drag operations
  const updateCursor = useCallback((isDragging: boolean) => {
    if (isDragging) {
      // Create custom cursor with green "+" icon (Chrome-like)
      document.body.style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><circle cx='12' cy='12' r='10' fill='%23059669' stroke='%23ffffff' stroke-width='2'/><path d='M12 8v8M8 12h8' stroke='%23ffffff' stroke-width='2' stroke-linecap='round'/></svg>") 12 12, copy`;
    } else {
      document.body.style.cursor = "";
    }
  }, []);

  const validateFiles = useCallback(
    (files: FileList): { valid: File[]; errors: string[] } => {
      const valid: File[] = [];
      const errors: string[] = [];

      if (files.length > maxFiles) {
        errors.push(`Too many files. Maximum allowed: ${maxFiles}`);
        return { valid, errors };
      }

      Array.from(files).forEach(file => {
        // Check file size
        if (file.size > maxSize) {
          errors.push(
            `${file.name} is too large. Maximum size: ${formatFileSize(maxSize)}`,
          );
          return;
        }

        // Check file type if restrictions specified
        if (accept.length > 0) {
          const extension = "." + file.name.split(".").pop()?.toLowerCase();
          const isAccepted = accept.some(acceptType => {
            if (acceptType.startsWith(".")) {
              return extension === acceptType;
            }
            if (acceptType.includes("/")) {
              return (
                file.type.startsWith(acceptType) || file.type === acceptType
              );
            }
            return false;
          });

          if (!isAccepted) {
            errors.push(
              `${file.name} type not supported. Accepted: ${accept.join(", ")}`,
            );
            return;
          }
        }

        valid.push(file);
      });

      return { valid, errors };
    },
    [accept, maxFiles, maxSize],
  );

  const handleDragEnter = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current++;

      if (dragCounterRef.current === 1) {
        setState(prev => ({ ...prev, isDragActive: true, error: null }));
        updateCursor(true);
        createDropOverlay();
        onDragEnter?.();
        logger.debug("Drag enter - files detected");
      }
    },
    [createDropOverlay, updateCursor, onDragEnter],
  );

  const handleDragLeave = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current--;

      if (dragCounterRef.current === 0) {
        setState(prev => ({ ...prev, isDragActive: false, isDragOver: false }));
        updateCursor(false);
        removeDropOverlay();
        onDragLeave?.();
        logger.debug("Drag leave - files left window");
      }
    },
    [removeDropOverlay, updateCursor, onDragLeave],
  );

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Chrome-like behavior: show green "+" cursor
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = "copy";
    }

    setState(prev => ({ ...prev, isDragOver: true }));
  }, []);

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();

      dragCounterRef.current = 0;
      setState(prev => ({
        ...prev,
        isDragActive: false,
        isDragOver: false,
        isProcessing: true,
      }));
      updateCursor(false);
      removeDropOverlay();

      try {
        const files = e.dataTransfer?.files;
        if (!files || files.length === 0) {
          throw new Error("No files detected");
        }

        // Handle single file mode
        if (!multiple && files.length > 1) {
          throw new Error("Only one file allowed");
        }

        const { valid, errors } = validateFiles(files);

        if (errors.length > 0) {
          throw new Error(errors.join("; "));
        }

        if (valid.length === 0) {
          throw new Error("No valid files to process");
        }

        logger.info(`Processing ${valid.length} dropped files`);
        onDrop?.(valid);

        setState(prev => ({ ...prev, isProcessing: false, error: null }));
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to process files";
        logger.error("Drop error:", errorMessage);
        setState(prev => ({
          ...prev,
          isProcessing: false,
          error: errorMessage,
        }));
        onError?.(errorMessage);
      }
    },
    [multiple, validateFiles, updateCursor, removeDropOverlay, onDrop, onError],
  );

  // Setup global event listeners
  useEffect(() => {
    const handleGlobalDragEnter = (e: DragEvent) => {
      // Only handle file drops
      if (e.dataTransfer?.types.includes("Files")) {
        handleDragEnter(e);
      }
    };

    const handleGlobalDragLeave = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        handleDragLeave(e);
      }
    };

    document.addEventListener("dragenter", handleGlobalDragEnter);
    document.addEventListener("dragleave", handleGlobalDragLeave);
    document.addEventListener("dragover", handleDragOver);
    document.addEventListener("drop", handleDrop);

    return () => {
      document.removeEventListener("dragenter", handleGlobalDragEnter);
      document.removeEventListener("dragleave", handleGlobalDragLeave);
      document.removeEventListener("dragover", handleDragOver);
      document.removeEventListener("drop", handleDrop);

      // Cleanup on unmount
      updateCursor(false);
      removeDropOverlay();
    };
  }, [
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    updateCursor,
    removeDropOverlay,
  ]);

  // Create drop zone props for specific elements
  const getDropZoneProps = useCallback(
    (element?: HTMLElement) => {
      if (element) {
        dropZoneRef.current = element;
      }

      return {
        onDragEnter: handleDragEnter,
        onDragLeave: handleDragLeave,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
        className: state.isDragOver
          ? "vibe-drop-zone drag-over"
          : "vibe-drop-zone",
        "data-drop-zone": "true",
      };
    },
    [
      handleDragEnter,
      handleDragLeave,
      handleDragOver,
      handleDrop,
      state.isDragOver,
    ],
  );

  // Helper for manual file input
  const openFileDialog = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = multiple;

    if (accept.length > 0) {
      input.accept = accept.join(",");
    }

    input.onchange = e => {
      const files = (e.target as HTMLInputElement).files;
      if (files && files.length > 0) {
        const { valid, errors } = validateFiles(files);
        if (errors.length > 0) {
          onError?.(errors.join("; "));
        } else {
          onDrop?.(valid);
        }
      }
    };

    input.click();
  }, [multiple, accept, validateFiles, onDrop, onError]);

  return {
    ...state,
    getDropZoneProps,
    openFileDialog,
  };
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
