/**
 * AboutPage - Information about the application
 */
export function AboutPage() {
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
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              About Vibe Browser
            </h1>
            <p className="text-gray-600 dark:text-gray-300 text-lg">
              A modern browser with AI-powered assistance
            </p>
          </div>

          <div className="space-y-4 mb-8 text-left">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Version
              </h3>
              <p className="text-gray-600 dark:text-gray-300">1.0.0</p>
            </div>

            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Features
              </h3>
              <ul className="text-gray-600 dark:text-gray-300 list-disc list-inside">
                <li>Multi-tab browsing</li>
                <li>AI-powered chat assistance</li>
                <li>Password import from other browsers</li>
                <li>Modern, clean interface</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={() => window.close()}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AboutPage;
