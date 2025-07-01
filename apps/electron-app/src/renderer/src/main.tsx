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
import ErrorBoundary from "./components/ErrorBoundary";

init({ debug: true });

// Validate Privy configuration
if (!APP_CONFIG.PRIVY_APP_ID) {
  throw new Error(
    "PRIVY_APP_ID is not configured. Please check your APP_CONFIG in shared-types.",
  );
}

// Create the root element and render the application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <PrivyProvider
        appId={APP_CONFIG.PRIVY_APP_ID}
        config={{
          loginMethods: ["email", "google"],
          appearance: {
            theme: "light",
          },
          // Disable wallet creation since we don't use Web3 features
          embeddedWallets: {
            createOnLogin: "off",
            showWalletUIs: false,
          },
        }}
      >
        <App />
      </PrivyProvider>
    </ErrorBoundary>
  </StrictMode>,
);
