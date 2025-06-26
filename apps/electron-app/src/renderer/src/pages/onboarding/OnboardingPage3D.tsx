import { useState, useRef, useEffect, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Box, Sphere, Stars } from "@react-three/drei";
import * as THREE from "three";
import { motion, AnimatePresence } from "framer-motion";

// Types
interface ChromeProfile {
  name: string;
  path: string;
  lastModified: Date;
  browser: string;
}

// 3D Browser Icon Components
function ChromeIcon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(state => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.3;
    }
  });

  return (
    <Float speed={1.5} rotationIntensity={0.3} floatIntensity={1}>
      <group ref={ref} position={position}>
        {/* Chrome colors: red, yellow, green, blue */}
        <mesh position={[0, 0.5, 0]} rotation={[0, 0, Math.PI * 0.75]}>
          <torusGeometry args={[1, 0.3, 8, 16, Math.PI * 0.5]} />
          <meshStandardMaterial
            color="#EA4335"
            emissive="#EA4335"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0, -0.5, 0]} rotation={[0, 0, -Math.PI * 0.25]}>
          <torusGeometry args={[1, 0.3, 8, 16, Math.PI * 0.5]} />
          <meshStandardMaterial
            color="#FBBC05"
            emissive="#FBBC05"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[-0.5, 0, 0]} rotation={[0, 0, Math.PI * 0.25]}>
          <torusGeometry args={[1, 0.3, 8, 16, Math.PI * 0.5]} />
          <meshStandardMaterial
            color="#34A853"
            emissive="#34A853"
            emissiveIntensity={0.3}
          />
        </mesh>
        <mesh position={[0.5, 0, 0]} rotation={[0, 0, -Math.PI * 0.75]}>
          <torusGeometry args={[1, 0.3, 8, 16, Math.PI * 0.5]} />
          <meshStandardMaterial
            color="#4285F4"
            emissive="#4285F4"
            emissiveIntensity={0.3}
          />
        </mesh>
        <Sphere args={[0.5, 32, 16]}>
          <meshStandardMaterial
            color="#4285F4"
            emissive="#4285F4"
            emissiveIntensity={0.2}
          />
        </Sphere>
      </group>
    </Float>
  );
}

function MosaicIcon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(state => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.25;
      ref.current.rotation.x =
        Math.sin(state.clock.getElapsedTime() * 0.5) * 0.1;
    }
  });

  return (
    <Float speed={2} rotationIntensity={0.5} floatIntensity={1.5}>
      <mesh ref={ref} position={position}>
        <dodecahedronGeometry args={[1.2, 0]} />
        <meshStandardMaterial
          color="#0080FF"
          emissive="#0080FF"
          emissiveIntensity={0.4}
          roughness={0.3}
          metalness={0.7}
        />
      </mesh>
    </Float>
  );
}

function NetscapeIcon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(state => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.4;
    }
  });

  return (
    <Float speed={1.8} rotationIntensity={0.4} floatIntensity={1.2}>
      <group ref={ref} position={position}>
        {/* Netscape "N" with stars */}
        <Box args={[0.3, 2, 0.3]} position={[-0.7, 0, 0]}>
          <meshStandardMaterial
            color="#00A0A0"
            emissive="#00A0A0"
            emissiveIntensity={0.3}
          />
        </Box>
        <Box args={[0.3, 2, 0.3]} position={[0.7, 0, 0]}>
          <meshStandardMaterial
            color="#00A0A0"
            emissive="#00A0A0"
            emissiveIntensity={0.3}
          />
        </Box>
        <Box
          args={[1.4, 0.3, 0.3]}
          position={[0, 0, 0]}
          rotation={[0, 0, Math.PI / 4]}
        >
          <meshStandardMaterial
            color="#00A0A0"
            emissive="#00A0A0"
            emissiveIntensity={0.3}
          />
        </Box>
        {/* Stars around */}
        {[0, 1, 2, 3].map(i => (
          <mesh
            key={i}
            position={[
              Math.cos((i / 4) * Math.PI * 2) * 1.5,
              Math.sin((i / 4) * Math.PI * 2) * 1.5,
              0,
            ]}
          >
            <coneGeometry args={[0.2, 0.4, 4]} />
            <meshStandardMaterial
              color="#FFD700"
              emissive="#FFD700"
              emissiveIntensity={0.5}
            />
          </mesh>
        ))}
      </group>
    </Float>
  );
}

