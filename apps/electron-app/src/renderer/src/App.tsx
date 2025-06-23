/**
 * Main application component with Privy authentication
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { PrivyAuthProvider } from "./providers/PrivyAuthProvider";

// Browser Route
import BrowserRoute from "./routes/browser/route";

/**
 * Main application component with authentication wrapper
 */
function Routes() {
  return (
    <RouterProvider>
      <Route>
        <BrowserRoute />
      </Route>
    </RouterProvider>
  );
}

function App() {
  return (
    <PrivyAuthProvider>
      <Routes />
    </PrivyAuthProvider>
  );
}

export default App;
