import React, { useState, useEffect } from 'react';

/**
 * PopupWindowDemo - Demo component to test popup window functionality with state tracking
 */
export function PopupWindowDemo() {
  const [windowStates, setWindowStates] = useState({
    onboarding: false,
    settings: false,
    about: false,
  });

  // Check initial window states
  useEffect(() => {
    const checkWindowStates = async () => {
      try {
        const onboardingResult = await window.vibe.interface.isPopupWindowOpen('onboarding');
        const settingsResult = await window.vibe.interface.isPopupWindowOpen('settings');
        const aboutResult = await window.vibe.interface.isPopupWindowOpen('about');

        setWindowStates({
          onboarding: onboardingResult.success ? onboardingResult.isOpen : false,
          settings: settingsResult.success ? settingsResult.isOpen : false,
          about: aboutResult.success ? aboutResult.isOpen : false,
        });
      } catch (error) {
        console.error('Failed to check initial window states:', error);
      }
    };

    checkWindowStates();
  }, []);

  // Set up event listeners for window state changes
  useEffect(() => {
    const handleWindowOpened = (data: { type: string; windowId: number }) => {
      console.log('Window opened:', data);
      setWindowStates(prev => ({
        ...prev,
        [data.type]: true
      }));
    };

    const handleWindowClosed = (data: { type: string; windowId: number }) => {
      console.log('Window closed:', data);
      setWindowStates(prev => ({
        ...prev,
        [data.type]: false
      }));
    };

    // Set up event listeners
    const unsubscribeOpened = window.vibe.interface.onPopupWindowOpened(handleWindowOpened);
    const unsubscribeClosed = window.vibe.interface.onPopupWindowClosed(handleWindowClosed);

    // Cleanup on unmount
    return () => {
      unsubscribeOpened();
      unsubscribeClosed();
    };
  }, []);
  const handleOpenOnboarding = async () => {
    try {
      const result = await window.vibe.interface.openOnboardingWindow();
      console.log('Onboarding window result:', result);
    } catch (error) {
      console.error('Failed to open onboarding window:', error);
    }
  };

  const handleOpenSettings = async () => {
    try {
      const result = await window.vibe.interface.openSettingsWindow();
      console.log('Settings window result:', result);
    } catch (error) {
      console.error('Failed to open settings window:', error);
    }
  };

  const handleOpenAbout = async () => {
    try {
      const result = await window.vibe.interface.openAboutWindow();
      console.log('About window result:', result);
    } catch (error) {
      console.error('Failed to open about window:', error);
    }
  };

  const handleGetPopupWindows = async () => {
    try {
      const result = await window.vibe.interface.getPopupWindows();
      console.log('Current popup windows:', result);
    } catch (error) {
      console.error('Failed to get popup windows:', error);
    }
  };

  const handleCloseAllPopups = async () => {
    try {
      const result = await window.vibe.interface.closeAllPopupWindows();
      console.log('Close all popups result:', result);
    } catch (error) {
      console.error('Failed to close popup windows:', error);
    }
  };

  const handleCheckStates = async () => {
    try {
      const onboardingResult = await window.vibe.interface.isPopupWindowOpen('onboarding');
      const settingsResult = await window.vibe.interface.isPopupWindowOpen('settings');
      const aboutResult = await window.vibe.interface.isPopupWindowOpen('about');

      console.log('Window states:', {
        onboarding: onboardingResult,
        settings: settingsResult,
        about: aboutResult,
      });
    } catch (error) {
      console.error('Failed to check window states:', error);
    }
  };

  return (
    <div className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
        Popup Window Demo with State Tracking
      </h3>
      
      {/* Window State Display */}
      <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Window States:</h4>
        <div className="space-y-1 text-sm">
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${windowStates.onboarding ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span className="text-gray-600 dark:text-gray-400">Onboarding: {windowStates.onboarding ? 'Open' : 'Closed'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${windowStates.settings ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span className="text-gray-600 dark:text-gray-400">Settings: {windowStates.settings ? 'Open' : 'Closed'}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`w-2 h-2 rounded-full ${windowStates.about ? 'bg-green-500' : 'bg-gray-400'}`}></span>
            <span className="text-gray-600 dark:text-gray-400">About: {windowStates.about ? 'Open' : 'Closed'}</span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <button
          onClick={handleOpenOnboarding}
          disabled={windowStates.onboarding}
          className={`w-full px-4 py-2 rounded-lg transition-colors ${
            windowStates.onboarding
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
              : 'bg-blue-500 text-white hover:bg-blue-600'
          }`}
        >
          {windowStates.onboarding ? 'Onboarding Window Open' : 'Open Onboarding Window'}
        </button>
        
        <button
          onClick={handleOpenSettings}
          disabled={windowStates.settings}
          className={`w-full px-4 py-2 rounded-lg transition-colors ${
            windowStates.settings
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
              : 'bg-green-500 text-white hover:bg-green-600'
          }`}
        >
          {windowStates.settings ? 'Settings Window Open' : 'Open Settings Window'}
        </button>
        
        <button
          onClick={handleOpenAbout}
          disabled={windowStates.about}
          className={`w-full px-4 py-2 rounded-lg transition-colors ${
            windowStates.about
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-gray-600 dark:text-gray-400'
              : 'bg-purple-500 text-white hover:bg-purple-600'
          }`}
        >
          {windowStates.about ? 'About Window Open' : 'Open About Window'}
        </button>
        
        <button
          onClick={handleGetPopupWindows}
          className="w-full px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
        >
          Get Popup Windows Status
        </button>
        
        <button
          onClick={handleCheckStates}
          className="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
        >
          Check Window States
        </button>
        
        <button
          onClick={handleCloseAllPopups}
          className="w-full px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
        >
          Close All Popup Windows
        </button>
      </div>
      
      <p className="text-sm text-gray-600 dark:text-gray-400 mt-4">
        Buttons are automatically disabled when their respective windows are open. Check the browser console for detailed results.
      </p>
    </div>
  );
}

export default PopupWindowDemo;