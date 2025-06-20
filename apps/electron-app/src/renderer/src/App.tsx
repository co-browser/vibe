/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { useEffect, useState } from "react";

// Browser Route
import BrowserRoute from "./routes/browser/route";

// Popup Pages
import OnboardingPage, {
  type DetectedBrowser,
} from "./pages/onboarding/OnboardingPage";
import SettingsPage from "./pages/settings/SettingsPage";
import AboutPage from "./pages/about/AboutPage";

/**
 * Determines the window type from URL hash or command line arguments
 */
function getWindowType(): string {
  // Check URL hash first (for development)
  const hash = window.location.hash.replace("#", "");
  if (hash && ["onboarding", "settings", "about"].includes(hash)) {
    return hash;
  }

  // Check if we're in a popup window via preload script
  // The popup windows pass --window-type=<type> as additionalArguments
  if (window.electronAPI?.getWindowType) {
    const windowType = window.electronAPI.getWindowType();
    if (
      windowType &&
      ["onboarding", "settings", "about"].includes(windowType)
    ) {
      return windowType;
    }
  }

  // Default to main browser application
  return "browser";
}

/**
 * Gets detected browsers from command line arguments
 */
function getDetectedBrowsers(): DetectedBrowser[] {
  if (window.electronAPI?.getDetectedBrowsers) {
    return window.electronAPI.getDetectedBrowsers();
  }
  return [];
}

/**
 * Main application component with window type detection
 */
function Routes() {
  const [windowType, setWindowType] = useState<string>("browser");
  const [detectedBrowsers, setDetectedBrowsers] = useState<DetectedBrowser[]>(
    [],
  );

  useEffect(() => {
    const type = getWindowType();
    setWindowType(type);

    // Get detected browsers for onboarding window
    if (type === "onboarding") {
      const browsers = getDetectedBrowsers();
      setDetectedBrowsers(browsers);
    }
  }, []);

  // Render popup windows directly without router
  if (windowType === "onboarding") {
    return <OnboardingPage detectedBrowsers={detectedBrowsers} />;
  }

  if (windowType === "settings") {
    return <SettingsPage />;
  }

  if (windowType === "about") {
    return <AboutPage />;
  }

  // Default browser application with router
  return (
    <RouterProvider>
      <Route>
        <BrowserRoute />
      </Route>
    </RouterProvider>
  );
}

function App() {
  return <Routes />;
}

export default App;
