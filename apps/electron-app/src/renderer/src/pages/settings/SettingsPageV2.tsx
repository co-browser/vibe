import { useState, useEffect, useRef, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, Sphere } from "@react-three/drei";
import * as THREE from "three";
import { motion } from "framer-motion";

// 3D Brain Component for Global Memory
function Brain3D() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(state => {
    if (meshRef.current) {
      meshRef.current.rotation.y = state.clock.getElapsedTime() * 0.3;
      meshRef.current.rotation.x =
        Math.sin(state.clock.getElapsedTime() * 0.5) * 0.1;
      meshRef.current.position.y =
        Math.sin(state.clock.getElapsedTime() * 2) * 0.1;
    }
  });

  return (
    <Float speed={1} rotationIntensity={0.5} floatIntensity={0.5}>
      <mesh ref={meshRef}>
        {/* Brain-like shape using multiple spheres */}
        <group>
          <Sphere args={[1, 32, 32]} position={[0, 0, 0]}>
            <meshStandardMaterial
              color="#ff6b6b"
              emissive="#ff6b6b"
              emissiveIntensity={0.2}
              roughness={0.3}
              metalness={0.8}
            />
          </Sphere>
          <Sphere args={[0.7, 32, 32]} position={[0.5, 0.3, 0.2]}>
            <meshStandardMaterial
              color="#ff9f6b"
              emissive="#ff9f6b"
              emissiveIntensity={0.2}
              roughness={0.3}
              metalness={0.8}
            />
          </Sphere>
          <Sphere args={[0.6, 32, 32]} position={[-0.4, 0.2, 0.3]}>
            <meshStandardMaterial
              color="#ff6b9f"
              emissive="#ff6b9f"
              emissiveIntensity={0.2}
              roughness={0.3}
              metalness={0.8}
            />
          </Sphere>
          <Sphere args={[0.5, 32, 32]} position={[0.3, -0.4, 0.2]}>
            <meshStandardMaterial
              color="#c56bff"
              emissive="#c56bff"
              emissiveIntensity={0.2}
              roughness={0.3}
              metalness={0.8}
            />
          </Sphere>
        </group>
      </mesh>
    </Float>
  );
}

// Settings sections
type SettingsSection = "global-memory" | "api-keys" | "agentic-keyring";

interface SidebarItem {
  id: SettingsSection;
  icon: string;
  label: string;
}

const sidebarItems: SidebarItem[] = [
  { id: "global-memory", icon: "🧠", label: "Global Memory" },
  { id: "api-keys", icon: "🔑", label: "API Keys" },
  { id: "agentic-keyring", icon: "🔐", label: "Agentic Keyring" },
];

