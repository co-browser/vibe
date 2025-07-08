import { useState, useEffect, lazy, Suspense, useCallback } from "react";
import React from "react";
import { usePasswords } from "./hooks/usePasswords";
import {
  User,
  Sparkles,
  Bell,
  Command,
  Puzzle,
  Lock,
  ChevronLeft,
  ChevronRight,
  Download,
  Search,
  Eye,
  EyeOff,
  Copy,
  FileDown,
  X,
  Loader2,
  Wallet,
  CheckCircle,
  AlertCircle,
  Info,
  Key,
} from "lucide-react";
import { ProgressBar } from "./components/common/ProgressBar";
import { usePrivyAuth } from "./hooks/usePrivyAuth";
import { UserPill } from "./components/ui/UserPill";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("settings");

// Type declaration for webkit corner smoothing
declare module "react" {
  interface CSSProperties {
    "-webkit-corner-smoothing"?: string;
    "-webkit-app-region"?: string;
  }
}

// Loading spinner component
const LoadingSpinner = () => (
  <div className="flex items-center justify-center h-full">
    <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
  </div>
);

// Floating Toast component using Lucide icons
const FloatingToast = ({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) => {
  const getIcon = () => {
    switch (type) {
      case "success":
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case "error":
        return <AlertCircle className="h-5 w-5 text-red-600" />;
      case "info":
        return <Info className="h-5 w-5 text-blue-600" />;
      default:
        return <Info className="h-5 w-5 text-blue-600" />;
    }
  };

  const getColors = () => {
    switch (type) {
      case "success":
        return "bg-green-50 border-green-200 text-green-800";
      case "error":
        return "bg-red-50 border-red-200 text-red-800";
      case "info":
        return "bg-blue-50 border-blue-200 text-blue-800";
      default:
        return "bg-blue-50 border-blue-200 text-blue-800";
    }
  };

  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className="fixed top-4 right-4 z-50 animate-in slide-in-from-top-2 duration-300">
      <div
        className={`
        flex items-center gap-3 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
        ${getColors()}
        max-w-sm min-w-[300px]
      `}
      >
        {getIcon()}
        <span className="flex-1 text-sm font-medium">{message}</span>
        <button
          onClick={onClose}
          className="p-1 hover:bg-black/5 rounded transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// Lazy load all settings components
const AppleAccountsSettings = lazy(() =>
  Promise.resolve({ default: AppleAccountsSettingsComponent }),
);
const PasswordsSettings = lazy(() =>
  Promise.resolve({
    default: (props: { preloadedData?: any }) => (
      <PasswordsSettingsComponent {...props} />
    ),
  }),
);
const NotificationsSettings = lazy(() =>
  Promise.resolve({ default: NotificationsSettingsComponent }),
);
const ShortcutsSettings = lazy(() =>
  Promise.resolve({ default: ShortcutsSettingsComponent }),
);
const ComponentsSettings = lazy(() =>
  Promise.resolve({ default: ComponentsSettingsComponent }),
);
const APIKeysSettings = lazy(() =>
  Promise.resolve({ default: APIKeysSettingsComponent }),
);

// Main App Component
export default function Settings() {
  const [activeTab, setActiveTab] = useState("apple-accounts");

  // Preload password data in background regardless of active tab
  // This ensures instant switching to passwords tab
  const passwordsData = usePasswords(true);

  const handleTabChange = useCallback(
    (newTab: string) => {
      if (newTab === activeTab) return;

      // Use startTransition for non-urgent updates
      React.startTransition(() => {
        setActiveTab(newTab);
      });
    },
    [activeTab],
  );

  const toolbarButtons = [
    { id: "apple-accounts", label: "Accounts", icon: User },
    {
      id: "passwords",
      label: "Passwords",
      icon: Lock,
      // Show loading indicator if passwords are still loading
      loading:
        passwordsData.loading && passwordsData.filteredPasswords.length === 0,
    },
    { id: "intelligence", label: "Agents", icon: Sparkles },
    { id: "behaviors", label: "API Keys", icon: Key },
    { id: "notifications", label: "Notifications", icon: Bell },
    { id: "shortcuts", label: "Shortcuts", icon: Command },
    { id: "components", label: "Marketplace", icon: Puzzle },
  ];

  const activeLabel =
    toolbarButtons.find(b => b.id === activeTab)?.label || "Settings";

  const handleCloseDialog = () => {
    if (window.electron?.ipcRenderer) {
      window.electron.ipcRenderer.invoke("dialog:close", "settings");
    }
  };

  const renderContent = () => {
    // Wrap components in Suspense for lazy loading
    const content = (() => {
      switch (activeTab) {
        case "apple-accounts":
          return <AppleAccountsSettings />;
        case "passwords":
          return <PasswordsSettings preloadedData={passwordsData} />;
        case "notifications":
          return <NotificationsSettings />;
        case "shortcuts":
          return <ShortcutsSettings />;
        case "components":
          return <ComponentsSettings />;
        case "behaviors":
          return <APIKeysSettings />;
        default:
          return <PlaceholderContent title={activeLabel} />;
      }
    })();

    return <Suspense fallback={<LoadingSpinner />}>{content}</Suspense>;
  };

  return (
    <div className="dialog-window h-screen w-full font-sans text-black">
      <div
        className="w-full h-full flex bg-white relative"
        style={{ "-webkit-corner-smoothing": "subpixel" }}
      >
        {/* Close button */}
        <button
          onClick={handleCloseDialog}
          className="absolute top-4 right-4 z-50 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          title="Close Settings"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Sidebar Column */}
        <div className="w-56 bg-[#F6F6F6] flex flex-col flex-shrink-0 border-r border-gray-300">
          {/* Sidebar's top bar section */}
          <div className="h-[52px] flex-shrink-0 flex items-center">
            {/* Empty space for native traffic lights */}
          </div>
          {/* The actual list of tabs */}
          <div className="px-4 flex flex-col space-y-1">
            {toolbarButtons.map(({ id, label, icon: Icon, loading }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={`flex items-center space-x-2.5 px-2.5 py-1.5 text-sm font-medium transition-colors duration-75 w-full text-left
                                    ${
                                      activeTab === id
                                        ? "bg-gray-500 text-white"
                                        : "text-gray-800 hover:bg-gray-200"
                                    }
                                    focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 focus:ring-offset-[#F6F6F6]
                                `}
                style={{
                  borderRadius: "6px",
                  "-webkit-corner-smoothing": "subpixel",
                }}
              >
                {loading ? (
                  <Loader2
                    className={`w-4 h-4 animate-spin ${activeTab === id ? "text-white" : "text-gray-600"}`}
                  />
                ) : (
                  <Icon
                    className={`w-4 h-4 ${activeTab === id ? "text-white" : "text-gray-600"}`}
                  />
                )}
                <span>{label}</span>
                {loading && activeTab !== id && (
                  <div className="ml-auto">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                  </div>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Content Column */}
        <div className="flex-1 flex flex-col bg-white">
          {/* Content's Title Bar */}
          <div className="h-[52px] border-b border-gray-200 flex-shrink-0 flex items-center px-4 space-x-4">
            {/* Forward/backward buttons */}
            <div className="flex items-center">
              <div
                className="flex items-center bg-gray-200/80 p-0.5"
                style={{
                  borderRadius: "6px",
                  "-webkit-corner-smoothing": "subpixel",
                }}
              >
                <button
                  className="p-1 text-gray-400 hover:bg-gray-300/80 hover:text-gray-700 transition-colors"
                  style={{
                    borderRadius: "4px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="w-px h-4 bg-gray-300"></div>
                <button
                  className="p-1 text-gray-400 hover:bg-gray-300/80 hover:text-gray-700 transition-colors"
                  style={{
                    borderRadius: "4px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
            <h1 className="font-semibold text-base text-gray-800 flex-1">
              {activeLabel}
            </h1>
          </div>
          {/* The actual content panel */}
          <div className="flex-1 p-8 overflow-y-auto">{renderContent()}</div>
        </div>
      </div>
    </div>
  );
}

// Settings Components
const AppleAccountsSettingsComponent = () => {
  const { isAuthenticated, user, login, isLoading } = usePrivyAuth();
  const [components, setComponents] = useState({
    adBlocker: true,
    bluetooth: false,
  });
  const [componentsLoading, setComponentsLoading] = useState(true);

  const handleAddFunds = () => {
    if (!isAuthenticated) {
      login();
    } else {
      // Handle add funds action
      logger.info("Add funds clicked");
      // This would open a payment modal or redirect to payment page
    }
  };

  const handleToggle = async (component: keyof typeof components) => {
    const newValue = !components[component];
    setComponents(prev => ({ ...prev, [component]: newValue }));

    // Save to backend
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke("settings:update-components", {
        [component]: newValue,
      });
    }
  };

  useEffect(() => {
    // Load saved settings
    const loadSettings = async () => {
      setComponentsLoading(true);
      try {
        if (window.electron?.ipcRenderer) {
          const result = await window.electron.ipcRenderer.invoke(
            "settings:get-components",
          );
          if (result?.success) {
            setComponents(result.settings);
          }
        }
      } catch (error) {
        logger.error("Failed to load component settings:", error);
      } finally {
        setComponentsLoading(false);
      }
    };

    // Delay load to improve perceived performance
    const timer = setTimeout(loadSettings, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-6">
      {/* User Account Section */}
      {isAuthenticated && user && (
        <div
          className="bg-white border border-gray-200/80"
          style={{
            borderRadius: "8px",
            "-webkit-corner-smoothing": "subpixel",
          }}
        >
          <div className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center">
                  <Wallet className="h-5 w-5 text-gray-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-800">Wallet</p>
                  <p className="text-sm text-gray-600">Connected via Privy</p>
                </div>
              </div>
              <UserPill
                user={user}
                isAuthenticated={isAuthenticated}
                size="sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Add Funds Button */}
      <div className="flex justify-end items-center gap-3">
        {!isAuthenticated && !isLoading && (
          <p className="text-sm text-gray-500">Login with Privy to add funds</p>
        )}
        <button
          onClick={handleAddFunds}
          disabled={isLoading}
          className={`px-4 py-1.5 text-sm font-medium transition-colors border ${
            isAuthenticated
              ? "bg-blue-500 text-white hover:bg-blue-600 border-blue-500"
              : "bg-gray-200/80 text-gray-800 hover:bg-gray-300/80 border-gray-300/80"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
          style={{
            borderRadius: "6px",
            "-webkit-corner-smoothing": "subpixel",
          }}
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isAuthenticated ? (
            "Add Funds"
          ) : (
            "Login to Add Funds"
          )}
        </button>
      </div>

      {/* Browser Components Section */}
      <div
        className="bg-white border border-gray-200 p-6"
        style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-6">
          Browser Components
        </h3>

        {componentsLoading ? (
          <LoadingSpinner />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">Ad Blocker</h4>
                <p className="text-sm text-gray-600">
                  Block ads and trackers for faster, cleaner browsing
                </p>
              </div>
              <button
                onClick={() => handleToggle("adBlocker")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                  components.adBlocker ? "bg-blue-600" : "bg-gray-200"
                } transition-colors`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    components.adBlocker ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-gray-800">Bluetooth Support</h4>
                <p className="text-sm text-gray-600">
                  Enable web pages to connect to Bluetooth devices
                </p>
              </div>
              <button
                onClick={() => handleToggle("bluetooth")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                  components.bluetooth ? "bg-blue-600" : "bg-gray-200"
                } transition-colors`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                    components.bluetooth ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// URL display logic
const getDisplayUrl = (url: string): string => {
  // Check if URL has a TLD pattern
  const tldPattern = /\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?(?:\/|$)/;
  const hasTLD = tldPattern.test(url);

  if (!hasTLD && url.length > 25) {
    // Truncate non-TLD URLs at 25 characters
    return url.substring(0, 25) + "...";
  }

  if (hasTLD) {
    // For URLs with TLD, truncate at the domain level
    const match = url.match(/^(https?:\/\/)?([^/]+)/);
    if (match) {
      const domain = match[2];
      return (match[1] || "") + domain;
    }
  }

  return url;
};

const PasswordsSettingsComponent = ({
  preloadedData,
}: {
  preloadedData?: any;
}) => {
  // Always call the hook, but conditionally load data
  const hookData = usePasswords(!preloadedData);

  // Use preloaded data if available, otherwise use hook data
  const {
    passwords,
    filteredPasswords,
    searchQuery,
    setSearchQuery,
    isPasswordModalVisible,
    setIsPasswordModalVisible,
    selectedPassword,
    showPassword,
    setShowPassword,
    loading,
    statusMessage,
    statusType,
    isImporting,
    importedSources,
    progressValue,
    progressText,
    handleComprehensiveImportFromChrome,
    handleExportPasswords,
    handleViewPassword,
    copyToClipboard,
    clearMessage,
  } = preloadedData || hookData;

  // Show loading state for initial load
  if (loading && filteredPasswords.length === 0) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {/* Floating Toast - positioned absolutely outside main content */}
      {statusMessage && (
        <FloatingToast
          message={statusMessage}
          type={statusType}
          onClose={clearMessage}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {/* Progress Bar */}
        {isImporting && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <ProgressBar
              value={progressValue}
              title="Importing from Chrome"
              label={progressText}
              className=""
            />
          </div>
        )}

        {/* Import Section */}
        <div className="text-center py-3">
          <div className="w-10 h-10 mx-auto mb-3 bg-blue-100 rounded-full flex items-center justify-center">
            <Lock className="h-5 w-5 text-blue-600" />
          </div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Password Manager
          </h2>
          <p className="text-sm text-gray-600 mb-4 max-w-md mx-auto">
            {passwords.length === 0
              ? "Import your passwords from Chrome to get started. All data is encrypted and stored securely."
              : "Search and manage your imported passwords. Quick copy username and password with one click."}
          </p>
          {passwords.length === 0 && (
            <button
              onClick={handleComprehensiveImportFromChrome}
              disabled={
                isImporting || importedSources.has("chrome-all-profiles")
              }
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              style={{
                borderRadius: "6px",
                "-webkit-corner-smoothing": "subpixel",
              }}
            >
              <Download className="h-4 w-4" />
              {importedSources.has("chrome-all-profiles")
                ? "Already Imported"
                : "Import from Chrome"}
            </button>
          )}
        </div>

        {/* Quick Search & Copy Area */}
        {passwords.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-card-foreground">
                Local Storage
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={handleComprehensiveImportFromChrome}
                  disabled={
                    isImporting || importedSources.has("chrome-comprehensive")
                  }
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                  style={{
                    borderRadius: "6px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <Download className="h-4 w-4" />
                  {importedSources.has("chrome-comprehensive")
                    ? "Imported"
                    : "Import"}
                </button>
                <button
                  onClick={handleExportPasswords}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors text-sm"
                  style={{
                    borderRadius: "6px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <FileDown className="h-4 w-4" />
                  Export
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by website or username..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-input border border-border focus:ring-2 focus:ring-ring focus:border-transparent focus:bg-background outline-none transition-all"
                style={{
                  borderRadius: "6px",
                  "-webkit-corner-smoothing": "subpixel",
                }}
              />
            </div>

            {/* Quick Copy Cards */}
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredPasswords.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-sm">
                    No passwords found matching "{searchQuery}"
                  </p>
                  <p className="text-xs mt-2">Try a different search term</p>
                </div>
              ) : (
                filteredPasswords.map((password: any) => {
                  const displayUrl = getDisplayUrl(password.url);

                  return (
                    <div
                      key={password.id}
                      className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 rounded-lg transition-all"
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 bg-white rounded-md flex items-center justify-center flex-shrink-0 border">
                          <Lock className="h-4 w-4 text-gray-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm break-all overflow-hidden">
                            {displayUrl}
                          </p>
                          <p className="text-xs text-gray-500 break-all overflow-hidden">
                            {password.username}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => copyToClipboard(password.username)}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          style={{
                            borderRadius: "4px",
                            "-webkit-corner-smoothing": "subpixel",
                          }}
                          title="Copy username"
                        >
                          Copy User
                        </button>
                        <button
                          onClick={() => copyToClipboard(password.password)}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          style={{
                            borderRadius: "4px",
                            "-webkit-corner-smoothing": "subpixel",
                          }}
                          title="Copy password"
                        >
                          Copy Pass
                        </button>
                        <button
                          onClick={() => handleViewPassword(password)}
                          className="p-1 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                          style={{
                            borderRadius: "4px",
                            "-webkit-corner-smoothing": "subpixel",
                          }}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Password Detail Modal */}
        {isPasswordModalVisible && selectedPassword && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-md w-full">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-800">
                  Password Details
                </h3>
                <button
                  onClick={() => setIsPasswordModalVisible(false)}
                  className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                  style={{
                    borderRadius: "6px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website
                  </label>
                  <div
                    className="px-3 py-2 bg-gray-50 text-gray-900 break-all"
                    style={{
                      borderRadius: "6px",
                      "-webkit-corner-smoothing": "subpixel",
                    }}
                  >
                    {selectedPassword.url}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Username
                  </label>
                  <div
                    className="px-3 py-2 bg-gray-50 text-gray-900"
                    style={{
                      borderRadius: "6px",
                      "-webkit-corner-smoothing": "subpixel",
                    }}
                  >
                    {selectedPassword.username}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="flex gap-2">
                    <div
                      className="flex-1 px-3 py-2 bg-gray-50 text-gray-900 font-mono"
                      style={{
                        borderRadius: "6px",
                        "-webkit-corner-smoothing": "subpixel",
                      }}
                    >
                      {showPassword
                        ? selectedPassword.password
                        : "••••••••••••"}
                    </div>
                    <button
                      onClick={() => setShowPassword(!showPassword)}
                      className="px-3 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                      style={{
                        borderRadius: "6px",
                        "-webkit-corner-smoothing": "subpixel",
                      }}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => copyToClipboard(selectedPassword.password)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  style={{
                    borderRadius: "6px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Copy Password
                </button>
                <button
                  onClick={() => setIsPasswordModalVisible(false)}
                  className="px-4 py-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  style={{
                    borderRadius: "6px",
                    "-webkit-corner-smoothing": "subpixel",
                  }}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

const PlaceholderContent = ({ title }) => (
  <div>
    <div
      className="text-center text-gray-500 border-2 border-dashed border-gray-300 p-16"
      style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
    >
      <h2 className="text-xl font-semibold mb-2 text-gray-700">{title}</h2>
      <p>Settings for {title} would be displayed here.</p>
    </div>
  </div>
);

// Notifications Settings Component
const NotificationsSettingsComponent = () => {
  const [notifications, setNotifications] = useState({
    enabled: true,
    sound: true,
    badge: true,
    preview: false,
  });
  const [loading, setLoading] = useState(true);

  const handleToggle = async (key: keyof typeof notifications) => {
    const newValue = !notifications[key];
    setNotifications(prev => ({ ...prev, [key]: newValue }));

    // Save to backend
    if (window.electron?.ipcRenderer) {
      await window.electron.ipcRenderer.invoke(
        "settings:update-notifications",
        {
          [key]: newValue,
        },
      );
    }
  };

  useEffect(() => {
    // Load saved settings
    const loadSettings = async () => {
      setLoading(true);
      try {
        if (window.electron?.ipcRenderer) {
          const result = await window.electron.ipcRenderer.invoke(
            "settings:get-notifications",
          );
          if (result?.success) {
            setNotifications(result.settings);
          }
        }
      } catch (error) {
        logger.error("Failed to load notification settings:", error);
      } finally {
        setLoading(false);
      }
    };

    // Delay load to improve perceived performance
    const timer = setTimeout(loadSettings, 100);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div className="space-y-6">
      <div
        className="bg-white border border-gray-200 p-6"
        style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-6">
          Notification Preferences
        </h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-800">
                Enable Notifications
              </h4>
              <p className="text-sm text-gray-600">
                Show desktop notifications for important events
              </p>
            </div>
            <button
              onClick={() => handleToggle("enabled")}
              className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                notifications.enabled ? "bg-blue-600" : "bg-gray-200"
              } transition-colors`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  notifications.enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-800">Notification Sound</h4>
              <p className="text-sm text-gray-600">
                Play a sound when notifications appear
              </p>
            </div>
            <button
              onClick={() => handleToggle("sound")}
              disabled={!notifications.enabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                notifications.sound && notifications.enabled
                  ? "bg-blue-600"
                  : "bg-gray-200"
              } transition-colors disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  notifications.sound && notifications.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-800">Show Badge Count</h4>
              <p className="text-sm text-gray-600">
                Display unread count on app icon
              </p>
            </div>
            <button
              onClick={() => handleToggle("badge")}
              disabled={!notifications.enabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                notifications.badge && notifications.enabled
                  ? "bg-blue-600"
                  : "bg-gray-200"
              } transition-colors disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  notifications.badge && notifications.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-gray-800">Message Preview</h4>
              <p className="text-sm text-gray-600">
                Show message content in notifications
              </p>
            </div>
            <button
              onClick={() => handleToggle("preview")}
              disabled={!notifications.enabled}
              className={`relative inline-flex h-6 w-11 items-center rounded-full ${
                notifications.preview && notifications.enabled
                  ? "bg-blue-600"
                  : "bg-gray-200"
              } transition-colors disabled:opacity-50`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                  notifications.preview && notifications.enabled
                    ? "translate-x-6"
                    : "translate-x-1"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* Notification History Console */}
      <div
        className="bg-gray-50 border border-gray-200 p-4"
        style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Notification History
          </h3>
          <button
            className="px-3 py-1 text-xs font-medium text-gray-400 bg-gray-200 rounded cursor-not-allowed"
            disabled
          >
            Tune
          </button>
        </div>

        <div
          className="bg-white border border-gray-200 rounded p-3 h-32 overflow-y-auto font-mono text-xs"
          style={{
            backgroundColor: "#fafafa",
            fontFamily: "SF Mono, Monaco, Consolas, monospace",
          }}
        >
          <div className="text-gray-500">
            <div>
              [2024-01-08 10:23:45] System notification sent: "Download
              completed"
            </div>
            <div>
              [2024-01-08 10:22:12] Agent notification: "Analysis complete for
              current tab"
            </div>
            <div>
              [2024-01-08 10:20:03] Update notification: "New version available"
            </div>
            <div>
              [2024-01-08 10:15:30] System notification sent: "Password import
              successful"
            </div>
            <div className="text-gray-400 mt-2">
              — End of notification history —
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Shortcuts Settings Component
const ShortcutsSettingsComponent = () => {
  const shortcuts = [
    { action: "Open Omnibox", keys: ["⌘", "K"] },
    { action: "New Tab", keys: ["⌘", "T"] },
    { action: "Close Tab", keys: ["⌘", "W"] },
    { action: "Switch Tab", keys: ["⌘", "1-9"] },
    { action: "Reload Page", keys: ["⌘", "R"] },
    { action: "Go Back", keys: ["⌘", "["] },
    { action: "Go Forward", keys: ["⌘", "]"] },
    { action: "Find in Page", keys: ["⌘", "F"] },
    { action: "Downloads", keys: ["⌘", "Shift", "J"] },
    { action: "Settings", keys: ["⌘", ","] },
  ];

  return (
    <div className="space-y-6">
      <div
        className="bg-white border border-gray-200 p-6"
        style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-6">
          Keyboard Shortcuts
        </h3>

        <div className="space-y-3">
          {shortcuts.map((shortcut, index) => (
            <div
              key={index}
              className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
            >
              <span className="text-gray-700">{shortcut.action}</span>
              <div className="flex items-center gap-1">
                {shortcut.keys.map((key, keyIndex) => (
                  <kbd
                    key={keyIndex}
                    className="px-2 py-1 text-xs font-semibold text-gray-800 bg-gray-100 border border-gray-300 rounded"
                  >
                    {key}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="text-sm text-gray-500 mt-4">
          Keyboard shortcuts cannot be customized at this time.
        </p>
      </div>
    </div>
  );
};

// Components Settings Component - Now just a placeholder for marketplace
const ComponentsSettingsComponent = () => {
  return (
    <div className="space-y-6">
      <div
        className="bg-white border border-gray-200 p-6"
        style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
      >
        <h3 className="text-lg font-semibold text-gray-800 mb-6">
          Marketplace
        </h3>

        <div className="flex items-center justify-center">
          <div className="text-center">
            <div
              className="w-96 h-64 bg-gray-300 rounded-lg mb-4 flex items-center justify-center"
              style={{
                filter: "blur(2px)",
                background:
                  "linear-gradient(135deg, #e5e7eb 0%, #d1d5db 50%, #9ca3af 100%)",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Simulated blurry eBay-style interface */}
              <div className="absolute inset-0 p-4">
                <div className="h-6 bg-gray-400 rounded mb-3 opacity-60"></div>
                <div className="grid grid-cols-3 gap-3 h-full">
                  <div className="bg-gray-400 rounded opacity-50"></div>
                  <div className="bg-gray-400 rounded opacity-50"></div>
                  <div className="bg-gray-400 rounded opacity-50"></div>
                  <div className="bg-gray-400 rounded opacity-50"></div>
                  <div className="bg-gray-400 rounded opacity-50"></div>
                  <div className="bg-gray-400 rounded opacity-50"></div>
                </div>
              </div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-gray-600 font-medium text-lg opacity-70">
                  Early Preview
                </div>
              </div>
            </div>
            <p className="text-gray-600 text-sm">
              Browser extension marketplace coming soon
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

// API Keys Settings Component
const APIKeysSettingsComponent = () => {
  const [apiKeys, setApiKeys] = useState({ openai: "", turbopuffer: "" });
  const [passwordVisible, setPasswordVisible] = useState({ openai: false, turbopuffer: false });
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Load API keys from profile on mount
  useEffect(() => {
    loadApiKeys();
  }, []);

  const loadApiKeys = async () => {
    try {
      setLoading(true);
      const [openaiKey, turbopufferKey] = await Promise.all([
        window.apiKeys?.get("openai"),
        window.apiKeys?.get("turbopuffer"),
      ]);
      setApiKeys({
        openai: openaiKey || "",
        turbopuffer: turbopufferKey || "",
      });
    } catch (error) {
      logger.error("Failed to load API keys:", error);
      setToastMessage({ message: "Failed to load API keys", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const handleApiKeyChange = (key: 'openai' | 'turbopuffer', value: string) => {
    setApiKeys({ ...apiKeys, [key]: value });
  };

  const saveApiKeys = async () => {
    try {
      const results = await Promise.all([
        apiKeys.openai ? window.apiKeys?.set("openai", apiKeys.openai) : Promise.resolve(true),
        apiKeys.turbopuffer ? window.apiKeys?.set("turbopuffer", apiKeys.turbopuffer) : Promise.resolve(true),
      ]);

      if (results.every(result => result)) {
        setToastMessage({ message: "API keys saved successfully", type: "success" });
      } else {
        setToastMessage({ message: "Failed to save some API keys", type: "error" });
      }
    } catch (error) {
      logger.error("Failed to save API keys:", error);
      setToastMessage({ message: "Failed to save API keys", type: "error" });
    }
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <>
      {/* Floating Toast - positioned absolutely outside main content */}
      {toastMessage && (
        <FloatingToast
          message={toastMessage.message}
          type={toastMessage.type}
          onClose={() => setToastMessage(null)}
        />
      )}

      <div className="space-y-6">
        <div
          className="bg-white border border-gray-200 p-6"
          style={{ borderRadius: "8px", "-webkit-corner-smoothing": "subpixel" }}
        >
          <h3 className="text-lg font-semibold text-gray-800 mb-6">
            API Keys Management
          </h3>

          <div className="space-y-6">
            {/* OpenAI API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                OpenAI API Key
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Used for AI-powered features and intelligent assistance
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={passwordVisible.openai ? "text" : "password"}
                    placeholder="sk-..."
                    value={apiKeys.openai}
                    onChange={(e) => handleApiKeyChange('openai', e.target.value)}
                    onBlur={saveApiKeys}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  />
                  <button
                    onClick={() => setPasswordVisible({ ...passwordVisible, openai: !passwordVisible.openai })}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  >
                    {passwordVisible.openai ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            {/* TurboPuffer API Key */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                TurboPuffer API Key
              </label>
              <p className="text-xs text-gray-500 mb-3">
                Used for vector search and embeddings storage
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type={passwordVisible.turbopuffer ? "text" : "password"}
                    placeholder="Enter API key"
                    value={apiKeys.turbopuffer}
                    onChange={(e) => handleApiKeyChange('turbopuffer', e.target.value)}
                    onBlur={saveApiKeys}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent pr-10"
                  />
                  <button
                    onClick={() => setPasswordVisible({ ...passwordVisible, turbopuffer: !passwordVisible.turbopuffer })}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-gray-500 hover:text-gray-700"
                  >
                    {passwordVisible.turbopuffer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-4 bg-gray-50 rounded-md">
            <p className="text-sm text-gray-600">
              <strong>Note:</strong> API keys are encrypted and stored securely in your profile. They are never transmitted to our servers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};
