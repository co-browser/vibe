import { BrowserView } from "electron";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("NavigationErrorHandler");

interface NavigationError {
  errorCode: number;
  errorDescription: string;
  validatedURL: string;
  isMainFrame: boolean;
}

export class NavigationErrorHandler {
  private static instance: NavigationErrorHandler;

  private constructor() {}

  public static getInstance(): NavigationErrorHandler {
    if (!NavigationErrorHandler.instance) {
      NavigationErrorHandler.instance = new NavigationErrorHandler();
    }
    return NavigationErrorHandler.instance;
  }

  /**
   * Setup error handlers for a BrowserView
   */
  public setupErrorHandlers(view: BrowserView): void {
    const { webContents } = view;

    // Handle navigation errors
    webContents.on(
      "did-fail-load",
      (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return; // Only handle main frame errors

        logger.warn("Navigation failed:", {
          errorCode,
          errorDescription,
          url: validatedURL,
        });

        this.handleNavigationError(view, {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        });
      },
    );

    // Handle provisional load failures (DNS, connection refused, etc)
    webContents.on(
      "did-fail-provisional-load",
      (_, errorCode, errorDescription, validatedURL, isMainFrame) => {
        if (!isMainFrame) return; // Only handle main frame errors

        logger.warn("Provisional load failed:", {
          errorCode,
          errorDescription,
          url: validatedURL,
        });

        this.handleNavigationError(view, {
          errorCode,
          errorDescription,
          validatedURL,
          isMainFrame,
        });
      },
    );
  }

  /**
   * Handle navigation error by showing error page
   */
  private handleNavigationError(
    view: BrowserView,
    error: NavigationError,
  ): void {
    const errorType = this.getErrorType(error.errorCode);

    // Build error page URL with parameters
    const errorPageUrl = this.buildErrorPageUrl(errorType, error.validatedURL);

    // Load the error page
    view.webContents.loadURL(errorPageUrl).catch(err => {
      logger.error("Failed to load error page:", err);
    });
  }

  /**
   * Map error codes to error types
   */
  private getErrorType(errorCode: number): string {
    // Common Chromium error codes
    switch (errorCode) {
      case -3: // ERR_ABORTED
      case -7: // ERR_TIMED_OUT
        return "timeout";

      case -105: // ERR_NAME_NOT_RESOLVED
      case -137: // ERR_NAME_RESOLUTION_FAILED
        return "dns";

      case -106: // ERR_INTERNET_DISCONNECTED
      case -130: // ERR_PROXY_CONNECTION_FAILED
        return "network";

      case -102: // ERR_CONNECTION_REFUSED
      case -104: // ERR_CONNECTION_FAILED
      case -109: // ERR_ADDRESS_UNREACHABLE
        return "not-found";

      case -500: // Internal server error
      case -501: // Not implemented
      case -502: // Bad gateway
      case -503: // Service unavailable
        return "server-error";

      default:
        return "not-found";
    }
  }

  /**
   * Build error page URL with parameters
   */
  private buildErrorPageUrl(errorType: string, failedUrl: string): string {
    // Use a data URL that will render our error page inline
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Page Error</title>
  <style>
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .error-container {
      text-align: center;
      padding: 40px;
      max-width: 600px;
    }
    .error-icon {
      width: 80px;
      height: 80px;
      margin: 0 auto 20px;
      background: #e0e0e0;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .error-title {
      font-size: 24px;
      color: #333;
      margin: 0 0 10px;
    }
    .error-message {
      color: #666;
      margin: 0 0 30px;
    }
    .retry-button {
      background: #1976d2;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 4px;
      font-size: 16px;
      cursor: pointer;
    }
    .retry-button:hover {
      background: #1565c0;
    }
    .lava-lamp {
      width: 120px;
      height: 180px;
      background: linear-gradient(180deg, #d0d0d0 0%, #b0b0b0 100%);
      border-radius: 60px;
      position: relative;
      margin: 0 auto 20px;
      overflow: hidden;
    }
    .lava-bubble {
      position: absolute;
      background: radial-gradient(circle, #9ca3af 0%, #6b7280 100%);
      border-radius: 50%;
      animation: float 6s ease-in-out infinite;
    }
    @keyframes float {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-20px); }
    }
  </style>
</head>
<body>
  <div class="error-container">
    ${
      errorType === "network"
        ? `
      <div class="lava-lamp">
        <div class="lava-bubble" style="width: 40px; height: 40px; left: 20%; top: 60%;"></div>
        <div class="lava-bubble" style="width: 60px; height: 60px; left: 50%; top: 40%; animation-delay: 2s;"></div>
        <div class="lava-bubble" style="width: 35px; height: 35px; left: 70%; top: 70%; animation-delay: 4s;"></div>
      </div>
      <h1 class="error-title">Unable to Connect to the Internet</h1>
      <p class="error-message">Check your internet connection and try again</p>
    `
        : `
      <div class="error-icon">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h1 class="error-title">This site can't be reached</h1>
      <p class="error-message">${failedUrl ? new URL(failedUrl).hostname + " refused to connect" : "The server refused to connect"}</p>
    `
    }
    <button class="retry-button" onclick="location.reload()">Try Again</button>
  </div>
</body>
</html>`;

    return `data:text/html;charset=utf-8,${encodeURIComponent(errorHtml)}`;
  }
}
