import { app } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("CSP");

// Define CSP directives based on environment
const getCSPDirectives = (isDevelopment: boolean) => {
  const baseCSP = {
    "default-src": ["'self'"],
    "script-src": [
      "'self'",
      "'unsafe-inline'", // Required for React DevTools in development
      ...(isDevelopment ? ["'unsafe-eval'"] : []), // Only in development for HMR
    ],
    "style-src": ["'self'", "'unsafe-inline'"], // Required for styled components
    "img-src": ["'self'", "data:", "https:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": [
      "'self'",
      "https://api.openai.com",
      "https://auth.privy.io",
      "https://api.privy.io",
      "https://sentry.io",
      "wss://localhost:*", // For development WebSocket
      "ws://localhost:*",
      "http://localhost:*",
      "https://localhost:*",
    ],
    "media-src": ["'self'"],
    "object-src": ["'none'"],
    "frame-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
    "block-all-mixed-content": [],
    "upgrade-insecure-requests": [],
  };

  // Remove unsafe-eval and restrict localhost in production
  if (!isDevelopment) {
    baseCSP["connect-src"] = baseCSP["connect-src"].filter(
      src => !src.includes("localhost")
    );
    baseCSP["script-src"] = baseCSP["script-src"].filter(
      src => src !== "'unsafe-eval'"
    );
  }

  return baseCSP;
};

// Convert CSP object to string
const buildCSPString = (directives: Record<string, string[]>): string => {
  return Object.entries(directives)
    .map(([key, values]) => {
      if (values.length === 0) return key;
      return `${key} ${values.join(" ")}`;
    })
    .join("; ");
};

// Apply CSP to session
export const applyContentSecurityPolicy = (
  session: Electron.Session,
  isDevelopment: boolean = !app.isPackaged
): void => {
  const cspDirectives = getCSPDirectives(isDevelopment);
  const cspString = buildCSPString(cspDirectives);

  session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [cspString],
        "X-Content-Type-Options": ["nosniff"],
        "X-Frame-Options": ["DENY"],
        "X-XSS-Protection": ["1; mode=block"],
        "Referrer-Policy": ["strict-origin-when-cross-origin"],
        "Permissions-Policy": [
          "camera=(), microphone=(), geolocation=(), payment=()"
        ],
      },
    });
  });

  logger.info("Content Security Policy applied", {
    isDevelopment,
    csp: cspString.substring(0, 100) + "...", // Log first 100 chars
  });
};

// Validate CSP violations
export const setupCSPViolationReporting = (
  session: Electron.Session
): void => {
  session.webRequest.onBeforeRequest(
    { urls: ["*://*/csp-violation-report"] },
    (details, callback) => {
      if (details.method === "POST" && details.uploadData) {
        const data = details.uploadData[0].bytes.toString();
        try {
          const violation = JSON.parse(data);
          logger.warn("CSP Violation detected", {
            documentUri: violation["csp-report"]?.["document-uri"],
            violatedDirective: violation["csp-report"]?.["violated-directive"],
            blockedUri: violation["csp-report"]?.["blocked-uri"],
            sourceFile: violation["csp-report"]?.["source-file"],
            lineNumber: violation["csp-report"]?.["line-number"],
          });
        } catch (error) {
          logger.error("Failed to parse CSP violation report", { error });
        }
      }
      callback({ cancel: true }); // Don't actually send the report
    }
  );
};