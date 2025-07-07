/**
 * Downloads entry point for the downloads dialog
 * Initializes the React downloads application
 */

import "./components/styles/index.css";
import "antd/dist/reset.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { init } from "@sentry/electron/renderer";
import DownloadsApp from "./downloads";

init({ debug: true });

// Create the root element and render the downloads application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DownloadsApp />
  </StrictMode>,
);
