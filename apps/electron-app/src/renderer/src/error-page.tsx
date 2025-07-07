import React from "react";
import ReactDOM from "react-dom/client";
import { ErrorPage } from "./components/ErrorPage";
import "./index.css"; // Import main styles

// Get error parameters from URL
const params = new URLSearchParams(window.location.search);
const errorType = (params.get("type") as any) || "not-found";
const url = params.get("url") || "";

// Render the error page
const container = document.getElementById("root") as HTMLElement;
const root = ReactDOM.createRoot(container);

root.render(
  <React.StrictMode>
    <ErrorPage errorType={errorType} url={url} />
  </React.StrictMode>,
);
