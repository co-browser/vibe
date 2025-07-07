/**
 * Main application component
 * Manages the browser UI and chat interface routing
 */

import "./components/styles/index.css";
import "antd/dist/reset.css";
import { RouterProvider } from "./router/provider";
import { Route } from "./router/route";
import { ContextMenuProvider } from "./providers/ContextMenuProvider";

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
  return <Routes />;
}

export default App;
