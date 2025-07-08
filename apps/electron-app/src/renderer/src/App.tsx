/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import "./styles/persona-animations.css";
import "antd/dist/reset.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { ContextMenuProvider } from "./providers/ContextMenuProvider";
import { useEffect } from "react";
// import { personaAnimator } from "./utils/persona-animator";

// Browser Route
import BrowserRoute from "./routes/browser/route";

/**
 * Main application component
 */
function Routes() {
  return (
    <ContextMenuProvider>
      <RouterProvider>
        <Route>
          <BrowserRoute />
        </Route>
      </RouterProvider>
    </ContextMenuProvider>
  );
}

function App() {
  useEffect(() => {
    // Initialize persona animator
    // The animator will automatically listen for persona change events
    return () => {
      // Cleanup if needed
    };
  }, []);

  return <Routes />;
}

export default App;
