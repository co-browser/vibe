import { useState, useEffect, useCallback } from "react";
import type { PasswordEntry } from "../types/passwords";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("passwords-hook");

export function usePasswords() {
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [filteredPasswords, setFilteredPasswords] = useState<PasswordEntry[]>(
    [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [selectedPassword, setSelectedPassword] =
    useState<PasswordEntry | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [importSources, setImportSources] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState<"success" | "error" | "info">(
    "info",
  );
  const [isImporting, setIsImporting] = useState(false);
  const [importedSources, setImportedSources] = useState<Set<string>>(
    new Set(),
  );
  const [progressValue, setProgressValue] = useState(0);
  const [progressText, setProgressText] = useState("");

  const showMessage = useCallback(
    (message: string, type: "success" | "error" | "info" = "success") => {
      setStatusMessage(message);
      setStatusType(type);
      setTimeout(() => setStatusMessage(""), 5000);
    },
    [],
  );

  const loadPasswords = useCallback(async () => {
    try {
      setLoading(true);
      if (window.electron?.ipcRenderer) {
        const result =
          await window.electron.ipcRenderer.invoke("passwords:get-all");
        if (result.success) {
          setPasswords(result.passwords || []);
        } else {
          showMessage("Failed to load passwords", "error");
        }
      }
    } catch {
      showMessage("Failed to load passwords", "error");
    } finally {
      setLoading(false);
    }
  }, [showMessage]);

  const loadImportSources = useCallback(async () => {
    try {
      if (window.electron?.ipcRenderer) {
        const result = await window.electron.ipcRenderer.invoke(
          "passwords:get-sources",
        );
        if (result.success) {
          setImportSources(result.sources || []);
        }
      }
    } catch {
      logger.error("Failed to load import sources");
    }
  }, []);

  const handleImportFromChrome = useCallback(async () => {
    if (importedSources.has("chrome")) {
      showMessage(
        'Chrome passwords already imported. Use "Clear All" to re-import.',
        "info",
      );
      return;
    }

    try {
      setIsImporting(true);
      setProgressValue(20);
      setProgressText("Connecting to Chrome database...");

      const result = await window.electron.ipcRenderer.invoke(
        "passwords:import-chrome",
      );

      if (result && result.success) {
        const totalPasswords = result.count || 0;
        const progressPerPassword = Math.min(0.54, (74 / Math.max(totalPasswords, 1)));
        let currentProgress = 20;
        
        for (let i = 0; i < totalPasswords; i++) {
          if (currentProgress < 94) {
            currentProgress += progressPerPassword;
          } else {
            const remaining = 94 - currentProgress;
            const quadraticSlowdown = remaining * Math.pow((totalPasswords - i) / totalPasswords, 2);
            currentProgress += quadraticSlowdown;
          }
          
          setProgressValue(Math.min(currentProgress, 94));
          setProgressText(`Processing password ${i + 1} of ${totalPasswords}...`);
          
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        setProgressValue(100);
        setProgressText("Import complete!");
        showMessage(
          `Successfully imported ${result.count || 0} passwords from Chrome`,
        );
        setImportedSources(prev => new Set(prev).add("chrome"));
        await loadPasswords();
        await loadImportSources();
      } else {
        showMessage(result?.error || "Failed to import from Chrome", "error");
      }
    } catch (error) {
      showMessage(
        `Failed to import from Chrome: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsImporting(false);
      setProgressValue(0);
      setProgressText("");
    }
  }, [importedSources, loadPasswords, loadImportSources, showMessage]);

  useEffect(() => {
    loadPasswords();
    loadImportSources();
  }, [loadPasswords, loadImportSources]);

  useEffect(() => {
    if (!searchQuery) {
      setFilteredPasswords(passwords);
    } else {
      const lowercasedQuery = searchQuery.toLowerCase();
      const filtered = passwords.filter(
        p =>
          p.url.toLowerCase().includes(lowercasedQuery) ||
          p.username.toLowerCase().includes(lowercasedQuery),
      );
      setFilteredPasswords(filtered);
    }
  }, [passwords, searchQuery]);

  useEffect(() => {
    const handleChromeImportTrigger = () => handleImportFromChrome();
    window.electron?.ipcRenderer.on(
      "trigger-chrome-import",
      handleChromeImportTrigger,
    );
    return () => {
      window.electron?.ipcRenderer.removeListener(
        "trigger-chrome-import",
        handleChromeImportTrigger,
      );
    };
  }, [handleImportFromChrome]);

  const handleComprehensiveImportFromChrome = useCallback(async () => {
    if (importedSources.has("chrome-all-profiles")) {
      showMessage(
        'Chrome data already imported. Use "Clear All" to re-import.',
        "info",
      );
      return;
    }

    try {
      setIsImporting(true);
      setProgressValue(10);
      setProgressText(
        "Starting comprehensive Chrome import from all profiles...",
      );

      const result = await window.electron.ipcRenderer.invoke(
        "chrome:import-all-profiles",
      );

      if (result && result.success) {
        const totalPasswords = result.passwordCount || 0;
        const progressPerPassword = Math.min(0.54, (84 / Math.max(totalPasswords, 1)));
        let currentProgress = 10;
        
        for (let i = 0; i < totalPasswords; i++) {
          if (currentProgress < 94) {
            currentProgress += progressPerPassword;
          } else {
            const remaining = 94 - currentProgress;
            const quadraticSlowdown = remaining * Math.pow((totalPasswords - i) / totalPasswords, 2);
            currentProgress += quadraticSlowdown;
          }
          
          setProgressValue(Math.min(currentProgress, 94));
          setProgressText(`Processing password ${i + 1} of ${totalPasswords}...`);
          
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        setProgressValue(100);
        setProgressText("Import complete!");
        showMessage(
          `Successfully imported from all Chrome profiles: ${result.passwordCount || 0} passwords, ${result.bookmarkCount || 0} bookmarks, ${result.historyCount || 0} history entries`,
        );
        setImportedSources(prev => new Set(prev).add("chrome-all-profiles"));
        await loadPasswords();
        await loadImportSources();
      } else {
        showMessage(result?.error || "Failed to import from Chrome", "error");
      }
    } catch (error) {
      showMessage(
        `Failed to import from Chrome: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsImporting(false);
      setProgressValue(0);
      setProgressText("");
    }
  }, [importedSources, loadPasswords, loadImportSources, showMessage]);

  const handleImportAllChromeProfiles = useCallback(async () => {
    if (importedSources.has("chrome-all-profiles")) {
      showMessage(
        'All Chrome profiles already imported. Use "Clear All" to re-import.',
        "info",
      );
      return;
    }

    try {
      setIsImporting(true);
      setProgressValue(10);
      setProgressText("Starting import from all Chrome profiles...");

      const result = await window.electron.ipcRenderer.invoke(
        "chrome:import-all-profiles",
      );

      if (result && result.success) {
        const totalPasswords = result.passwordCount || 0;
        const progressPerPassword = Math.min(0.54, (84 / Math.max(totalPasswords, 1)));
        let currentProgress = 10;
        
        for (let i = 0; i < totalPasswords; i++) {
          if (currentProgress < 94) {
            currentProgress += progressPerPassword;
          } else {
            const remaining = 94 - currentProgress;
            const quadraticSlowdown = remaining * Math.pow((totalPasswords - i) / totalPasswords, 2);
            currentProgress += quadraticSlowdown;
          }
          
          setProgressValue(Math.min(currentProgress, 94));
          setProgressText(`Processing password ${i + 1} of ${totalPasswords}...`);
          
          await new Promise(resolve => setTimeout(resolve, 20));
        }
        
        setProgressValue(100);
        setProgressText("Import complete!");
        showMessage(
          `Successfully imported from all Chrome profiles: ${result.passwordCount || 0} passwords, ${result.bookmarkCount || 0} bookmarks, ${result.historyCount || 0} history entries`,
        );
        setImportedSources(prev => new Set(prev).add("chrome-all-profiles"));
        await loadPasswords();
        await loadImportSources();
      } else {
        showMessage(
          result?.error || "Failed to import from Chrome profiles",
          "error",
        );
      }
    } catch (error) {
      showMessage(
        `Failed to import from Chrome profiles: ${error instanceof Error ? error.message : "Unknown error"}`,
        "error",
      );
    } finally {
      setIsImporting(false);
      setProgressValue(0);
      setProgressText("");
    }
  }, [importedSources, loadPasswords, loadImportSources, showMessage]);

  const handleImportChromeBookmarks = useCallback(async () => {
    // Implementation can be moved here...
  }, []);

  const handleImportChromeHistory = useCallback(async () => {
    // Implementation can be moved here...
  }, []);

  const handleImportChromeAutofill = useCallback(async () => {
    // Implementation can be moved here...
  }, []);

  const handleExportPasswords = useCallback(async () => {
    try {
      const result =
        await window.electron.ipcRenderer.invoke("passwords:export");
      if (result.success) {
        showMessage("Passwords exported successfully");
      } else {
        showMessage(result.error || "Failed to export passwords", "error");
      }
    } catch {
      showMessage("Failed to export passwords", "error");
    }
  }, [showMessage]);

  const handleDeletePassword = useCallback(
    async (passwordId: string) => {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          "passwords:delete",
          passwordId,
        );
        if (result.success) {
          showMessage("Password deleted successfully");
          await loadPasswords();
        } else {
          showMessage("Failed to delete password", "error");
        }
      } catch {
        showMessage("Failed to delete password", "error");
      }
    },
    [loadPasswords, showMessage],
  );

  const handleClearAllPasswords = useCallback(async () => {
    try {
      const result = await window.electron.ipcRenderer.invoke(
        "passwords:clear-all",
      );
      if (result.success) {
        showMessage("All passwords cleared");
        setPasswords([]);
        setImportSources([]);
        setImportedSources(new Set());
      } else {
        showMessage("Failed to clear passwords", "error");
      }
    } catch {
      showMessage("Failed to clear passwords", "error");
    }
  }, [showMessage]);

  const handleRemoveSource = useCallback(
    async (source: string) => {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          "passwords:remove-source",
          source,
        );
        if (result.success) {
          showMessage(`Removed passwords from ${source}`);
          setImportedSources(prev => {
            const updated = new Set(prev);
            updated.delete(source);
            return updated;
          });
          await loadPasswords();
          await loadImportSources();
        } else {
          showMessage("Failed to remove import source", "error");
        }
      } catch {
        showMessage("Failed to remove import source", "error");
      }
    },
    [loadPasswords, loadImportSources, showMessage],
  );

  const handleViewPassword = useCallback(
    async (password: PasswordEntry) => {
      try {
        const result = await window.electron.ipcRenderer.invoke(
          "passwords:decrypt",
          password.id,
        );
        if (result.success) {
          setSelectedPassword({
            ...password,
            password: result.decryptedPassword,
          });
          setIsPasswordModalVisible(true);
          setShowPassword(false);
        } else {
          showMessage("Failed to decrypt password", "error");
        }
      } catch {
        showMessage("Failed to decrypt password", "error");
      }
    },
    [showMessage],
  );

  const copyToClipboard = useCallback(
    (text: string) => {
      navigator.clipboard
        .writeText(text)
        .then(() => showMessage("Copied to clipboard"))
        .catch(() => showMessage("Failed to copy to clipboard", "error"));
    },
    [showMessage],
  );

  return {
    passwords,
    filteredPasswords,
    searchQuery,
    setSearchQuery,
    isPasswordModalVisible,
    setIsPasswordModalVisible,
    selectedPassword,
    showPassword,
    setShowPassword,
    importSources,
    loading,
    statusMessage,
    statusType,
    isImporting,
    importedSources,
    progressValue,
    progressText,
    handleImportFromChrome,
    handleComprehensiveImportFromChrome,
    handleImportAllChromeProfiles,
    handleImportChromeBookmarks,
    handleImportChromeHistory,
    handleImportChromeAutofill,
    handleExportPasswords,
    handleDeletePassword,
    handleClearAllPasswords,
    handleRemoveSource,
    handleViewPassword,
    copyToClipboard,
  };
}
