import { app } from "electron";
import * as path from "path";

/**
 * Centralized application configuration
 * Allows environment-based and runtime configuration overrides
 */

export interface AppConfig {
  // Performance and timing configuration
  performance: {
    timing: {
      overlayBatchDelay: number;
      clickDebounce: number;
      scriptExecutionTimeout: number;
      framePerformanceThreshold: number;
      defaultDebounceDelay: number;
      windowResizeDebounce: number;
      autoSaveDelay: number;
      cacheTtl: number;
    };
    limits: {
      maxCacheSize: number;
      maxScriptExecutions: number;
      maxRenderMeasurements: number;
      scriptLengthLimit: number;
      contentMaxLengthSingle: number;
      contentMaxLengthMultiple: number;
      slowRenderThreshold: number;
      memoryUsageThreshold: number;
      maxEventHandlers: number;
    };
  };

  // Network and connection configuration
  network: {
    ports: {
      remoteDebugging: number;
      viteDevServer: number;
    };
    hosts: {
      cdpConnector: string;
      devServer: string;
    };
    retry: {
      maxConnectionAttempts: number;
      backoffBase: number;
      maxBackoffTime: number;
      maxLoadAttempts: number;
      retryDelay: number;
    };
  };

  // UI dimensions and layout
  ui: {
    window: {
      minWidth: number;
      minHeight: number;
      defaultWidth: number;
      defaultHeight: number;
      titleBarHeight: number;
    };
    omnibox: {
      dropdownMaxHeight: number;
      dropdownWidth: string;
      dropdownTop: number;
      iconSize: number;
      suggestionPadding: number;
    };
  };

  // Process and worker configuration
  workers: {
    maxRestartAttempts: number;
    maxConcurrentSaves: number;
    healthCheckInterval: number;
    healthCheckTimeout: number;
  };

  // Development configuration
  development: {
    enableDevTools: boolean;
    enableLogging: boolean;
    logLevel: "debug" | "info" | "warn" | "error";
    enablePerformanceMonitoring: boolean;
  };

  // Security configuration
  security: {
    encryptionKeyLength: number;
    fallbackKeyPrefix: string;
    sessionTimeout: number;
  };
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: AppConfig = {
  performance: {
    timing: {
      overlayBatchDelay: 1,
      clickDebounce: 100,
      scriptExecutionTimeout: 5000,
      framePerformanceThreshold: 16,
      defaultDebounceDelay: 300,
      windowResizeDebounce: 100,
      autoSaveDelay: 1000,
      cacheTtl: 5 * 60 * 1000, // 5 minutes
    },
    limits: {
      maxCacheSize: 50,
      maxScriptExecutions: 100,
      maxRenderMeasurements: 100,
      scriptLengthLimit: 10000,
      contentMaxLengthSingle: 8000,
      contentMaxLengthMultiple: 4000,
      slowRenderThreshold: 16,
      memoryUsageThreshold: 50 * 1024 * 1024, // 50MB
      maxEventHandlers: 50,
    },
  },

  network: {
    ports: {
      remoteDebugging: 9223,
      viteDevServer: 5173,
    },
    hosts: {
      cdpConnector: "localhost",
      devServer: "localhost",
    },
    retry: {
      maxConnectionAttempts: 3,
      backoffBase: 100,
      maxBackoffTime: 2000,
      maxLoadAttempts: 10,
      retryDelay: 1000,
    },
  },

  ui: {
    window: {
      minWidth: 800,
      minHeight: 400,
      defaultWidth: 1280,
      defaultHeight: 720,
      titleBarHeight: 30,
    },
    omnibox: {
      dropdownMaxHeight: 300,
      dropdownWidth: "60%",
      dropdownTop: 40,
      iconSize: 16,
      suggestionPadding: 10,
    },
  },

  workers: {
    maxRestartAttempts: 3,
    maxConcurrentSaves: 3,
    healthCheckInterval: 30000, // 30 seconds
    healthCheckTimeout: 5000, // 5 seconds
  },

  development: {
    enableDevTools: process.env.NODE_ENV === "development",
    enableLogging: true,
    logLevel: process.env.NODE_ENV === "development" ? "debug" : "info",
    enablePerformanceMonitoring: process.env.ENABLE_PERF_MONITORING === "true",
  },

  security: {
    encryptionKeyLength: 32,
    fallbackKeyPrefix: "vibe-encryption-fallback-key",
    sessionTimeout: 24 * 60 * 60 * 1000, // 24 hours
  },
};

/**
 * Environment-specific overrides
 */
const ENVIRONMENT_OVERRIDES: Partial<Record<string, Partial<AppConfig>>> = {
  development: {
    performance: {
      timing: {
        overlayBatchDelay: 10, // Slightly slower for debugging
        clickDebounce: 150,
        scriptExecutionTimeout: 10000, // Longer timeout for debugging
        framePerformanceThreshold: 100,
        defaultDebounceDelay: 300,
        windowResizeDebounce: 250,
        autoSaveDelay: 1000,
        cacheTtl: 300000,
      },
      limits: {
        maxCacheSize: 100,
        maxScriptExecutions: 1000, // Higher limit for development
        maxRenderMeasurements: 100,
        scriptLengthLimit: 50000,
        contentMaxLengthSingle: 100000,
        contentMaxLengthMultiple: 500000,
        slowRenderThreshold: 16,
        memoryUsageThreshold: 100 * 1024 * 1024,
        maxEventHandlers: 100,
      },
    },
    development: {
      enableDevTools: true,
      enableLogging: true,
      logLevel: "debug",
      enablePerformanceMonitoring: true,
    },
  },

  production: {
    performance: {
      timing: {
        overlayBatchDelay: 1, // Ultra-fast for production
        clickDebounce: 50,
        scriptExecutionTimeout: 5000,
        framePerformanceThreshold: 16,
        defaultDebounceDelay: 100,
        windowResizeDebounce: 100,
        autoSaveDelay: 500,
        cacheTtl: 600000,
      },
      limits: {
        maxCacheSize: 50,
        maxScriptExecutions: 50, // Conservative limit for production
        maxRenderMeasurements: 50,
        scriptLengthLimit: 10000,
        contentMaxLengthSingle: 50000,
        contentMaxLengthMultiple: 250000,
        slowRenderThreshold: 16,
        memoryUsageThreshold: 50 * 1024 * 1024,
        maxEventHandlers: 50,
      },
    },
    development: {
      enableDevTools: false,
      enableLogging: true,
      logLevel: "warn",
      enablePerformanceMonitoring: false,
    },
  },

  test: {
    performance: {
      timing: {
        overlayBatchDelay: 0,
        clickDebounce: 0,
        scriptExecutionTimeout: 1000, // Fast timeouts for tests
        framePerformanceThreshold: 50,
        defaultDebounceDelay: 10, // Fast debounce for tests
        windowResizeDebounce: 50,
        autoSaveDelay: 100,
        cacheTtl: 60000,
      },
      limits: {
        maxCacheSize: 10,
        maxScriptExecutions: 100,
        maxRenderMeasurements: 10,
        scriptLengthLimit: 5000,
        contentMaxLengthSingle: 10000,
        contentMaxLengthMultiple: 50000,
        slowRenderThreshold: 50,
        memoryUsageThreshold: 10 * 1024 * 1024,
        maxEventHandlers: 10,
      },
    },
    development: {
      enableDevTools: false,
      enableLogging: false,
      logLevel: "error",
      enablePerformanceMonitoring: false,
    },
  },
};

/**
 * Configuration manager class
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig;
  private userOverrides: Partial<AppConfig> = {};

  private constructor() {
    this.config = this.buildConfig();
  }

  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * Get the complete configuration
   */
  public getConfig(): AppConfig {
    return { ...this.config };
  }

