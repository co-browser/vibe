import React, { useEffect } from "react";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  // Show/hide dialog based on isOpen state
  useEffect(() => {
    if (isOpen) {
      window.electron?.ipcRenderer
        .invoke("dialog:show-settings")
        .catch(error => {
          console.error("Failed to show settings dialog:", error);
        });
    }
  }, [isOpen]);

  // Listen for dialog close events
  useEffect(() => {
    const handleDialogClosed = (_event: any, dialogType: string) => {
      if (dialogType === "settings") {
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
