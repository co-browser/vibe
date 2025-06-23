/**
 * Base Service Interface
 *
 * Provides standardized service lifecycle management and health monitoring.
 * All services should implement this interface for consistent behavior.
 */

export interface ServiceStatus {
  ready: boolean;
  initialized: boolean;
  serviceStatus: string;
  lastActivity?: number;
  isHealthy?: boolean;
  [key: string]: any; // Allow service-specific status fields
}

export interface BaseService {
  /**
   * Initialize the service with any required configuration
   */
  initialize(config?: any): Promise<void>;

  /**
   * Gracefully terminate the service and clean up resources
   */
  terminate(): Promise<void>;

  /**
   * Get current service status and health information
   */
  getStatus(): ServiceStatus;

  /**
   * Check if the service is healthy and operational
   */
  isHealthy(): boolean;
}

/**
 * Service lifecycle states
 */
export enum ServiceState {
  DISCONNECTED = "disconnected",
  INITIALIZING = "initializing",
  READY = "ready",
  PROCESSING = "processing",
  ERROR = "error",
  TERMINATING = "terminating",
}

/**
 * Base service configuration interface
 */
export interface BaseServiceConfig {
  name: string;
  enabled?: boolean;
  timeout?: number;
  retryCount?: number;
  [key: string]: any; // Allow service-specific config
}