  /**
   * Get a specific configuration value using dot notation
   */
  public get<T>(path: string): T {
    const keys = path.split(".");
    let value: any = this.config;

    for (const key of keys) {
      if (value && typeof value === "object" && key in value) {
        value = value[key];
      } else {
        throw new Error(`Configuration path '${path}' not found`);
      }
    }

    return value as T;
  }

  /**
   * Set user configuration overrides
   */
  public setUserOverrides(overrides: Partial<AppConfig>): void {
    this.userOverrides = { ...this.userOverrides, ...overrides };
    this.config = this.buildConfig();
  }

  /**
   * Get current environment
   */
  private getEnvironment(): string {
    return process.env.NODE_ENV || "development";
  }

  /**
   * Build the final configuration by merging defaults, environment, and user overrides
   */
  private buildConfig(): AppConfig {
    const environment = this.getEnvironment();
    const envOverrides = ENVIRONMENT_OVERRIDES[environment] || {};

    return this.deepMerge(
      DEFAULT_CONFIG,
      envOverrides,
      this.userOverrides,
    ) as AppConfig;
  }

  /**
   * Deep merge configuration objects
   */
  private deepMerge(...objects: any[]): any {
    const result: any = {};

    for (const obj of objects) {
      if (obj && typeof obj === "object") {
        for (const key in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            if (
              typeof obj[key] === "object" &&
              !Array.isArray(obj[key]) &&
              obj[key] !== null
            ) {
              result[key] = this.deepMerge(result[key] || {}, obj[key]);
            } else {
              result[key] = obj[key];
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Load configuration from file (if exists)
   */
  public async loadUserConfig(): Promise<void> {
    try {
      const configPath = path.join(app.getPath("userData"), "app-config.json");
      const fs = await import("fs/promises");

      try {
        const configData = await fs.readFile(configPath, "utf-8");
        const userConfig = JSON.parse(configData);
        this.setUserOverrides(userConfig);
      } catch {
        // Config file doesn't exist or is invalid, use defaults
      }
    } catch (error) {
      console.warn("Failed to load user configuration:", error);
    }
  }

  /**
   * Save current user overrides to file
   */
  public async saveUserConfig(): Promise<void> {
    try {
      const configPath = path.join(app.getPath("userData"), "app-config.json");
      const fs = await import("fs/promises");

      await fs.writeFile(
        configPath,
        JSON.stringify(this.userOverrides, null, 2),
        "utf-8",
      );
    } catch (error) {
      console.error("Failed to save user configuration:", error);
    }
  }

  /**
   * Reset to default configuration
   */
  public resetToDefaults(): void {
    this.userOverrides = {};
    this.config = this.buildConfig();
  }

  /**
   * Get configuration for a specific component
   */
  public getPerformanceConfig() {
    return this.config.performance;
  }

  public getNetworkConfig() {
    return this.config.network;
  }

  public getUIConfig() {
    return this.config.ui;
  }

  public getWorkersConfig() {
    return this.config.workers;
  }

  public getDevelopmentConfig() {
    return this.config.development;
  }

  public getSecurityConfig() {
    return this.config.security;
  }
}

// Singleton instance
export const config = ConfigManager.getInstance();
