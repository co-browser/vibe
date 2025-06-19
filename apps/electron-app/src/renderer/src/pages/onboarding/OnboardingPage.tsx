import { useState, useRef, useEffect } from "react";

// Define interfaces for password import
interface PasswordImportProgress {
  browser: string;
  stage: string;
  message: string;
  progress?: number;
}

interface PasswordImportResult {
  browser: string;
  success: boolean;
  passwordCount?: number;
  error?: string;
}

/**
 * OnboardingPage - Enhanced component with password import functionality
 */
export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState<"welcome" | "password-import">(
    "welcome",
  );
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const consoleRef = useRef<HTMLDivElement>(null);

  // Auto-scroll console to bottom when new output is added
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleOutput]);

  // Set up IPC listeners for password import events
  useEffect(() => {
    const handleProgress = (progress: PasswordImportProgress) => {
      addConsoleOutput(progress.message);
    };

    const handleComplete = (result: PasswordImportResult) => {
      addConsoleOutput(
        `✓ Successfully imported ${result.passwordCount} passwords from ${result.browser}`,
      );
      addConsoleOutput(`Import completed successfully!`);
      setIsImporting(false);
    };

    const handleError = (result: PasswordImportResult) => {
      addConsoleOutput(
        `✗ Error importing from ${result.browser}: ${result.error}`,
      );
      setIsImporting(false);
    };

    // Register IPC listeners using the electronAPI
    const progressCallback = (_: any, progress: PasswordImportProgress) => {
      handleProgress(progress);
    };

    const completeCallback = (_: any, result: PasswordImportResult) => {
      handleComplete(result);
    };

    const errorCallback = (_: any, result: PasswordImportResult) => {
      handleError(result);
    };

    window.electronAPI?.ipcRenderer?.on(
      "password-import-progress",
      progressCallback,
    );
    window.electronAPI?.ipcRenderer?.on(
      "password-import-complete",
      completeCallback,
    );
    window.electronAPI?.ipcRenderer?.on("password-import-error", errorCallback);

    // Cleanup listeners on unmount
    return () => {
      window.electronAPI?.ipcRenderer?.removeListener(
        "password-import-progress",
        progressCallback,
      );
      window.electronAPI?.ipcRenderer?.removeListener(
        "password-import-complete",
        completeCallback,
      );
      window.electronAPI?.ipcRenderer?.removeListener(
        "password-import-error",
        errorCallback,
      );
    };
  }, []);

  const addConsoleOutput = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setConsoleOutput(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handlePasswordImport = async (browser: string) => {
    if (isImporting) return;

    setIsImporting(true);
    addConsoleOutput(`Starting password import from ${browser}...`);

    try {
      // Use actual IPC call
      const result = await window.electronAPI?.ipcRenderer?.invoke(
        "password-import-start",
        browser,
      );

      if (!result?.success) {
        addConsoleOutput(
          `✗ Failed to start import from ${browser}: ${result?.error || "Unknown error"}`,
        );
        setIsImporting(false);
      }
      // Success and error handling is done via IPC events above
    } catch (error) {
      addConsoleOutput(`✗ Error starting import from ${browser}: ${error}`);
      setIsImporting(false);
    }
  };

  const getBrowserIcon = (browser: string) => {
    const iconMap: Record<string, string> = {
      Safari: "🧭",
      Chrome: "🌐",
      Firefox: "🦊",
      Brave: "🦁",
      Arc: "🌙",
    };
    return iconMap[browser] || "🌐";
  };

  if (currentStep === "welcome") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
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
                Let's get you started with your new browsing experience
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
                    Modern Interface
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    Enjoy a clean, modern interface designed for productivity
                  </p>
                </div>
              </div>
            </div>

            <div className="flex space-x-4 justify-center">
              <button
                onClick={() => window.close()}
                className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Skip
              </button>
              <button
                onClick={() => setCurrentStep("password-import")}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Import Passwords
              </button>
              <button
                onClick={() => window.close()}
                className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
      <div className="max-w-4xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
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
                d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Import Your Passwords
          </h1>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Seamlessly transfer your saved passwords from other browsers
          </p>
        </div>

        {/* Browser Import Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          {["Safari", "Chrome", "Firefox", "Brave", "Arc"].map(browser => (
            <button
              key={browser}
              onClick={() => handlePasswordImport(browser)}
              disabled={isImporting}
              className="group relative flex flex-col items-center justify-center p-6 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl hover:border-blue-300 dark:hover:border-blue-500 hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background:
                  "linear-gradient(135deg, var(--glass-background-start), var(--glass-background-end))",
                backdropFilter: "blur(10px)",
                border: "1px solid rgba(255, 255, 255, 0.2)",
              }}
            >
              <div className="text-3xl mb-2 group-hover:scale-110 transition-transform duration-200">
                {getBrowserIcon(browser)}
              </div>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {browser}
              </span>
              {isImporting && (
                <div className="absolute inset-0 bg-blue-500 bg-opacity-10 rounded-xl flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Terminal Console */}
        <div
          className="bg-black rounded-lg p-4 mb-6"
          style={{ minHeight: "200px" }}
        >
          <div className="flex items-center mb-2">
            <div className="flex space-x-2">
              <div className="w-3 h-3 bg-red-500 rounded-full"></div>
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <div className="w-3 h-3 bg-green-500 rounded-full"></div>
            </div>
            <span className="ml-4 text-gray-400 text-sm font-mono">
              Password Import Console
            </span>
          </div>
          <div
            ref={consoleRef}
            className="bg-black text-green-400 font-mono text-sm h-40 overflow-y-auto p-2 border border-gray-700 rounded"
          >
            {consoleOutput.length === 0 ? (
              <div className="text-gray-500">
                Ready to import passwords. Select a browser above to begin...
              </div>
            ) : (
              consoleOutput.map((line, index) => (
                <div key={index} className="mb-1">
                  {line}
                </div>
              ))
            )}
            {isImporting && (
              <div className="flex items-center text-yellow-400">
                <span className="animate-pulse mr-2">▶</span>
                Processing...
              </div>
            )}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex space-x-4 justify-center">
          <button
            onClick={() => setCurrentStep("welcome")}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Back
          </button>
          <button
            onClick={() => setConsoleOutput([])}
            className="px-6 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            Clear Console
          </button>
          <button
            onClick={() => window.close()}
            className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}

export default OnboardingPage;
