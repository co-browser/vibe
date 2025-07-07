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

init({ debug: true });

// Create the root element and render the settings application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SettingsApp />
  </StrictMode>,
);
