import React, { useState } from 'react';

/**
 * SettingsPage - Placeholder component for application settings
 */
export function SettingsPage() {
  const [activeTab, setActiveTab] = useState('general');
  
  // LLM Provider settings
  const [selectedLLMProvider, setSelectedLLMProvider] = useState('openai'); // Default to first option
  const [llmApiKey, setLlmApiKey] = useState('');
  
  // Vector Storage settings
  const [selectedVectorStorage, setSelectedVectorStorage] = useState('pinecone'); // Default to first option
  const [vectorApiKey, setVectorApiKey] = useState('');

  const tabs = [
    { id: 'general', name: 'General', icon: '⚙️' },
    { id: 'ai', name: 'AI & Models', icon: '🤖' },
    { id: 'privacy', name: 'Privacy', icon: '🔒' },
    { id: 'appearance', name: 'Appearance', icon: '🎨' },
    { id: 'advanced', name: 'Advanced', icon: '🔧' },
  ];

  const llmProviders = [
    { value: 'openai', label: 'OpenAI (GPT-4, GPT-3.5)' },
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'google', label: 'Google (Gemini)' },
    { value: 'mistral', label: 'Mistral AI' },
    { value: 'ollama', label: 'Ollama (Local)' },
  ];

  const vectorStorageProviders = [
    { value: 'pinecone', label: 'Pinecone' },
    { value: 'weaviate', label: 'Weaviate' },
    { value: 'qdrant', label: 'Qdrant' },
    { value: 'chroma', label: 'ChromaDB' },
    { value: 'local', label: 'Local Storage' },
  ];

  const handleSaveSettings = async () => {
    try {
      // Save settings using vibe API
      await window.vibe.settings.set('llmProvider', selectedLLMProvider);
      await window.vibe.settings.set('llmApiKey', llmApiKey);
      await window.vibe.settings.set('vectorStorage', selectedVectorStorage);
      await window.vibe.settings.set('vectorApiKey', vectorApiKey);
      
      console.log('Settings saved successfully');
      // You could show a success message here
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  };

return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="flex h-screen">
        {/* Sidebar */}
        <div className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          <div className="p-6">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>
            <nav className="space-y-2">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400'
                      : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
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
            {activeTab === 'general' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">General Settings</h2>
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Startup</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="radio" name="startup" className="mr-3" defaultChecked />
                        <span className="text-gray-700 dark:text-gray-300">Open new tab page</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="startup" className="mr-3" />
                        <span className="text-gray-700 dark:text-gray-300">Continue where you left off</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="startup" className="mr-3" />
                        <span className="text-gray-700 dark:text-gray-300">Open specific pages</span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Default Search Engine</h3>
                    <select className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                      <option>Google</option>
                      <option>Bing</option>
                      <option>DuckDuckGo</option>
                      <option>Yahoo</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">AI & Models Configuration</h2>
                <div className="space-y-6">
                  {/* LLM Provider Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Language Model Provider</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Select LLM Provider
                        </label>
                        <select 
                          value={selectedLLMProvider}
                          onChange={(e) => setSelectedLLMProvider(e.target.value)}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          {llmProviders.map((provider) => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          LLM Provider API Key
                        </label>
                        <input
                          type="password"
                          value={llmApiKey}
                          onChange={(e) => setLlmApiKey(e.target.value)}
                          placeholder="Enter your API key for the selected LLM provider"
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Your API key is stored securely and never shared
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Vector Storage Section */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Vector Storage Provider</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Select Vector Storage
                        </label>
                        <select 
                          value={selectedVectorStorage}
                          onChange={(e) => setSelectedVectorStorage(e.target.value)}
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                          {vectorStorageProviders.map((provider) => (
                            <option key={provider.value} value={provider.value}>
                              {provider.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Vector Storage API Key
                        </label>
                        <input
                          type="password"
                          value={vectorApiKey}
                          onChange={(e) => setVectorApiKey(e.target.value)}
                          placeholder="Enter your API key for the selected vector storage provider"
                          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                          disabled={selectedVectorStorage === 'local'}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {selectedVectorStorage === 'local' 
                            ? 'No API key required for local storage' 
                            : 'Required for cloud-based vector storage providers'
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Model Configuration */}
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Model Configuration</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Temperature (Creativity)
                        </label>
                        <input 
                          type="range" 
                          min="0" 
                          max="1" 
                          step="0.1"
                          defaultValue="0.7" 
                          className="w-full"
                        />
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                          <span>Focused (0.0)</span>
                          <span>Balanced (0.7)</span>
                          <span>Creative (1.0)</span>
                        </div>
                      </div>
                      
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Max Response Length
                        </label>
                        <select className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
                          <option value="1024">Short (1024 tokens)</option>
                          <option value="2048" selected>Medium (2048 tokens)</option>
                          <option value="4096">Long (4096 tokens)</option>
                          <option value="8192">Very Long (8192 tokens)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Privacy & Security</h2>
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Cookies and Site Data</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Block third-party cookies</span>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Clear cookies on exit</span>
                        <input type="checkbox" className="toggle" />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Tracking Protection</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Block trackers</span>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Block fingerprinting</span>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">AI Data Privacy</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Store chat history locally</span>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Share anonymous usage data</span>
                        <input type="checkbox" className="toggle" />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'appearance' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Appearance</h2>
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Theme</h3>
                    <div className="space-y-3">
                      <label className="flex items-center">
                        <input type="radio" name="theme" className="mr-3" defaultChecked />
                        <span className="text-gray-700 dark:text-gray-300">System default</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="theme" className="mr-3" />
                        <span className="text-gray-700 dark:text-gray-300">Light</span>
                      </label>
                      <label className="flex items-center">
                        <input type="radio" name="theme" className="mr-3" />
                        <span className="text-gray-700 dark:text-gray-300">Dark</span>
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Font Size</h3>
                    <input 
                      type="range" 
                      min="12" 
                      max="24" 
                      defaultValue="16" 
                      className="w-full"
                    />
                    <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mt-2">
                      <span>Small</span>
                      <span>Medium</span>
                      <span>Large</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'advanced' && (
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">Advanced Settings</h2>
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Developer Tools</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Enable developer mode</span>
                        <input type="checkbox" className="toggle" />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Show debug information</span>
                        <input type="checkbox" className="toggle" />
                      </label>
                    </div>
                  </div>

                  <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                    <h3 className="font-medium text-gray-900 dark:text-white mb-4">Performance</h3>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Hardware acceleration</span>
                        <input type="checkbox" className="toggle" defaultChecked />
                      </label>
                      <label className="flex items-center justify-between">
                        <span className="text-gray-700 dark:text-gray-300">Preload pages</span>
                        <input type="checkbox" className="toggle" defaultChecked />
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
                  onClick={() => window.close()}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <div className="space-x-3">
                  <button className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    Reset to Defaults
                  </button>
                  <button 
                    onClick={handleSaveSettings}
                    className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    Save Changes
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