import { useState, useEffect } from "react";

/**
 * SettingsPage - Application settings with profile service integration
 */
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentProfile, setCurrentProfile] = useState(null);

  // Profile settings
  const [theme, setTheme] = useState("system");
  const [fontSize, setFontSize] = useState(16);
  const [language, setLanguage] = useState("en");
  const [defaultSearchEngine, setDefaultSearchEngine] = useState("google");

  // AI & Models settings
  const [selectedLLMProvider, setSelectedLLMProvider] = useState("openai");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [selectedVectorStorage, setSelectedVectorStorage] =
    useState("pinecone");
  const [vectorApiKey, setVectorApiKey] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxResponseLength, setMaxResponseLength] = useState("2048");

  // Privacy settings
  const [blockThirdPartyCookies, setBlockThirdPartyCookies] = useState(true);
  const [clearCookiesOnExit, setClearCookiesOnExit] = useState(false);
  const [blockTrackers, setBlockTrackers] = useState(true);
  const [blockFingerprinting, setBlockFingerprinting] = useState(true);
  const [storeChatHistoryLocally, setStoreChatHistoryLocally] = useState(true);
  const [shareAnonymousUsageData, setShareAnonymousUsageData] = useState(false);

  // Advanced settings
  const [enableDeveloperMode, setEnableDeveloperMode] = useState(false);
  const [showDebugInformation, setShowDebugInformation] = useState(false);
  const [hardwareAcceleration, setHardwareAcceleration] = useState(true);
  const [preloadPages, setPreloadPages] = useState(true);

  const tabs = [
    { id: "general", name: "General", icon: "⚙️" },
    { id: "ai", name: "AI & Models", icon: "🤖" },
    { id: "privacy", name: "Privacy", icon: "🔒" },
    { id: "appearance", name: "Appearance", icon: "🎨" },
    { id: "advanced", name: "Advanced", icon: "🔧" },
  ];

  const llmProviders = [
    { value: "openai", label: "OpenAI (GPT-4, GPT-3.5)" },
    { value: "anthropic", label: "Anthropic (Claude)" },
    { value: "google", label: "Google (Gemini)" },
    { value: "mistral", label: "Mistral AI" },
    { value: "ollama", label: "Ollama (Local)" },
  ];

  const vectorStorageProviders = [
    { value: "pinecone", label: "Pinecone" },
    { value: "weaviate", label: "Weaviate" },
    { value: "qdrant", label: "Qdrant" },
    { value: "chroma", label: "ChromaDB" },
    { value: "local", label: "Local Storage" },
  ];

  // Handle escape key to close only settings window
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeSettings();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Load settings on component mount
  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);

      // Load current profile
      const profileResult = await window.electronAPI?.ipcRenderer?.invoke(
        "settings:get-profile",
      );
      if (profileResult?.success) {
        setCurrentProfile(profileResult.profile);

        // Load settings from profile
        const profileSettings = profileResult.profile.settings;
        setTheme(profileSettings.theme || "system");
        setFontSize(profileSettings.fontSize || 16);
        setLanguage(profileSettings.language || "en");
        setDefaultSearchEngine(profileSettings.defaultSearchEngine || "google");
      }

      // Load AI settings from secure store
      const llmProvider =
        (await window.vibe?.settings.get("llmProvider")) || "openai";
      const llmApiKeyValue =
        (await window.vibe?.settings.get("llmApiKey")) || "";
      const vectorStorage =
        (await window.vibe?.settings.get("vectorStorage")) || "pinecone";
      const vectorApiKeyValue =
        (await window.vibe?.settings.get("vectorApiKey")) || "";
      const temperatureValue =
        (await window.vibe?.settings.get("temperature")) || 0.7;
      const maxResponseLengthValue =
        (await window.vibe?.settings.get("maxResponseLength")) || "2048";

      setSelectedLLMProvider(llmProvider);
      setLlmApiKey(llmApiKeyValue);
      setSelectedVectorStorage(vectorStorage);
      setVectorApiKey(vectorApiKeyValue);
      setTemperature(temperatureValue);
      setMaxResponseLength(maxResponseLengthValue);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      setSaving(true);

      // Save profile settings
      if (currentProfile) {
        await window.electronAPI?.ipcRenderer?.invoke(
          "settings:update-profile",
          {
            settings: {
              theme,
              fontSize,
              language,
              defaultSearchEngine,
            },
          },
        );
      }

      // Save AI settings to secure store
      await window.vibe?.settings.set("llmProvider", selectedLLMProvider);
      await window.vibe?.settings.set("llmApiKey", llmApiKey);
      await window.vibe?.settings.set("vectorStorage", selectedVectorStorage);
      await window.vibe?.settings.set("vectorApiKey", vectorApiKey);
      await window.vibe?.settings.set("temperature", temperature);
      await window.vibe?.settings.set("maxResponseLength", maxResponseLength);

      // Save privacy and advanced settings
      await window.vibe?.settings.set(
        "blockThirdPartyCookies",
        blockThirdPartyCookies,
      );
      await window.vibe?.settings.set("clearCookiesOnExit", clearCookiesOnExit);
      await window.vibe?.settings.set("blockTrackers", blockTrackers);
      await window.vibe?.settings.set(
        "blockFingerprinting",
        blockFingerprinting,
      );
      await window.vibe?.settings.set(
        "storeChatHistoryLocally",
        storeChatHistoryLocally,
      );
      await window.vibe?.settings.set(
        "shareAnonymousUsageData",
        shareAnonymousUsageData,
      );
      await window.vibe?.settings.set(
        "enableDeveloperMode",
        enableDeveloperMode,
      );
      await window.vibe?.settings.set(
        "showDebugInformation",
        showDebugInformation,
      );
      await window.vibe?.settings.set(
        "hardwareAcceleration",
        hardwareAcceleration,
      );
      await window.vibe?.settings.set("preloadPages", preloadPages);

      console.log("Settings saved successfully");
    } catch (error) {
      console.error("Failed to save settings:", error);
    } finally {
      setSaving(false);
    }
  };

  const closeSettings = () => {
    window.electronAPI?.ipcRenderer?.invoke("settings:close");
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            Loading settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar - Safari-style */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
              Settings
            </h1>
            <nav className="space-y-1">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  }`}
                >
                  <span className="text-lg">{tab.icon}</span>
                  <span className="font-medium">{tab.name}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-auto">
          <div className="p-8">
            {activeTab === "general" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                  General
                </h2>
                <div className="space-y-8">
                  {/* Theme Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Appearance
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Theme
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { value: "light", label: "Light" },
                            { value: "dark", label: "Dark" },
                            { value: "system", label: "System" },
                          ].map(themeOption => (
                            <button
                              key={themeOption.value}
                              onClick={() => setTheme(themeOption.value)}
                              className={`p-4 border rounded-lg text-center transition-colors ${
                                theme === themeOption.value
                                  ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                                  : "border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              }`}
                            >
                              {themeOption.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Text Size
                        </label>
                        <div className="space-y-2">
                          <input
                            type="range"
                            min="12"
                            max="24"
                            value={fontSize}
                            onChange={e =>
                              setFontSize(parseInt(e.target.value))
                            }
                            className="w-full"
                          />
                          <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                            <span>Small</span>
                            <span>Medium</span>
                            <span>Large</span>
                          </div>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Current size: {fontSize}px
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Search Engine Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Search
                    </h3>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Default Search Engine
                      </label>
                      <select
                        value={defaultSearchEngine}
                        onChange={e => setDefaultSearchEngine(e.target.value)}
                        className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      >
                        <option value="google">Google</option>
                        <option value="bing">Bing</option>
                        <option value="duckduckgo">DuckDuckGo</option>
                        <option value="yahoo">Yahoo</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "ai" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                  AI & Models
                </h2>
                <div className="space-y-8">
                  {/* LLM Provider Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Language Model Provider
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Select LLM Provider
                        </label>
                        <select
                          value={selectedLLMProvider}
                          onChange={e => setSelectedLLMProvider(e.target.value)}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          {llmProviders.map(provider => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          API Key
                        </label>
                        <input
                          type="text"
                          value={llmApiKey}
                          onChange={e => setLlmApiKey(e.target.value)}
                          placeholder="Enter your API key"
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Your API key is stored securely and never shared
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Vector Storage Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Vector Storage
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Select Vector Storage
                        </label>
                        <select
                          value={selectedVectorStorage}
                          onChange={e =>
                            setSelectedVectorStorage(e.target.value)
                          }
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          {vectorStorageProviders.map(provider => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          API Key
                        </label>
                        <input
                          type="text"
                          value={vectorApiKey}
                          onChange={e => setVectorApiKey(e.target.value)}
                          placeholder="Enter your API key"
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                          disabled={selectedVectorStorage === "local"}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {selectedVectorStorage === "local"
                            ? "No API key required for local storage"
                            : "Required for cloud-based vector storage providers"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Model Configuration */}
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Model Configuration
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                          Temperature (Creativity)
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={temperature}
                          onChange={e =>
                            setTemperature(parseFloat(e.target.value))
                          }
                          className="w-full"
                        />
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                          <span>Focused (0.0)</span>
                          <span>Balanced ({temperature})</span>
                          <span>Creative (1.0)</span>
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Max Response Length
                        </label>
                        <select
                          value={maxResponseLength}
                          onChange={e => setMaxResponseLength(e.target.value)}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          <option value="1024">Short (1024 tokens)</option>
                          <option value="2048">Medium (2048 tokens)</option>
                          <option value="4096">Long (4096 tokens)</option>
                          <option value="8192">Very Long (8192 tokens)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "privacy" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                  Privacy & Security
                </h2>
                <div className="space-y-8">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Cookies and Site Data
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Block third-party cookies
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Prevents websites from tracking you across the web
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={blockThirdPartyCookies}
                          onChange={e =>
                            setBlockThirdPartyCookies(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Clear cookies on exit
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Automatically clear all cookies when you close the
                            browser
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={clearCookiesOnExit}
                          onChange={e =>
                            setClearCookiesOnExit(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Tracking Protection
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Block trackers
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Block known tracking scripts and requests
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={blockTrackers}
                          onChange={e => setBlockTrackers(e.target.checked)}
                          className="toggle"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Block fingerprinting
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Prevent websites from creating unique device
                            fingerprints
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={blockFingerprinting}
                          onChange={e =>
                            setBlockFingerprinting(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      AI Data Privacy
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Store chat history locally
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Keep your chat conversations on your device only
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={storeChatHistoryLocally}
                          onChange={e =>
                            setStoreChatHistoryLocally(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Share anonymous usage data
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Help improve Vibe Browser with anonymous usage
                            statistics
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={shareAnonymousUsageData}
                          onChange={e =>
                            setShareAnonymousUsageData(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                  Appearance
                </h2>
                <div className="space-y-8">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Theme
                    </h3>
                    <div className="space-y-4">
                      {[
                        {
                          value: "system",
                          label: "System default",
                          description: "Follow your system appearance setting",
                        },
                        {
                          value: "light",
                          label: "Light",
                          description: "Use light theme",
                        },
                        {
                          value: "dark",
                          label: "Dark",
                          description: "Use dark theme",
                        },
                      ].map(themeOption => (
                        <label
                          key={themeOption.value}
                          className="flex items-start space-x-3"
                        >
                          <input
                            type="radio"
                            name="theme"
                            value={themeOption.value}
                            checked={theme === themeOption.value}
                            onChange={e => setTheme(e.target.value)}
                            className="mt-1"
                          />
                          <div>
                            <span className="text-gray-700 dark:text-gray-300 font-medium">
                              {themeOption.label}
                            </span>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                              {themeOption.description}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Text Size
                    </h3>
                    <div className="space-y-4">
                      <input
                        type="range"
                        min="12"
                        max="24"
                        value={fontSize}
                        onChange={e => setFontSize(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>Small</span>
                        <span>Medium</span>
                        <span>Large</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Current size: {fontSize}px
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "advanced" && (
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-6">
                  Advanced Settings
                </h2>
                <div className="space-y-8">
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Developer Tools
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Enable developer mode
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Show additional developer options and debugging
                            tools
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={enableDeveloperMode}
                          onChange={e =>
                            setEnableDeveloperMode(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Show debug information
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Display technical information for troubleshooting
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={showDebugInformation}
                          onChange={e =>
                            setShowDebugInformation(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                      Performance
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Hardware acceleration
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Use GPU acceleration for better performance
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={hardwareAcceleration}
                          onChange={e =>
                            setHardwareAcceleration(e.target.checked)
                          }
                          className="toggle"
                        />
                      </label>
                      <label className="flex items-center justify-between">
                        <div>
                          <span className="text-gray-700 dark:text-gray-300 font-medium">
                            Preload pages
                          </span>
                          <p className="text-sm text-gray-500 dark:text-gray-400">
                            Preload linked pages for faster navigation
                          </p>
                        </div>
                        <input
                          type="checkbox"
                          checked={preloadPages}
                          onChange={e => setPreloadPages(e.target.checked)}
                          className="toggle"
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
              <div className="flex justify-between items-center">
                <button
                  onClick={closeSettings}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <div className="space-x-3">
                  <button
                    onClick={() => {
                      setTheme("system");
                      setFontSize(16);
                      setLanguage("en");
                      setDefaultSearchEngine("google");
                      setSelectedLLMProvider("openai");
                      setLlmApiKey("");
                      setSelectedVectorStorage("pinecone");
                      setVectorApiKey("");
                      setTemperature(0.7);
                      setMaxResponseLength("2048");
                      setBlockThirdPartyCookies(true);
                      setClearCookiesOnExit(false);
                      setBlockTrackers(true);
                      setBlockFingerprinting(true);
                      setStoreChatHistoryLocally(true);
                      setShareAnonymousUsageData(false);
                      setEnableDeveloperMode(false);
                      setShowDebugInformation(false);
                      setHardwareAcceleration(true);
                      setPreloadPages(true);
                    }}
                    className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={saving}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
