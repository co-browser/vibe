/**
 * Main entry point for the renderer process
 * Initializes the React application
 */

import "antd/dist/reset.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init } from "@sentry/electron/renderer";
import { PrivyProvider } from "@privy-io/react-auth";
import { APP_CONFIG } from "@vibe/shared-types";
import App from "./App";

init({ debug: true });

// Create the root element and render the application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PrivyProvider
      appId={APP_CONFIG.PRIVY_APP_ID}
      config={{
        loginMethods: ["email", "google"],
        appearance: {
          theme: "light",
        },
        embeddedWallets: {
          createOnLogin: "off",
          showWalletUIs: false,
        },
      }}
    >
      <App />
    </PrivyProvider>
  </StrictMode>,
);
