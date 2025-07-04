/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import "antd/dist/reset.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";

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
  return <Routes />;
}

export default App;
