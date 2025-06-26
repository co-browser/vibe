import React, { useState } from "react";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("OnboardingModal");

interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<OnboardingStepProps>;
}

interface OnboardingStepProps {
  onNext: () => void;
  onBack: () => void;
  onComplete: () => void;
  currentStep: number;
  totalSteps: number;
}

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// Step 1: Welcome
const WelcomeStep: React.FC<OnboardingStepProps> = ({
  onNext,
  currentStep,
  totalSteps,
}) => {
  return (
    <div className="text-center space-y-6">
      <div className="space-y-4">
        <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto">
          <svg
            className="w-10 h-10 text-white"
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
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          The Vibe
        </h2>
        <p className="text-gray-600 dark:text-gray-300 max-w-md mx-auto">
          Let's set you up for an accelerated browsing experience.
        </p>
      </div>

      <div className="flex justify-center space-x-2">
        {Array.from({ length: totalSteps }, (_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-colors ${
              i === currentStep - 1
                ? "bg-blue-500"
                : i < currentStep - 1
                  ? "bg-green-500"
                  : "bg-gray-300 dark:bg-gray-600"
            }`}
          />
        ))}
      </div>

      <button
        onClick={onNext}
        className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
      >
        Get Started
      </button>
    </div>
  );
};

// Step 2: Profile Setup
const ProfileSetupStep: React.FC<OnboardingStepProps> = ({
  onNext,
  onBack,
}) => {
  const [profileName, setProfileName] = useState("");
  const [email, setEmail] = useState("");

  const handleNext = () => {
    if (profileName.trim()) {
      // Save profile data via IPC
      window.electronAPI?.ipcRenderer?.invoke("onboarding:update-profile", {
        name: profileName.trim(),
        email: email.trim() || undefined,
      });
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Create Your Profile
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Set up your personal profile to customize your experience.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Profile Name *
          </label>
          <input
            type="text"
            value={profileName}
            onChange={e => setProfileName(e.target.value)}
            placeholder="Enter your name"
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
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
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white/50 dark:bg-gray-800/50 backdrop-blur-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleNext}
          disabled={!profileName.trim()}
          className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          Continue
        </button>
      </div>
    </div>
  );
};

// Step 3: Password Import
const PasswordImportStep: React.FC<OnboardingStepProps> = ({
  onBack,
  onComplete,
}) => {
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  const handleImportPasswords = async () => {
    setIsImporting(true);
    try {
      const result = await window.electronAPI?.invoke(
        "onboarding:import-chrome-passwords",
      );
      setImportResult(result);
    } catch (error) {
      logger.error("Failed to import passwords:", error);
      setImportResult({ success: false, error: "Import failed" });
    } finally {
      setIsImporting(false);
    }
  };

  const handleComplete = async () => {
    try {
      await window.electronAPI?.invoke("onboarding:complete");
      onComplete();
    } catch (error) {
      logger.error("Failed to complete onboarding:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Import Your Passwords
        </h2>
        <p className="text-gray-600 dark:text-gray-300">
          Securely import your passwords from Chrome to get started quickly.
        </p>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
            <svg
              className="w-5 h-5 text-blue-600 dark:text-blue-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-medium text-blue-900 dark:text-blue-100">
              Secure Import
            </h3>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              Your passwords are encrypted and stored securely using Touch ID.
            </p>
          </div>
        </div>
      </div>

      {!importResult && (
        <button
          onClick={handleImportPasswords}
          disabled={isImporting}
          className="w-full px-6 py-3 bg-gradient-to-r from-green-500 to-blue-500 text-white rounded-lg font-medium hover:from-green-600 hover:to-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
        >
          {isImporting ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Importing...</span>
            </div>
          ) : (
            "Import from Chrome"
          )}
        </button>
      )}

      {importResult && (
        <div
          className={`p-4 rounded-lg ${
            importResult.success
              ? "bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800"
              : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
          }`}
        >
          <p
            className={`text-sm ${
              importResult.success
                ? "text-green-700 dark:text-green-300"
                : "text-red-700 dark:text-red-300"
            }`}
          >
            {importResult.message ||
              (importResult.success
                ? "Import completed successfully!"
                : "Import failed")}
          </p>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleComplete}
          className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg font-medium hover:from-blue-600 hover:to-purple-700 transition-all duration-200"
        >
          Complete Setup
        </button>
      </div>
    </div>
  );
};

const steps: OnboardingStep[] = [
  {
    id: "welcome",
    title: "Welcome",
    description: "Get started with Vibe",
    component: WelcomeStep,
  },
  {
    id: "profile",
    title: "Profile Setup",
    description: "Create your profile",
    component: ProfileSetupStep,
  },
  {
    id: "import",
    title: "Import Data",
    description: "Import your passwords",
    component: PasswordImportStep,
  },
];

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [currentStep, setCurrentStep] = useState(1);

  const handleNext = () => {
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    onClose();
  };

  if (!isOpen) return null;

  const CurrentStepComponent = steps[currentStep - 1].component;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 dark:border-gray-700/50 p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <svg
            className="w-4 h-4 text-gray-600 dark:text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Content */}
        <CurrentStepComponent
          onNext={handleNext}
          onBack={handleBack}
          onComplete={handleComplete}
          currentStep={currentStep}
          totalSteps={steps.length}
        />
      </div>
    </div>
  );
};
