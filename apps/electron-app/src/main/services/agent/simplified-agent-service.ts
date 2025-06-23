import { EventEmitter } from "events";
import type { AgentConfig, AgentStatus, IAgentService, ExtractedPage } from "@vibe/shared-types";
import { BaseService, ServiceStatus, ServiceState } from "../base-service";
import { AgentConfigValidator } from "./agent-config";
import { AgentWorkerManager } from "./agent-worker-manager";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("SimplifiedAgentService");

/**
 * Simplified Agent Service
 * 
 * A clean, focused service implementation using composition of specialized modules:
 * - AgentConfigValidator: Configuration validation and management
 * - AgentWorkerManager: Worker lifecycle and communication
 * 
 * This demonstrates the service layer simplification - reduced from 588 lines
 * to focused responsibilities with clear separation of concerns.
 */
export class SimplifiedAgentService extends EventEmitter implements IAgentService, BaseService {
  private workerManager: AgentWorkerManager;
  private currentConfig: AgentConfig | null = null;
  private serviceState: ServiceState = ServiceState.DISCONNECTED;
  private startTime: number = 0;

  constructor() {
    super();
    this.workerManager = new AgentWorkerManager();
    this.setupWorkerEventHandlers();
  }

  // === BaseService Implementation ===

  async initialize(config: AgentConfig): Promise<void> {
    if (this.serviceState !== ServiceState.DISCONNECTED) {
      throw new Error("Service already initialized");
    }

    this.serviceState = ServiceState.INITIALIZING;
    this.startTime = Date.now();

    try {
      // Validate and normalize configuration
      const validatedConfig = AgentConfigValidator.validateConfig(config);
      this.currentConfig = validatedConfig;

      logger.info("Initializing agent service with config:", 
        AgentConfigValidator.sanitizeConfig(validatedConfig));

      // Initialize worker with validated config
      await this.workerManager.initialize(validatedConfig);

      this.serviceState = ServiceState.READY;
      logger.info("Agent service initialized successfully");
      
      this.emit("ready", { config: validatedConfig });
    } catch (error) {
      this.serviceState = ServiceState.ERROR;
      logger.error("Agent service initialization failed:", error);
      this.emit("error", error);
      throw error;
    }
  }

  async terminate(): Promise<void> {
    if (this.serviceState === ServiceState.DISCONNECTED) {
      return;
    }

    this.serviceState = ServiceState.TERMINATING;
    logger.info("Terminating agent service");

    try {
      await this.workerManager.terminate();
      this.currentConfig = null;
      this.serviceState = ServiceState.DISCONNECTED;
      
      logger.info("Agent service terminated successfully");
      this.emit("terminated");
    } catch (error) {
      logger.error("Agent service termination failed:", error);
      this.serviceState = ServiceState.ERROR;
      throw error;
    }
  }

  getStatus(): AgentStatus {
    const workerStatus = this.workerManager.getConnectionStatus();

    return {
      ready: this.serviceState === ServiceState.READY,
      initialized: this.currentConfig !== null,
      serviceStatus: this.serviceState as "disconnected" | "initializing" | "ready" | "processing" | "error",
      lastActivity: this.startTime,
      isHealthy: this.isHealthy(),
      workerStatus,
      config: this.currentConfig ? AgentConfigValidator.sanitizeConfig(this.currentConfig) : undefined,
    };
  }

  // Additional method for BaseService interface
  getDetailedStatus(): ServiceStatus {
    const workerStatus = this.workerManager.getConnectionStatus();
    const managerState = this.workerManager.getManagerState();

    return {
      ready: this.serviceState === ServiceState.READY,
      initialized: this.currentConfig !== null,
      serviceStatus: this.serviceState,
      lastActivity: this.startTime,
      isHealthy: this.isHealthy(),
      workerStatus,
      managerState,
      config: this.currentConfig ? AgentConfigValidator.sanitizeConfig(this.currentConfig) : undefined,
    };
  }

  isHealthy(): boolean {
    return this.serviceState === ServiceState.READY && this.workerManager.isWorkerHealthy();
  }

  // === IAgentService Implementation ===

  async sendMessage(message: string): Promise<void> {
    this.validateServiceReady();

    try {
      this.serviceState = ServiceState.PROCESSING;

      await this.workerManager.sendStreamingMessage(
        "chat-stream",
        { message },
        (_messageId: string, data: any) => {
          this.emit("message-stream", data);
        }
      );

      this.serviceState = ServiceState.READY;
    } catch (error) {
      this.serviceState = ServiceState.ERROR;
      logger.error("Send message failed:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async reset(): Promise<void> {
    this.validateServiceReady();

    try {
      await this.workerManager.reset();
      logger.info("Agent state reset completed");
    } catch (error) {
      logger.error("Agent reset failed:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  async saveTabMemory(extractedPage: ExtractedPage): Promise<void> {
    this.validateServiceReady();

    try {
      await this.workerManager.sendMessage("save-tab-memory", { extractedPage });
      logger.info("Tab memory saved:", extractedPage.title);
    } catch (error) {
      logger.error("Save tab memory failed:", error);
      this.emit("error", error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // === Additional Service Methods ===

  async forceTerminate(): Promise<void> {
    logger.warn("Force terminating agent service");
    try {
      await this.terminate();
    } catch (error) {
      logger.error("Force terminate failed:", error);
      // Force cleanup anyway
      this.currentConfig = null;
      this.serviceState = ServiceState.DISCONNECTED;
    }
  }

  canTerminate(): { canTerminate: boolean; reason?: string } {
    if (this.serviceState === ServiceState.PROCESSING) {
      return {
        canTerminate: false,
        reason: "Service is currently processing"
      };
    }

    return { canTerminate: true };
  }

  getLifecycleState(): {
    hasWorker: boolean;
    hasConfig: boolean;
    status: string;
    lastActivity: number;
    uptime?: number;
  } {
    const managerState = this.workerManager.getManagerState();
    
    return {
      hasWorker: managerState.hasWorker,
      hasConfig: this.currentConfig !== null,
      status: this.serviceState,
      lastActivity: this.startTime,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : undefined,
    };
  }

  async performHealthCheck(): Promise<boolean> {
    try {
      return await this.workerManager.performHealthCheck();
    } catch (error) {
      logger.error("Health check failed:", error);
      return false;
    }
  }

  // === Private Helper Methods ===

  private validateServiceReady(): void {
    if (this.serviceState !== ServiceState.READY) {
      throw new Error(`Service not ready (current state: ${this.serviceState})`);
    }

    if (!this.workerManager.isWorkerHealthy()) {
      throw new Error("Worker not healthy");
    }
  }

  private setupWorkerEventHandlers(): void {
    this.workerManager.on("worker-ready", (data) => {
      logger.debug("Worker ready:", data);
    });

    this.workerManager.on("worker-error", (error) => {
      logger.error("Worker error:", error);
      this.serviceState = ServiceState.ERROR;
      this.emit("error", error);
    });

    this.workerManager.on("worker-unhealthy", (error) => {
      logger.warn("Worker unhealthy:", error);
      // Don't change service state - just monitor
    });

    this.workerManager.on("worker-disconnected", () => {
      logger.warn("Worker disconnected");
      this.serviceState = ServiceState.ERROR;
    });

    this.workerManager.on("worker-restarted", () => {
      logger.info("Worker restarted - service back to ready");
      this.serviceState = ServiceState.READY;
    });

    // Forward streaming data
    this.workerManager.on("stream", (_messageId: string, data: any) => {
      this.emit("message-stream", data);
    });
  }
}