/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { useEffect, useState } from "react";
import { ContextMenuDetector } from "./components/ui/context-menu-detector";

// Browser Route
import BrowserRoute from "./routes/browser/route";

// Popup Pages
import { OnboardingPage3D } from "./pages/onboarding/OnboardingPage3D";
import { SettingsPageV2 } from "./pages/settings/SettingsPageV2";
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

/**
 * Main application component with window type detection
 */
function Routes() {
  const [windowType, setWindowType] = useState<string>("browser");

  useEffect(() => {
    const type = getWindowType();
    setWindowType(type);
  }, []);

  // Render popup windows directly without router (no context menu for popup windows)
  if (windowType === "onboarding") {
    return <OnboardingPage3D />;
  }

  if (windowType === "settings") {
    return <SettingsPageV2 />;
  }

  if (windowType === "about") {
    return <AboutPage />;
  }

  // Default browser application with router and context menu detection
  return (
    <ContextMenuDetector>
      <RouterProvider>
        <Route>
          <BrowserRoute />
        </Route>
      </RouterProvider>
    </ContextMenuDetector>
  );
}

function App() {
  return <Routes />;
}

export default App;
