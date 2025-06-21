import { useState, useEffect } from "react";

// Define interfaces for onboarding data
interface OnboardingData {
  profileName: string;
  email?: string;
  importPasswords: boolean;
  importHistory: boolean;
  selectedBrowser?: string;
  theme: "light" | "dark" | "system";
  privacyMode: boolean;
}

// Define interface for detected browser
interface DetectedBrowser {
  name: string;
  path: string;
  default?: boolean;
}

// Define interface for component props
interface OnboardingPageProps {
  detectedBrowsers?: DetectedBrowser[];
}

/**
 * OnboardingPage - Enhanced component with profile service integration
 */
export function OnboardingPage({
  detectedBrowsers: propDetectedBrowsers,
}: OnboardingPageProps = {}) {
  const [currentStep, setCurrentStep] = useState<
    "welcome" | "profile-setup" | "data-import"
  >("welcome");
  const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>(
    propDetectedBrowsers || [],
  );
  const [isProcessing, setIsProcessing] = useState(false);

  // Profile setup form data
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [privacyMode, setPrivacyMode] = useState(false);
  const [importPasswords, setImportPasswords] = useState(false);
  const [importHistory, setImportHistory] = useState(false);
  const [selectedBrowser, setSelectedBrowser] = useState<string>("");

  // Get detected browsers on component mount
  useEffect(() => {
    if (!propDetectedBrowsers || propDetectedBrowsers.length === 0) {
      // Try to get detected browsers via IPC
      const getBrowsers = async () => {
        try {
          const browsers = await window.electronAPI?.invoke(
            "onboarding:get-browsers",
          );
          if (browsers) {
            setDetectedBrowsers(browsers);
          }
        } catch (error) {
          console.error("Failed to get detected browsers:", error);
        }
      };

      getBrowsers();
    }
  }, [propDetectedBrowsers]);

  const getBrowserIcon = (browserName: string) => {
    // Return text-based icons instead of emojis
    const iconMap: Record<string, string> = {
      Safari: "S",
      "Google Chrome": "C",
      "Google Chrome Canary": "C",
      "Google Chrome for Testing": "C",
      Chrome: "C",
      Firefox: "F",
      Brave: "B",
      "Microsoft Edge": "E",
      Edge: "E",
      Opera: "O",
      Arc: "A",
      "Pale Moon": "P",
    };
    return iconMap[browserName] || "B";
  };

  const getSupportedBrowsers = () => {
    const supportedBrowserNames = [
      "Safari",
      "Google Chrome",
      "Chrome",
      "Firefox",
      "Brave",
      "Microsoft Edge",
      "Edge",
      "Opera",
      "Arc",
    ];

    if (detectedBrowsers.length === 0) {
      return supportedBrowserNames.map(name => ({
        name,
        path: "",
        detected: false,
        default: false,
      }));
    }

    return detectedBrowsers
      .filter(browser =>
        supportedBrowserNames.some(
          supported =>
            browser.name.toLowerCase().includes(supported.toLowerCase()) ||
            supported.toLowerCase().includes(browser.name.toLowerCase()),
        ),
      )
      .map(browser => ({
        ...browser,
        detected: true,
        default: browser.default || false,
      }));
  };

  const handleCompleteOnboarding = async () => {
    if (!profileName.trim()) {
      alert("Please enter a profile name");
      return;
    }

    setIsProcessing(true);

    try {
      const onboardingData: OnboardingData = {
        profileName: profileName.trim(),
        email: email.trim() || undefined,
        importPasswords,
        importHistory,
        selectedBrowser: selectedBrowser || undefined,
        theme,
        privacyMode,
      };

      const result = await window.electronAPI?.invoke(
        "onboarding:complete",
        onboardingData,
      );

      if (result?.success) {
        console.log("Onboarding completed successfully");
        // Window will be closed by the main process
      } else {
        console.error("Onboarding failed:", result?.error);
        alert(
          "Failed to complete onboarding: " +
            (result?.error || "Unknown error"),
        );
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
      alert("An error occurred during onboarding");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSkipOnboarding = () => {
    // Create a minimal profile and close
    handleCompleteOnboarding();
  };

  if (currentStep === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
        {/* Draggable title bar */}
        <div
          className="fixed top-0 left-0 right-0 h-8 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center justify-between h-full px-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Welcome to Vibe Browser
            </span>
          </div>
        </div>

        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mt-8">
          <div className="text-center">
            <div className="mb-8">
              <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                Welcome to Vibe Browser
              </h1>
              <p className="text-gray-600 dark:text-gray-300 text-lg">
                Let's set up your browsing experience
              </p>
            </div>

            <div className="space-y-6 mb-8">
              <div className="flex items-start space-x-4 text-left">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Multi-Tab Browsing
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Manage multiple tabs with ease and switch between them
                    seamlessly
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4 text-left">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    AI-Powered Chat
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Get help and assistance with an integrated AI chat interface
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-4 text-left">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    Secure & Private
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Your data is encrypted and stored securely on your device
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-4 justify-center">
              <button
                onClick={handleSkipOnboarding}
                disabled={isProcessing}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Skip Setup
              </button>
              <button
                onClick={() => setCurrentStep("profile-setup")}
                disabled={isProcessing}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === "profile-setup") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
        {/* Draggable title bar */}
        <div
          className="fixed top-0 left-0 right-0 h-8 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10"
          style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
        >
          <div className="flex items-center justify-between h-full px-4">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Profile Setup
            </span>
          </div>
        </div>

        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mt-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Create Your Profile
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              Set up your personal browsing profile
            </p>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Profile Name *
              </label>
              <input
                type="text"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                placeholder="Enter your name"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email (Optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="Enter your email"
                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Theme Preference
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setTheme("light")}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    theme === "light"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  Light
                </button>
                <button
                  onClick={() => setTheme("dark")}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    theme === "dark"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  Dark
                </button>
                <button
                  onClick={() => setTheme("system")}
                  className={`p-3 border rounded-lg text-center transition-colors ${
                    theme === "system"
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  System
                </button>
              </div>
            </div>

            <div>
              <label className="flex items-center justify-between">
                <span className="text-gray-700 dark:text-gray-300">
                  Enable privacy mode
                </span>
                <input
                  type="checkbox"
                  checked={privacyMode}
                  onChange={e => setPrivacyMode(e.target.checked)}
                  className="toggle"
                />
              </label>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Enhanced privacy protection and tracking prevention
              </p>
            </div>
          </div>

          <div className="flex space-x-4 justify-center mt-8">
            <button
              onClick={() => setCurrentStep("welcome")}
              disabled={isProcessing}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              Back
            </button>
            <button
              onClick={() => setCurrentStep("data-import")}
              disabled={isProcessing || !profileName.trim()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const supportedBrowsers = getSupportedBrowsers();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
      {/* Draggable title bar */}
      <div
        className="fixed top-0 left-0 right-0 h-8 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-10"
        style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
      >
        <div className="flex items-center justify-between h-full px-4">
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Import Data
          </span>
        </div>
      </div>

      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mt-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Import Your Data
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Transfer your passwords and browsing history from other browsers
          </p>
          {detectedBrowsers.length > 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Found {detectedBrowsers.length} browser(s) on your system
            </p>
          )}
        </div>

        <div className="space-y-6 mb-8">
          <div>
            <label className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                Import saved passwords
              </span>
              <input
                type="checkbox"
                checked={importPasswords}
                onChange={e => setImportPasswords(e.target.checked)}
                className="toggle"
              />
            </label>
          </div>

          <div>
            <label className="flex items-center justify-between">
              <span className="text-gray-700 dark:text-gray-300">
                Import browsing history
              </span>
              <input
                type="checkbox"
                checked={importHistory}
                onChange={e => setImportHistory(e.target.checked)}
                className="toggle"
              />
            </label>
          </div>

          {(importPasswords || importHistory) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Select Browser to Import From
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {supportedBrowsers.map(browser => (
                  <button
                    key={browser.name}
                    onClick={() =>
                      setSelectedBrowser(browser.detected ? browser.name : "")
                    }
                    disabled={!browser.detected}
                    className={`group relative flex flex-col items-center justify-center p-6 border rounded-xl transition-all duration-200 ${
                      selectedBrowser === browser.name
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : browser.detected
                          ? "bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg"
                          : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 opacity-50 cursor-not-allowed"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-xl font-bold mb-2 ${
                        selectedBrowser === browser.name
                          ? "bg-blue-200 dark:bg-blue-800"
                          : ""
                      }`}
                    >
                      {getBrowserIcon(browser.name)}
                    </div>
                    <span
                      className={`text-sm font-medium transition-colors ${
                        selectedBrowser === browser.name
                          ? "text-blue-600 dark:text-blue-400"
                          : browser.detected
                            ? "text-gray-700 dark:text-gray-300"
                            : "text-gray-500 dark:text-gray-600"
                      }`}
                    >
                      {browser.name}
                    </span>
                    {!browser.detected && (
                      <span className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                        Not installed
                      </span>
                    )}
                    {browser.default && (
                      <span className="text-xs text-blue-500 dark:text-blue-400 mt-1">
                        Default
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex space-x-4 justify-center">
          <button
            onClick={() => setCurrentStep("profile-setup")}
            disabled={isProcessing}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            Back
          </button>
          <button
            onClick={handleCompleteOnboarding}
            disabled={
              isProcessing ||
              ((importPasswords || importHistory) && !selectedBrowser)
            }
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
          >
            {isProcessing ? "Setting up..." : "Complete Setup"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingPage;

// Also export the DetectedBrowser interface for use in other files
export type { DetectedBrowser };
