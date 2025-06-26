import { useState, useRef, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Stars } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface ChromeProfile {
  name: string;
  path: string;
  lastModified: Date;
  browser: string;
}

// Gemini-style progress bar component
function GeminiProgressBar({
  progress,
  isProcessing,
}: {
  progress: number;
  isProcessing: boolean;
}) {
  return (
    <div className="relative w-full max-w-md">
      {/* Background track */}
      <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
        {/* Progress fill */}
        <motion.div
          className="h-full bg-blue-500"
          initial={{ width: "0%" }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>

      {/* Rotating shimmer effect */}
      {isProcessing && (
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <div
              className="absolute h-full w-16"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(59, 130, 246, 0.8) 50%, transparent 100%)",
                boxShadow: "0 0 20px rgba(59, 130, 246, 0.8)",
              }}
            />
          </motion.div>
        </div>
      )}

      {/* Border with rotating gradient */}
      <div className="absolute -inset-[2px] rounded-full overflow-hidden">
        <motion.div
          className="absolute inset-0"
          animate={isProcessing ? { rotate: 360 } : {}}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          style={{
            background:
              "conic-gradient(from 0deg, transparent, #3b82f6, transparent 180deg)",
          }}
        />
        <div className="absolute inset-[2px] bg-black rounded-full" />
      </div>
    </div>
  );
}

