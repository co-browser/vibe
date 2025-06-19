import React from 'react';

/**
 * AboutPage - Placeholder component for application information
 */
export function AboutPage() {
  // In a real app, these would come from package.json or environment variables
  const appInfo = {
    name: 'Vibe Browser',
    version: '1.0.0',
    description: 'A modern browser with AI-powered features',
    author: 'Vibe Team',
    license: 'MIT',
    repository: 'https://github.com/vibe/browser',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-8">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
        <div className="text-center">
          {/* App Icon */}
          <div className="mb-6">
            <div className="w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {appInfo.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-300">
              {appInfo.description}
            </p>
          </div>

          {/* Version Info */}
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500 dark:text-gray-400">Version</span>
                <p className="font-medium text-gray-900 dark:text-white">{appInfo.version}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">License</span>
                <p className="font-medium text-gray-900 dark:text-white">{appInfo.license}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Author</span>
                <p className="font-medium text-gray-900 dark:text-white">{appInfo.author}</p>
              </div>
              <div>
                <span className="text-gray-500 dark:text-gray-400">Platform</span>
                <p className="font-medium text-gray-900 dark:text-white">
                  {navigator.platform || 'Unknown'}
                </p>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Key Features</h3>
            <div className="space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <div className="flex items-center justify-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Multi-tab browsing with sleep management</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>AI-powered chat assistance</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Modern glassmorphism design</span>
              </div>
              <div className="flex items-center justify-center space-x-2">
                <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                <span>Cross-platform compatibility</span>
              </div>
            </div>
          </div>

          {/* Links */}
          <div className="flex space-x-4 justify-center mb-6">
            <button 
              onClick={() => {
                // In a real app, this would open the repository URL
                console.log('Opening repository:', appInfo.repository);
              }}
              className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-sm"
            >
              View Source
            </button>
            <button 
              onClick={() => {
                // In a real app, this would open the license file
                console.log('Opening license');
              }}
              className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-sm"
            >
              License
            </button>
            <button 
              onClick={() => {
                // In a real app, this would open the changelog
                console.log('Opening changelog');
              }}
              className="px-4 py-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors text-sm"
            >
              Changelog
            </button>
          </div>

          {/* Copyright */}
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-6">
            © 2024 {appInfo.author}. All rights reserved.
          </div>

          {/* Close Button */}
          <button 
            onClick={() => window.close()}
            className="w-full px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg hover:from-purple-600 hover:to-pink-600 transition-all duration-200 font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;