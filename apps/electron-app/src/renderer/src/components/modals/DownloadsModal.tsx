import React, { useEffect } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("DownloadsModal");

interface DownloadsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadsModal: React.FC<DownloadsModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Show/hide dialog based on isOpen state
  useEffect(() => {
    if (isOpen) {
      window.electron?.ipcRenderer
        .invoke("dialog:show-downloads")
        .catch(error => {
          logger.error("Failed to show downloads dialog:", error);
        });
    }
  }, [isOpen]);

  // Listen for dialog close events
  useEffect(() => {
    const handleDialogClosed = (_event: any, dialogType: string) => {
      if (dialogType === "downloads") {
        onClose();
      }
    };

    window.electron?.ipcRenderer.on("dialog-closed", handleDialogClosed);

    return () => {
      window.electron?.ipcRenderer.removeListener(
        "dialog-closed",
        handleDialogClosed,
      );
    };
  }, [onClose]);

  // Don't render anything in React tree - dialog is handled by main process
  return null;
};