export function SettingsPageV2() {
  const [activeSection, setActiveSection] =
    useState<SettingsSection>("global-memory");
  const [loading, setLoading] = useState(true);

  // API Keys state
  const [openAIKey, setOpenAIKey] = useState("");
  const [turboRouterKey, setTurboRouterKey] = useState("");

  // Agentic Keyring state
  const [gmailLinked, setGmailLinked] = useState(false);
  const [gmailEmail, setGmailEmail] = useState("");
  const [passwords, setPasswords] = useState<
    Array<{
      id: string;
      url: string;
      username: string;
      createdAt: Date;
    }>
  >([]);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      console.log("[SettingsPageV2] Loading settings...");

      // Load API keys from secure storage
      console.log("[SettingsPageV2] Getting openaiApiKey...");
      const savedOpenAIKey =
        (await window.vibe?.settings.get("openaiApiKey")) || "";
      console.log(
        "[SettingsPageV2] Retrieved openaiApiKey:",
        savedOpenAIKey ? "***" : "empty",
      );

      console.log("[SettingsPageV2] Getting turboRouterKey...");
      const savedTurboKey =
        (await window.vibe?.settings.get("turboRouterKey")) || "";
      console.log(
        "[SettingsPageV2] Retrieved turboRouterKey:",
        savedTurboKey ? "***" : "empty",
      );

      setOpenAIKey(savedOpenAIKey);
      setTurboRouterKey(savedTurboKey);

      // Check Gmail auth status
      console.log("[SettingsPageV2] Checking Gmail auth status...");
      const gmailAuth = await window.vibe?.app.gmail.checkAuth();
      console.log("[SettingsPageV2] Gmail auth status:", gmailAuth);
      if (gmailAuth?.authenticated) {
        setGmailLinked(true);
        // Email is not provided in checkAuth response
        setGmailEmail("Connected");
      }

      // Load imported passwords
      console.log("[SettingsPageV2] Loading profile passwords...");
      const profile = await window.electronAPI?.ipcRenderer?.invoke(
        "settings:get-profile",
      );
      if (profile?.success) {
        const profileId = profile.profile.id;
        const profilePasswords = await window.electronAPI?.ipcRenderer?.invoke(
          "settings:get-passwords",
          profileId,
        );
        if (profilePasswords) {
          console.log(
            "[SettingsPageV2] Loaded passwords count:",
            profilePasswords.length,
          );
          setPasswords(profilePasswords);
        }
      }
    } catch (error) {
      console.error("[SettingsPageV2] Failed to load settings:", error);
    } finally {
      setLoading(false);
      console.log("[SettingsPageV2] Settings loading complete");
    }
  };

  const saveApiKey = async (keyType: "openai" | "turbo", value: string) => {
    try {
      const keyName = keyType === "openai" ? "openaiApiKey" : "turboRouterKey";
      console.log(`[SettingsPageV2] Saving ${keyName}...`);

      await window.vibe?.settings.set(keyName, value);
      console.log(`[SettingsPageV2] Successfully saved ${keyName}`);

      // Verify it was saved
      console.log(`[SettingsPageV2] Verifying saved ${keyName}...`);
      const verifyValue = await window.vibe?.settings.get(keyName);
      console.log(
        `[SettingsPageV2] Verification - ${keyName} matches:`,
        verifyValue === value,
      );
    } catch (error) {
      console.error(`[SettingsPageV2] Failed to save ${keyType} key:`, error);
    }
  };

  const linkGmail = async () => {
    try {
      const result = await window.vibe?.app.gmail.startAuth();
      if (result?.success) {
        setGmailLinked(true);
        setGmailEmail("Connected");
        // Re-check auth status to get updated info
        const updatedAuth = await window.vibe?.app.gmail.checkAuth();
        if (updatedAuth?.authenticated) {
          setGmailEmail("Connected");
        }
      }
    } catch (error) {
      console.error("Failed to link Gmail:", error);
    }
  };

  const unlinkGmail = async () => {
    try {
      await window.vibe?.app.gmail.clearAuth();
      setGmailLinked(false);
      setGmailEmail("");
    } catch (error) {
      console.error("Failed to unlink Gmail:", error);
    }
  };

  const closeSettings = () => {
    window.electronAPI?.ipcRenderer?.invoke("settings:close");
  };

  if (loading) {
    return (
      <div className="h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-800"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-50 flex overflow-hidden">
      {/* Xcode-style Sidebar */}
      <div className="w-64 bg-gray-100 border-r border-gray-200">
        <div className="h-11 bg-gray-200 border-b border-gray-300 flex items-center px-4">
          <h1 className="text-sm font-medium text-gray-800">Settings</h1>
        </div>

        <div className="p-2">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2 rounded-md text-sm transition-colors ${
                activeSection === item.id
                  ? "bg-blue-500 text-white"
                  : "text-gray-700 hover:bg-gray-200"
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-white">
        {/* Title Bar */}
        <div className="h-11 bg-gray-100 border-b border-gray-200 flex items-center justify-between px-6">
          <h2 className="text-sm font-medium text-gray-800">
            {sidebarItems.find(item => item.id === activeSection)?.label}
          </h2>
          <button
            onClick={closeSettings}
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            <svg
              className="w-4 h-4"
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
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {activeSection === "global-memory" && (
            <div className="h-full flex items-center justify-center p-8">
              <div className="w-96 h-96">
                <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
                  <Suspense fallback={null}>
                    <ambientLight intensity={0.5} />
                    <pointLight position={[10, 10, 10]} intensity={1} />
                    <pointLight
                      position={[-10, -10, -10]}
                      color="#ff6b6b"
                      intensity={0.5}
                    />
                    <Brain3D />
                  </Suspense>
                </Canvas>
              </div>
            </div>
          )}

          {activeSection === "api-keys" && (
            <div className="p-8 max-w-2xl">
              <div className="space-y-6">
                {/* OpenAI API Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    OpenAI API Key
                  </label>
                  <input
                    type="password"
                    value={openAIKey}
                    onChange={e => setOpenAIKey(e.target.value)}
                    onBlur={() => saveApiKey("openai", openAIKey)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Used for GPT-4 and other OpenAI models
                  </p>
                </div>

                {/* CoBrowser Turbo Router Key */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    CoBrowser Turbo Router
                  </label>
                  <input
                    type="password"
                    value={turboRouterKey}
                    onChange={e => setTurboRouterKey(e.target.value)}
                    onBlur={() => saveApiKey("turbo", turboRouterKey)}
                    placeholder="cbtr-..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Premium routing for faster AI responses
                  </p>
                </div>

                {/* Apple Pay Button */}
                <div className="pt-4">
                  <button className="w-full bg-black text-white py-3 px-6 rounded-lg font-medium flex items-center justify-center space-x-2 hover:bg-gray-800 transition-colors">
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
                    </svg>
                    <span>Subscribe with Apple Pay</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeSection === "agentic-keyring" && (
            <div className="p-8">
              {/* Gmail Account Section */}
              <div className="mb-8 pb-8 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Gmail Account
                </h3>
                {gmailLinked ? (
                  <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                        <svg
                          className="w-6 h-6 text-white"
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
                      <div>
                        <p className="font-medium text-gray-900">Connected</p>
                        <p className="text-sm text-gray-600">{gmailEmail}</p>
                      </div>
                    </div>
                    <button
                      onClick={unlinkGmail}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                    >
                      Unlink
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={linkGmail}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                  >
                    Link Gmail Account
                  </button>
                )}
              </div>

              {/* Imported Passwords Section */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  Imported Passwords ({passwords.length})
                </h3>
                <div className="space-y-2">
                  {passwords.length === 0 ? (
                    <p className="text-gray-500 text-sm">
                      No passwords imported yet
                    </p>
                  ) : (
                    passwords.map(password => (
                      <motion.div
                        key={password.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                            <span className="text-xs font-medium text-gray-600">
                              {new URL(password.url).hostname
                                .charAt(0)
                                .toUpperCase()}
                            </span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-900">
                              {new URL(password.url).hostname}
                            </p>
                            <p className="text-xs text-gray-500">
                              {password.username}
                            </p>
                          </div>
                        </div>
                        <p className="text-xs text-gray-400">
                          {new Date(password.createdAt).toLocaleDateString()}
                        </p>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default SettingsPageV2;
