/**
 * Settings entry point for the settings dialog
 * Initializes the React settings application
 */

import "./components/styles/index.css";
import "antd/dist/reset.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init } from "@sentry/electron/renderer";
import SettingsApp from "./Settings";

const isProd = process.env.NODE_ENV === "production";

init({
  debug: !isProd,
  tracesSampleRate: isProd ? 0.05 : 1.0,
  maxBreadcrumbs: 50,
  beforeBreadcrumb: breadcrumb => {
    if (isProd && breadcrumb.category === "console") {
      return null;
    }
    return breadcrumb;
  },
});

// Create the root element and render the settings application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
