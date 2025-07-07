/**
 * Main entry point for the renderer process
 * Initializes the React application
 */

import "antd/dist/reset.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init } from "@sentry/electron/renderer";
import App from "./App";

// Initialize online status service
import "./services/onlineStatusService";

// Check if we're in production
const isProd = process.env.NODE_ENV === "production";

init({
  debug: !isProd, // Only enable debug in development
  tracesSampleRate: isProd ? 0.05 : 1.0, // 5% in production, 100% in dev
  maxBreadcrumbs: 50, // Limit breadcrumb collection for performance
  beforeBreadcrumb: breadcrumb => {
    // Filter out noisy breadcrumbs in production
    if (isProd && breadcrumb.category === "console") {
      return null;
    }
    return breadcrumb;
  },
});

// Create the root element and render the application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
