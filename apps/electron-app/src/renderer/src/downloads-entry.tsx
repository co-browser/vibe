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

// Create the root element and render the downloads application
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DownloadsApp />
  </StrictMode>,
);
