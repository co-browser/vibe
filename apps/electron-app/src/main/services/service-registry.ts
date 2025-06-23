import { EventEmitter } from "events";
import { BaseService, ServiceStatus, ServiceState } from "./base-service";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("ServiceRegistry");

/**
 * Service Registry
 * 
 * Centrally manages all application services, providing:
 * - Service registration and dependency injection
 * - Lifecycle management (initialize/terminate)
 * - Health monitoring and status reporting
 * - Event-based service coordination
 */
export class ServiceRegistry extends EventEmitter {
  private services: Map<string, BaseService> = new Map();
  private serviceStates: Map<string, ServiceState> = new Map();
  private isInitialized: boolean = false;
  private isTerminating: boolean = false;

  /**
   * Register a service with the registry
   */
  register<T extends BaseService>(name: string, service: T): void {
    if (this.services.has(name)) {
      throw new Error(`Service '${name}' is already registered`);
    }

    this.services.set(name, service);
    this.serviceStates.set(name, ServiceState.DISCONNECTED);
    
    logger.info(`Service registered: ${name}`);
    this.emit("service-registered", { name, service });
  }

  /**
   * Get a service by name
   */
  get<T extends BaseService>(name: string): T | null {
    const service = this.services.get(name);
    return service as T || null;
  }

  /**
   * Check if a service is registered
   */
  has(name: string): boolean {
    return this.services.has(name);
  }

  /**
   * Get all registered service names
   */
  getServiceNames(): string[] {
    return Array.from(this.services.keys());
  }

  /**
   * Initialize all services in dependency order
   */
  async initializeAll(configs?: Record<string, any>): Promise<void> {
    if (this.isInitialized) {
      logger.warn("Services already initialized");
      return;
    }

    logger.info("Initializing all services...");
    this.isInitialized = true;

    const serviceNames = Array.from(this.services.keys());
    const errors: Array<{ name: string; error: Error }> = [];

    for (const name of serviceNames) {
      try {
        await this.initializeService(name, configs?.[name]);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ name, error: err });
        logger.error(`Failed to initialize service '${name}':`, err.message);
      }
    }

    if (errors.length > 0) {
      logger.warn(`${errors.length} services failed to initialize`);
      // Don't throw - allow partial initialization
    }

    logger.info("Service initialization complete");
    this.emit("all-services-initialized", { errors });
  }

  /**
   * Initialize a specific service
   */
  async initializeService(name: string, config?: any): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found`);
    }

    if (this.serviceStates.get(name) !== ServiceState.DISCONNECTED) {
      logger.warn(`Service '${name}' already initialized`);
      return;
    }

    try {
      this.serviceStates.set(name, ServiceState.INITIALIZING);
      logger.info(`Initializing service: ${name}`);
      
      await service.initialize(config);
      
      this.serviceStates.set(name, ServiceState.READY);
      logger.info(`Service initialized successfully: ${name}`);
      
      this.emit("service-initialized", { name, service });
    } catch (error) {
      this.serviceStates.set(name, ServiceState.ERROR);
      this.emit("service-error", { name, error });
      throw error;
    }
  }

  /**
   * Terminate all services gracefully
   */
  async terminateAll(): Promise<void> {
    if (this.isTerminating) {
      logger.warn("Services already terminating");
      return;
    }

    logger.info("Terminating all services...");
    this.isTerminating = true;

    const serviceNames = Array.from(this.services.keys()).reverse(); // Reverse order for cleanup
    const errors: Array<{ name: string; error: Error }> = [];

    for (const name of serviceNames) {
      try {
        await this.terminateService(name);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        errors.push({ name, error: err });
        logger.error(`Failed to terminate service '${name}':`, err.message);
      }
    }

    if (errors.length > 0) {
      logger.warn(`${errors.length} services failed to terminate cleanly`);
    }

    this.isInitialized = false;
    this.isTerminating = false;

    logger.info("Service termination complete");
    this.emit("all-services-terminated", { errors });
  }

  /**
   * Terminate a specific service
   */
  async terminateService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service '${name}' not found`);
    }

    const currentState = this.serviceStates.get(name);
    if (currentState === ServiceState.DISCONNECTED || currentState === ServiceState.TERMINATING) {
      logger.warn(`Service '${name}' already terminated`);
      return;
    }

    try {
      this.serviceStates.set(name, ServiceState.TERMINATING);
      logger.info(`Terminating service: ${name}`);
      
      await service.terminate();
      
      this.serviceStates.set(name, ServiceState.DISCONNECTED);
      logger.info(`Service terminated successfully: ${name}`);
      
      this.emit("service-terminated", { name, service });
    } catch (error) {
      this.serviceStates.set(name, ServiceState.ERROR);
      this.emit("service-error", { name, error });
      throw error;
    }
  }

  /**
   * Get health status of all services
   */
  getHealthStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    const serviceNames = Array.from(this.services.keys());
    
    for (const name of serviceNames) {
      const service = this.services.get(name)!;
      try {
        status[name] = service.isHealthy();
      } catch (error) {
        status[name] = false;
        logger.error(`Error checking health for service '${name}':`, error);
      }
    }
    
    return status;
  }

  /**
   * Get detailed status of all services
   */
  getDetailedStatus(): Record<string, ServiceStatus> {
    const status: Record<string, ServiceStatus> = {};
    const serviceNames = Array.from(this.services.keys());
    
    for (const name of serviceNames) {
      const service = this.services.get(name)!;
      const state = this.serviceStates.get(name)!;
      
      try {
        status[name] = {
          ...service.getStatus(),
          serviceState: state,
        };
      } catch (error) {
        status[name] = {
          ready: false,
          initialized: false,
          serviceStatus: "error",
          serviceState: state,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }
    
    return status;
  }

  /**
   * Check if all services are healthy
   */
  areAllServicesHealthy(): boolean {
    const healthStatus = this.getHealthStatus();
    return Object.values(healthStatus).every(isHealthy => isHealthy);
  }

  /**
   * Get service count
   */
  getServiceCount(): number {
    return this.services.size;
  }

  /**
   * Clear all services (for testing)
   */
  clear(): void {
    this.services.clear();
    this.serviceStates.clear();
    this.isInitialized = false;
    this.isTerminating = false;
    this.removeAllListeners();
  }
}