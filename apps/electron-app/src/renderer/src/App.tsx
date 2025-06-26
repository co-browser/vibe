/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { ProfileProvider } from "./ProfileProvider";

// Browser Route
import BrowserRoute from "./routes/browser/route";

/**
 * Main application component
 */
function Routes() {
  return (
    <ProfileProvider>
      <RouterProvider>
        <Route>
          <BrowserRoute />
        </Route>
      </RouterProvider>
    </ProfileProvider>
  );
}

function App() {
  return <Routes />;
}

export default App;
