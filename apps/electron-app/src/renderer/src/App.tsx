/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { UpdateNotification } from "./components/UpdateNotification";

// Browser Route
import BrowserRoute from "./routes/browser/route";

/**
 * Main application component
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
    <>
      <Routes />
      <UpdateNotification />
    </>
  );
}

export default App;