function IEIcon({ position }: { position: [number, number, number] }) {
  const ref = useRef<THREE.Group>(null);

  useFrame(state => {
    if (ref.current) {
      ref.current.rotation.y = state.clock.getElapsedTime() * 0.35;
      ref.current.position.y =
        position[1] + Math.sin(state.clock.getElapsedTime()) * 0.2;
    }
  });

  return (
    <group ref={ref} position={position}>
      {/* Internet Explorer "e" */}
      <mesh>
        <torusGeometry args={[1, 0.4, 8, 32]} />
        <meshStandardMaterial
          color="#1EBBEE"
          emissive="#1EBBEE"
          emissiveIntensity={0.3}
        />
      </mesh>
      <Box args={[2, 0.3, 0.3]} position={[0, 0, 0]}>
        <meshStandardMaterial
          color="#1EBBEE"
          emissive="#1EBBEE"
          emissiveIntensity={0.3}
        />
      </Box>
      {/* Yellow swoosh */}
      <mesh
        position={[0.5, -0.5, 0.5]}
        rotation={[0, Math.PI / 4, Math.PI / 6]}
      >
        <torusGeometry args={[0.8, 0.2, 6, 16, Math.PI * 0.7]} />
        <meshStandardMaterial
          color="#FFD700"
          emissive="#FFD700"
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

// 3D Background Scene Component
function Scene({ step }: { step: number }) {
  const lightRef = useRef<THREE.SpotLight>(null);

  useFrame(state => {
    if (lightRef.current && step === 2) {
      // Flashlight effect on step 3
      const mouseX = state.mouse.x * 5;
      const mouseY = state.mouse.y * 5;
      lightRef.current.position.x = mouseX;
      lightRef.current.position.y = mouseY;
    }
  });

  return (
    <>
      <fog attach="fog" args={["#000", 5, 30]} />
      <ambientLight intensity={0.1} />

      {/* Soft lighting */}
      <pointLight position={[10, 10, 10]} color="#4444ff" intensity={1} />
      <pointLight position={[-10, 10, -10]} color="#ff4444" intensity={1} />

      {/* Flashlight for final step */}
      {step === 2 && (
        <spotLight
          ref={lightRef}
          position={[0, 5, 5]}
          angle={0.3}
          penumbra={1}
          intensity={5}
          color="#ffffff"
          castShadow
        />
      )}

      {/* Browser Icons */}
      <ChromeIcon position={[-4, 2, -8]} />
      <MosaicIcon position={[4, 1, -6]} />
      <NetscapeIcon position={[-2, -1, -10]} />
      <IEIcon position={[3, -2, -7]} />

      {/* Volumetric fog plane at bottom */}
      <mesh position={[0, -4, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[50, 50]} />
        <meshStandardMaterial
          color="#ffffff"
          emissive="#4444ff"
          emissiveIntensity={0.1}
          opacity={0.3}
          transparent
        />
      </mesh>

      {/* Additional fog layers for volumetric effect */}
      {[0, 1, 2, 3, 4].map(i => (
        <mesh
          key={i}
          position={[0, -3.5 + i * 0.3, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[40 - i * 5, 40 - i * 5]} />
          <meshStandardMaterial
            color="#ffffff"
            emissive="#6666ff"
            emissiveIntensity={0.05}
            opacity={0.1 - i * 0.02}
            transparent
          />
        </mesh>
      ))}

      <Stars
        radius={100}
        depth={50}
        count={3000}
        factor={4}
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

  // Get Chrome profiles on mount
  useEffect(() => {
    const loadChromeProfiles = async () => {
      try {
        // This would be called via IPC in real implementation
        const profiles = await window.electronAPI?.ipcRenderer?.invoke(
          "onboarding:get-chrome-profiles",
        );
        if (profiles) {
          setChromeProfiles(
            profiles.filter((p: any) => p.browser === "chrome"),
          );
        }
      } catch (error) {
        console.error("Failed to load Chrome profiles:", error);
        // Mock data for development
        setChromeProfiles([
          {
            name: "Default",
            path: "/path/to/default",
            lastModified: new Date(),
            browser: "chrome",
          },
          {
            name: "Personal",
            path: "/path/to/personal",
            lastModified: new Date(),
            browser: "chrome",
          },
        ]);
      }
    };
    loadChromeProfiles();
  }, []);

  const handleComplete = async () => {
    setIsProcessing(true);
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
        setCurrentStep(2);

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
                onClick={() => profileName.trim() && setCurrentStep(1)}
                disabled={!profileName.trim()}
                className="w-full px-8 py-4 bg-gradient-to-r from-cyan-500 to-purple-600 text-white rounded-xl font-medium hover:from-cyan-600 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 transform hover:scale-105"
              >
                Continue
              </button>
            </div>
          </motion.div>
        );

      case 1: // Chrome profile selection
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

            <div className="w-full max-w-md space-y-3">
              {chromeProfiles.map(profile => (
                <button
                  key={profile.path}
                  onClick={() => setSelectedProfile(profile.path)}
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

            <div className="flex space-x-4 w-full max-w-md">
              <button
                onClick={() => setCurrentStep(0)}
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
          </motion.div>
        );

      case 2: // Flashlight animation
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
            <Scene step={currentStep} />
          </Suspense>
        </Canvas>
      </div>

      {/* Content Overlay */}
      <div className="relative z-10 h-full flex items-center justify-center p-8">
        <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
      </div>

      {/* Close button */}
      {currentStep < 2 && (
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