// 3D Background Scene Component
function Scene() {
  const fogRef = useRef<THREE.Group>(null);

  useFrame(state => {
    if (fogRef.current) {
      // Animate fog layers
      fogRef.current.children.forEach((child, i) => {
        if (child instanceof THREE.Mesh) {
          child.position.y =
            -4 + Math.sin(state.clock.getElapsedTime() * 0.5 + i * 0.5) * 0.3;
          child.rotation.z =
            Math.sin(state.clock.getElapsedTime() * 0.2 + i * 0.3) * 0.02;
        }
      });
    }
  });

  return (
    <>
      <fog attach="fog" args={["#000", 1, 20]} />
      <ambientLight intensity={0.05} />

      {/* Soft blue lighting from below */}
      <pointLight position={[0, -5, 0]} color="#0080ff" intensity={2} />
      <pointLight position={[10, -5, 10]} color="#4488ff" intensity={1} />
      <pointLight position={[-10, -5, -10]} color="#0066ff" intensity={1} />

      {/* Dense fog layers at bottom */}
      <group ref={fogRef}>
        {/* Main fog bank */}
        {[...Array(15)].map((_, i) => (
          <mesh
            key={`fog-main-${i}`}
            position={[0, -4 + i * 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[100, 100]} />
            <meshStandardMaterial
              color="#ffffff"
              emissive="#0080ff"
              emissiveIntensity={0.05 - i * 0.003}
              opacity={0.2 - i * 0.01}
              transparent
              depthWrite={false}
            />
          </mesh>
        ))}

        {/* Drifting fog patches */}
        {[...Array(10)].map((_, i) => (
          <Float
            key={`fog-float-${i}`}
            speed={0.5 + Math.random() * 0.5}
            rotationIntensity={0.1}
            floatIntensity={0.5}
          >
            <mesh
              position={[
                (Math.random() - 0.5) * 40,
                -3 + Math.random() * 2,
                (Math.random() - 0.5) * 40,
              ]}
              rotation={[-Math.PI / 2, 0, Math.random() * Math.PI]}
            >
              <planeGeometry
                args={[20 + Math.random() * 20, 20 + Math.random() * 20]}
              />
              <meshStandardMaterial
                color="#ffffff"
                emissive="#0080ff"
                emissiveIntensity={0.02}
                opacity={0.15}
                transparent
                depthWrite={false}
              />
            </mesh>
          </Float>
        ))}
      </group>

      <Stars
        radius={100}
        depth={50}
        count={2000}
        factor={3}
        saturation={0}
        fade
      />
    </>
  );
}

// Main Onboarding Component
export function OnboardingPage3D() {
  const [currentStep, setCurrentStep] = useState(0);
  const [profileName, setProfileName] = useState("");
  const [chromeProfiles, setChromeProfiles] = useState<ChromeProfile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [, setDetectedBrowsers] = useState<any[]>([]);
  const [importStage, setImportStage] = useState<string>("");
  const [importedCount, setImportedCount] = useState(0);
  const [apiKey, setApiKey] = useState("");
  const [apiKeyError, setApiKeyError] = useState("");
  const [isValidatingKey, setIsValidatingKey] = useState(false);

  // Get Chrome profiles and detected browsers on mount
  useEffect(() => {
    // Check if API key already exists
    const loadExistingApiKey = async () => {
      try {
        const existingKey = await window.electronAPI?.ipcRenderer?.invoke(
          "settings:get",
          "openaiApiKey",
        );
        if (existingKey) {
          setApiKey(existingKey);
        }
      } catch (error) {
        console.error("Failed to load existing API key:", error);
      }
    };

    loadExistingApiKey();

    const loadChromeProfiles = async () => {
      try {
        const profiles = await window.electronAPI?.ipcRenderer?.invoke(
          "onboarding:get-chrome-profiles",
        );
        if (profiles) {
          setChromeProfiles(profiles);
        }
      } catch (error) {
        console.error("Failed to load Chrome profiles:", error);
      }
    };

    loadChromeProfiles();

    // Listen for detected browsers from main process
    const handleDetectedBrowsers = (_event: any, browsers: any[]) => {
      console.log("Received detected browsers:", browsers);
      setDetectedBrowsers(browsers || []);
    };

    window.electronAPI?.ipcRenderer?.on(
      "detected-browsers",
      handleDetectedBrowsers,
    );

    // Cleanup listener
    return () => {
      window.electronAPI?.ipcRenderer?.removeListener(
        "detected-browsers",
        handleDetectedBrowsers,
      );
    };
  }, []);

  // Listen for password import progress
  useEffect(() => {
    const handleImportProgress = (_event: any, progress: any) => {
      console.log("Import progress:", progress);

      if (progress.stage === "scanning") {
        setImportProgress(20);
        setImportStage(progress.message);
      } else if (progress.stage === "importing") {
        setImportProgress(50);
        setImportStage(progress.message);
        if (progress.passwordCount) {
          setImportedCount(progress.passwordCount);
        }
      } else if (progress.stage === "complete") {
        setImportProgress(100);
        setImportStage(progress.message);
      }
    };

    window.electronAPI?.ipcRenderer?.on(
      "password-import-progress",
      handleImportProgress,
    );

    return () => {
      window.electronAPI?.ipcRenderer?.removeListener(
        "password-import-progress",
        handleImportProgress,
      );
    };
  }, []);

  const handleComplete = async () => {
    setIsProcessing(true);
    setImportProgress(0);
    setImportStage("");
    setImportedCount(0);
    try {
      const result = await window.electronAPI?.ipcRenderer?.invoke(
        "onboarding:complete",
        {
          profileName: profileName.trim(),
          importPasswords: true,
          importHistory: false,
          selectedBrowser: "chrome",
          selectedChromeProfile: selectedProfile,
          theme: "dark",
          privacyMode: false,
        },
      );

      if (result?.success) {
        // Move to flashlight animation
        setCurrentStep(3);

        // Close window after animation
        setTimeout(() => {
          window.close();
        }, 3000);
      }
    } catch (error) {
      console.error("Error completing onboarding:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0: // Welcome screen
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center space-y-8 text-white"
          >
            <div className="relative">
              <div className="absolute inset-0 animate-pulse">
                <div className="w-32 h-32 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-full filter blur-xl opacity-60" />
              </div>
              <div className="relative w-32 h-32 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-16 h-16 text-white"
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
            </div>

            <div className="text-center space-y-4">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                Welcome to Vibe
              </h1>
              <p className="text-xl text-gray-300 max-w-md">
                Your AI-powered browsing companion
              </p>
            </div>

            <div className="space-y-4 w-full max-w-sm">
              <input
                type="text"
                placeholder="Enter your name"
                value={profileName}
                onChange={e => setProfileName(e.target.value)}
                className="w-full px-6 py-4 bg-white/10 backdrop-blur-md rounded-xl text-white placeholder-gray-400 border border-white/20 focus:border-cyan-400 focus:outline-none transition-all"
                autoFocus
              />

              <button
                onClick={() => {
                  if (profileName.trim()) {
                    setCurrentStep(1);
                  }
                }}
                disabled={!profileName.trim()}
                className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
              >
                Continue
              </button>
            </div>
          </motion.div>
        );

      case 1: // API Key input
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center space-y-8 text-white"
          >
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                Connect to AI
              </h2>
              <p className="text-lg text-gray-300 max-w-md">
                Enter your OpenAI API key to enable AI-powered features
              </p>
            </div>

            <div className="w-full max-w-md space-y-4">
              <div>
                <input
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={e => {
                    setApiKey(e.target.value);
                    setApiKeyError("");
                  }}
                  className={`w-full px-6 py-4 bg-white/10 backdrop-blur-md rounded-xl text-white placeholder-gray-400 border ${
                    apiKeyError ? "border-red-500" : "border-white/20"
                  } focus:border-cyan-400 focus:outline-none transition-all font-mono`}
                  autoFocus
                />
                {apiKeyError && (
                  <p className="mt-2 text-sm text-red-400">{apiKeyError}</p>
                )}
              </div>

              <div className="text-sm text-gray-400 space-y-2">
                <p>
                  Don't have an API key?{" "}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300 underline"
                  >
                    Get one from OpenAI
                  </a>
                </p>
                <p className="text-xs">
                  Your API key is encrypted and stored locally
                </p>
              </div>

              {/* Vibe Mode Section */}
              <div className="relative mt-6">
                {/* Animated neon border */}
                <motion.div className="absolute -inset-[2px] rounded-2xl">
                  <motion.div
                    className="absolute inset-0 rounded-2xl opacity-75"
                    style={{
                      background:
                        "linear-gradient(45deg, #0080ff, #00d4ff, #0080ff)",
                      backgroundSize: "400% 400%",
                    }}
                    animate={{
                      backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"],
                    }}
                    transition={{
                      duration: 3,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                </motion.div>

                {/* Pulsing glow effect */}
                <motion.div className="absolute -inset-[20px] rounded-2xl">
                  <motion.div
                    className="absolute inset-0 rounded-2xl blur-xl"
                    style={{
                      background:
                        "radial-gradient(circle, #0080ff, transparent)",
                    }}
                    animate={{
                      opacity: [0.3, 0.5, 0.3],
                      scale: [0.95, 1, 0.95],
                    }}
                    transition={{
                      duration: 2,
                      ease: "easeInOut",
                      repeat: Infinity,
                    }}
                  />
                </motion.div>

                {/* Content */}
                <div className="relative bg-black/90 backdrop-blur-xl rounded-2xl p-6 space-y-4">
                  <div className="text-center space-y-2">
                    <motion.h3
                      className="text-lg font-bold text-blue-400"
                      animate={{
                        opacity: [0.5, 1, 0.5],
                      }}
                      transition={{
                        duration: 1.5,
                        ease: "easeInOut",
                        repeat: Infinity,
                      }}
                    >
                      No API Key?
                    </motion.h3>
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
                      Try Vibe Mode
                    </h2>
                  </div>

                  <div className="space-y-3 text-center">
                    <p className="text-sm text-gray-300">
                      Unlimited LLM calls powered by local AI & the Vibe network
                    </p>

                    <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                      <svg
                        className="w-4 h-4 text-green-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>No cloud dependency</span>
                    </div>

                    <div className="flex items-center justify-center space-x-2 text-xs text-gray-400">
                      <svg
                        className="w-4 h-4 text-green-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span>100% private & secure</span>
                    </div>
                  </div>

                  <button className="w-full bg-black/50 border border-white/20 rounded-xl p-4 flex items-center justify-center space-x-3 hover:bg-white/10 transition-all group">
                    {/* Apple Pay icon */}
                    <svg
                      className="w-8 h-8"
                      viewBox="0 0 50 20"
                      fill="currentColor"
                    >
                      <path
                        d="M9.53 2.77c.55-.7.93-1.66.82-2.62-.8.03-1.76.53-2.33 1.2-.51.59-.96 1.53-.84 2.43.89.07 1.8-.45 2.35-1.01zm.82 1.17c-1.3-.08-2.4.74-3.02.74-.62 0-1.57-.7-2.58-.68-1.33.02-2.56.77-3.24 1.97-1.39 2.4-.36 5.96.99 7.91.66.96 1.45 2.03 2.48 1.99.99-.04 1.37-.64 2.57-.64 1.2 0 1.54.64 2.59.62 1.07-.02 1.75-.97 2.4-1.94.76-1.11 1.07-2.18 1.09-2.24-.02-.01-2.1-.81-2.12-3.2-.02-2 1.63-2.95 1.7-3-.93-1.37-2.37-1.52-2.88-1.56l.02.03zm9.84-2.15v11.42h2.47v-3.91h3.42c3.13 0 5.33-2.15 5.33-5.26s-2.17-5.25-5.23-5.25h-5.99zm2.47 2.08h2.85c2.15 0 3.38 1.15 3.38 3.18 0 2.03-1.23 3.19-3.39 3.19h-2.84V3.87zm11.9 3.69c0 2.81 1.55 4.62 3.96 4.62 1.28 0 2.18-.57 2.74-1.39h.04v1.31h2.29V7.31h-2.37v1.24h-.04c-.53-.79-1.42-1.32-2.68-1.32-2.38 0-3.94 1.82-3.94 4.62zm2.48 0c0-1.63.84-2.7 2.13-2.7 1.27 0 2.11 1.08 2.11 2.7 0 1.63-.85 2.71-2.11 2.71-1.28 0-2.13-1.07-2.13-2.71zm7.9 6.47c1.52 0 2.24-.73 2.86-1.86l2.74-7.21-2.52-.01-1.64 5.28h-.04l-1.64-5.28h-2.59l2.64 6.84-.14.44c-.24.61-.62.87-1.31.87-.12 0-.36 0-.46-.02v1.89c.09.03.49.06.6.06z"
                        className="text-white"
                      />
                    </svg>
                    <span className="text-white font-medium group-hover:text-blue-400 transition-colors">
                      Coming Soon
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex space-x-4 w-full max-w-md">
              <button
                onClick={() => setCurrentStep(0)}
                className="flex-1 px-6 py-3 bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/20 hover:bg-white/20 transition-all"
              >
                Back
              </button>
              <button
                onClick={async () => {
                  if (!apiKey.trim()) {
                    setApiKeyError("Please enter your API key");
                    return;
                  }

                  if (!apiKey.startsWith("sk-")) {
                    setApiKeyError("Invalid API key format");
                    return;
                  }

                  setIsValidatingKey(true);
                  try {
                    // Save the API key
                    const saved = await window.electronAPI?.ipcRenderer?.invoke(
                      "settings:set",
                      "openaiApiKey",
                      apiKey.trim(),
                    );

                    if (saved) {
                      setCurrentStep(2);
                    } else {
                      setApiKeyError("Failed to save API key");
                    }
                  } catch (error) {
                    console.error("Error saving API key:", error);
                    setApiKeyError("Failed to save API key");
                  } finally {
                    setIsValidatingKey(false);
                  }
                }}
                disabled={!apiKey.trim() || isValidatingKey}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {isValidatingKey ? "Saving..." : "Continue"}
              </button>
            </div>
          </motion.div>
        );

      case 2: // Chrome profile selection
        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col items-center justify-center space-y-8 text-white"
          >
            <div className="text-center space-y-4">
              <h2 className="text-4xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 bg-clip-text text-transparent">
                Import from Chrome
              </h2>
              <p className="text-lg text-gray-300">
                Select a Chrome profile to import your passwords
              </p>
            </div>

            <div className="w-full max-w-md space-y-3 relative z-10">
              {chromeProfiles.map(profile => (
                <button
                  key={profile.path}
                  onClick={async () => {
                    setSelectedProfile(profile.path);
                    // Get password count for this profile
                    try {
                      await window.electronAPI?.ipcRenderer?.invoke(
                        "password-import-get-count",
                        profile.path,
                      );
                    } catch (error) {
                      console.error("Failed to get password count:", error);
                    }
                  }}
                  className={`w-full p-4 rounded-xl border transition-all duration-200 ${
                    selectedProfile === profile.path
                      ? "bg-gradient-to-r from-cyan-500/20 to-purple-600/20 border-cyan-400"
                      : "bg-white/5 border-white/20 hover:bg-white/10"
                  }`}
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
                      <span className="text-white font-bold">
                        {profile.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="text-left flex-1">
                      <p className="font-semibold">{profile.name}</p>
                      <p className="text-sm text-gray-400">
                        Last used: {profile.lastModified.toLocaleDateString()}
                      </p>
                    </div>
                    {selectedProfile === profile.path && (
                      <div className="w-6 h-6 bg-cyan-400 rounded-full flex items-center justify-center">
                        <svg
                          className="w-4 h-4 text-black"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex space-x-4 w-full max-w-md relative z-10">
              <button
                onClick={() => setCurrentStep(1)}
                className="flex-1 px-6 py-3 bg-white/10 backdrop-blur-md rounded-xl text-white border border-white/20 hover:bg-white/20 transition-all"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={!selectedProfile || isProcessing}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {isProcessing ? "Importing..." : "Import & Finish"}
              </button>
            </div>

            {/* Gemini-style progress bar */}
            {isProcessing && (
              <div className="w-full max-w-md space-y-2">
                <GeminiProgressBar
                  progress={importProgress}
                  isProcessing={isProcessing}
                />
                <p className="text-sm text-gray-400 text-center">
                  {importStage || "Importing passwords from Chrome..."}
                  {importedCount > 0 && ` (${importedCount} passwords)`}
                </p>
              </div>
            )}
          </motion.div>
        );

      case 3: // Flashlight animation
        return (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-center h-full"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.5 }}
              className="text-center space-y-4"
            >
              <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto">
                <svg
                  className="w-12 h-12 text-white"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-white">All set!</h3>
              <p className="text-gray-300">Welcome to Vibe, {profileName}!</p>
            </motion.div>
          </motion.div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xl">
      {/* 3D Background */}
      <div className="absolute inset-0">
        <Canvas camera={{ position: [0, 0, 10], fov: 75 }}>
          <Suspense fallback={null}>
            <Scene />
          </Suspense>
        </Canvas>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex items-center justify-center p-8">
        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      </div>

      {/* Close button */}
      {currentStep < 3 && (
        <button
          onClick={() => window.close()}
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center text-white hover:bg-white/20 transition-all"
        >
          <svg
            className="w-5 h-5"
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
      )}
    </div>
  );
}
