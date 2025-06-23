import { app } from "electron";
import { config } from "dotenv";
import { createLogger, MAIN_PROCESS_CONFIG, findFileUpwards } from "@vibe/shared-types";
import {
  init,
  browserWindowSessionIntegration,
  childProcessIntegration,
} from "@sentry/electron/main";

const logger = createLogger("EnvironmentManager");

/**
 * Environment Manager - Centralized Environment Setup
 * 
 * Handles all environment-related configuration:
 * - Environment variable loading (.env files)
 * - Command line argument setup
 * - Sentry initialization
 * - Log level configuration
 * - Development vs production setup
 * 
 * Replaces scattered environment setup from main process.
 */
export class EnvironmentManager {
  private initialized = false;

  constructor() {
    // Constructor is intentionally simple
  }

  /**
   * Setup the environment and configuration
   */
  setup(): void {
    if (this.initialized) {
      logger.warn("Environment already initialized");
      return;
    }

    try {
      logger.info("Setting up environment configuration...");

      // Configure logging first
      this.setupLogging();

      // Load environment variables
      this.loadEnvironmentVariables();

      // Setup command line arguments
      this.setupCommandLineArguments();

      // Initialize error tracking
      this.initializeSentry();

      // Validate environment
      this.validateEnvironment();

      this.initialized = true;
      logger.info("✅ Environment setup complete");
    } catch (error) {
      logger.error("Environment setup failed:", error);
      throw error;
    }
  }

  /**
   * Get environment information
   */
  getEnvironmentInfo(): {
    isDevelopment: boolean;
    isProduction: boolean;
    hasOpenAIKey: boolean;
    logLevel: string;
    version: string;
    platform: string;
  } {
    return {
      isDevelopment: process.env.NODE_ENV === "development",
      isProduction: process.env.NODE_ENV === "production",
      hasOpenAIKey: !!process.env.OPENAI_API_KEY,
      logLevel: process.env.LOG_LEVEL || "info",
      version: app.getVersion(),
      platform: process.platform,
    };
  }

  /**
   * Check if environment is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // === Private Methods ===

  private setupLogging(): void {
    // Set consistent log level for all processes
    if (!process.env.LOG_LEVEL) {
      process.env.LOG_LEVEL =
        process.env.NODE_ENV === "development" ? "info" : "error";
    }

    // Reduce Sentry noise in development
    if (process.env.NODE_ENV === "development") {
      process.env.SENTRY_LOG_LEVEL = "error";
    }

    logger.info(`Log level set to: ${process.env.LOG_LEVEL}`);
  }

  private loadEnvironmentVariables(): void {
    try {
      // Find and load .env file
      const envPath = findFileUpwards(__dirname, ".env");
      if (envPath) {
        config({ path: envPath });
        logger.info(`Environment variables loaded from: ${envPath}`);
      } else {
        logger.warn(".env file not found in directory tree");
      }
    } catch (error) {
      logger.error("Failed to load environment variables:", error);
      // Continue without .env file
    }
  }

  private setupCommandLineArguments(): void {
    try {
      // Configure remote debugging for browser integration
      app.commandLine.appendSwitch(
        "remote-debugging-port",
        MAIN_PROCESS_CONFIG.REMOTE_DEBUGGING_PORT.toString(),
      );
      app.commandLine.appendSwitch("remote-debugging-address", "127.0.0.1");
      app.commandLine.appendSwitch(
        "enable-features",
        "NetworkService,NetworkServiceInProcess",
      );
      app.commandLine.appendSwitch("enable-blink-features", "MojoJS,MojoJSTest");

      logger.info("Command line arguments configured");
    } catch (error) {
      logger.error("Failed to setup command line arguments:", error);
      // Continue without command line args
    }
  }

  private initializeSentry(): void {
    try {
      const isProd = process.env.NODE_ENV === "production";

      // Initialize Sentry for error tracking
      init({
        dsn: "https://21ac611f0272b8931073fa7ecc36c600@o4509464945623040.ingest.de.sentry.io/4509464948899920",
        debug: !isProd,
        integrations: [browserWindowSessionIntegration(), childProcessIntegration()],
        tracesSampleRate: isProd ? 0.1 : 1.0,
        tracePropagationTargets: ["localhost"],
        onFatalError: () => {
          // Handle fatal errors gracefully
          logger.error("Sentry fatal error occurred");
        },
      });

      logger.info(`Sentry initialized for ${isProd ? "production" : "development"}`);
    } catch (error) {
      logger.error("Failed to initialize Sentry:", error);
      // Continue without Sentry
    }
  }

  private validateEnvironment(): void {
    const info = this.getEnvironmentInfo();

    // Log environment status
    logger.info("Environment validation:", {
      version: info.version,
      platform: info.platform,
      nodeEnv: process.env.NODE_ENV,
      isDevelopment: info.isDevelopment,
      isProduction: info.isProduction,
      hasOpenAIKey: info.hasOpenAIKey,
      logLevel: info.logLevel,
    });

    // Check for important environment variables
    if (!info.hasOpenAIKey) {
      logger.warn("OPENAI_API_KEY not found in environment - some features will be disabled");
    }

    // Log app information
    const buildType = app.isPackaged ? "Production" : "Development";
    logger.info(`Vibe Browser ${buildType} Build (${info.version})`);
  }
}