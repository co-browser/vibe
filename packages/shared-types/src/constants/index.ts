/**
 * Constants shared across the Vibe application
 */

/**
 * Chat panel configuration - Fixed width approach
 * Used by both main process (ViewManager) and renderer process (BrowserUI)
 */
export const CHAT_PANEL = {
  DEFAULT_WIDTH: 400,
  MIN_WIDTH: 300,
  MAX_WIDTH: 600,
} as const;

export const UPDATER = {
  FEED_URL: "https://storage.googleapis.com/vibe-update/",
  AUTOUPDATE: true,
};
/**
 * Browser chrome heights (Fixed in window/layout improvements)
 * Critical for proper view positioning - ViewManager uses TOTAL_CHROME_HEIGHT
 */
export const BROWSER_CHROME = {
  TAB_BAR_HEIGHT: 41,
  NAVIGATION_BAR_HEIGHT: 48,
  get TOTAL_CHROME_HEIGHT() {
    return this.TAB_BAR_HEIGHT + this.NAVIGATION_BAR_HEIGHT; // 89px
  },
} as const;

/**
 * Window management configuration (Simplified window creation approach)
 */
export const WINDOW_CONFIG = {
  // Default window size
  DEFAULT_WIDTH: 1280,
  DEFAULT_HEIGHT: 720,

  // Window behavior
  AUTO_MAXIMIZE: true,
  TRANSPARENT: false,
  FRAME: true,

  // Background color for better startup appearance
  BACKGROUND_COLOR: "#ffffff",

  // Minimum window constraints
  MIN_WIDTH: 800,
  MIN_HEIGHT: 600,

  // macOS traffic light positioning
  TRAFFIC_LIGHT_POSITION: { x: 22, y: 22 },
} as const;

/**
 * Tab management configuration
 */
export const TAB_CONFIG = {
  // Sleep management
  SLEEP_MODE_URL: "about:blank?sleep=true",
  SLEEP_THRESHOLD_MS: 30 * 60 * 1000, // 30 minutes
  ARCHIVE_THRESHOLD_MS: 24 * 60 * 60 * 1000, // 24 hours
  CLEANUP_INTERVAL_MS: 60 * 1000, // 1 minute
  MAX_TABS_TO_SLEEP_ON_MEMORY_PRESSURE: 3,

  // Position management
  DEFAULT_POSITION: 0,
  POSITION_INCREMENT: 0.5, // For temporary fractional positioning

  // State updates
  UPDATE_DEBOUNCE_MS: 100,
  MAINTENANCE_LOG_INTERVAL: 4, // Log every 4th maintenance cycle
} as const;

// Backward compatibility
export const TAB_SLEEP_CONFIG = TAB_CONFIG;

// Default window size
export const DEFAULT_WINDOW_WIDTH = 1280;

/**
 * Glassmorphism UI configuration
 * Shared between main process (ViewManager) and renderer process (CSS)
 */
export const GLASSMORPHISM_CONFIG = {
  // Border padding for glassmorphism effect (must match CSS padding)
  PADDING: 8,
  // Border radius for rounded corners (WebContentsView and CSS)
  BORDER_RADIUS: 8,
} as const;

/**
 * Memory + RAG configuration - removed legacy single-server approach
 * Now handled by multi-server MCP configuration in factory.ts
 */

/**
 * Gmail OAuth configuration
 */
export const GMAIL_CONFIG = {
  // OAuth configuration
  REDIRECT_URI: "http://127.0.0.1:3000/oauth2callback",
  CALLBACK_PORT: 3000,
  CALLBACK_HOST: "127.0.0.1",

  // Scopes
  SCOPES: {
    MODIFY: "https://www.googleapis.com/auth/gmail.modify",
    READONLY: "https://www.googleapis.com/auth/gmail.readonly",
    SEND: "https://www.googleapis.com/auth/gmail.send",
  },

  // File paths
  // Note: CONFIG_DIR_NAME is a relative path that should be joined with the user's home directory
  // Example usage: path.join(os.homedir(), GMAIL_CONFIG.CONFIG_DIR_NAME)
  CONFIG_DIR_NAME: ".gmail-mcp",
  OAUTH_KEYS_FILE: "gcp-oauth.keys.json",
  CREDENTIALS_FILE: "credentials.json",

  // Security settings
  FILE_PERMISSIONS: {
    CONFIG_DIR: 0o700,
    CREDENTIALS_FILE: 0o600,
  },

  // Timeouts and retries
  AUTH_TIMEOUT_MS: 5 * 60 * 1000, // 5 minutes
  TOKEN_REFRESH_BUFFER_MS: 5 * 60 * 1000, // Refresh 5 minutes before expiry

  // UI assets
  FAVICON_URL: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",

  // Tab key for OAuth flow
  OAUTH_TAB_KEY: "oauth-gmail",
} as const;

/**
 * Main process specific configuration
 */
export const MAIN_PROCESS_CONFIG = {
  // Port for Chrome DevTools Protocol debugging
  REMOTE_DEBUGGING_PORT: 9223,

  // Main window configuration
  MAIN_WINDOW: {
    HEADER_HEIGHT: 85, // Height of TabBar + NavigationBar (legacy reference)
    TITLE_BAR_OVERLAY: {
      COLOR: "#1f2937",
      SYMBOL_COLOR: "#ffffff",
      HEIGHT: 40,
    },
  },

  // Memory monitoring thresholds
  MEMORY_THRESHOLDS: {
    CHECK_INTERVAL: 1000 * 60 * 5, // 5 minutes
    HIGH_MEMORY: 500 * 1024 * 1024, // 500 MB
  },
} as const;
