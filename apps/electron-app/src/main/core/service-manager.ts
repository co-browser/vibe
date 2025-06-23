import { createLogger } from "@vibe/shared-types";
import { AgentService } from "@/services/agent-service";
import { MCPService } from "@/services/mcp-service";
import { setupMemoryMonitoring } from "@/utils/helpers";

const logger = createLogger("ServiceManager");

/**
 * Service Manager - Centralized Service Lifecycle Management
 * 
 * Simplifies and centralizes the management of all application services:
 * - AgentService (AI agent functionality)
 * - MCPService (Model Context Protocol)
 * - Memory monitoring
 * - Clean initialization and shutdown
 * 
 * Replaces scattered service initialization logic from main process.
 */
export class ServiceManager {
  private agentService: AgentService | null = null;
  private mcpService: MCPService | null = null;
  private memoryMonitor: ReturnType<typeof setupMemoryMonitoring> | null = null;
  private initialized = false;

  constructor() {
    // Constructor is intentionally simple
  }

  /**
   * Initialize all services
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn("Services already initialized");
      return;
    }

    try {
      logger.info("Initializing application services...");

      // Initialize memory monitoring first
      this.initializeMemoryMonitoring();

      // Initialize MCP service
      await this.initializeMCPService();

      // Initialize Agent service (only if API key available)
      await this.initializeAgentService();

      this.initialized = true;
      logger.info("✅ All services initialized successfully");
    } catch (error) {
      logger.error("Service initialization failed:", error);
      throw error;
    }
  }

  /**
   * Shutdown all services gracefully
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info("Shutting down services...");

    try {
      // Cleanup memory monitor
      if (this.memoryMonitor) {
        this.memoryMonitor.triggerGarbageCollection();
        this.memoryMonitor = null;
      }

      // Shutdown MCP service first
      if (this.mcpService) {
        try {
          await this.mcpService.terminate();
          logger.info("MCP service terminated successfully");
        } catch (error) {
          logger.error("Error during MCP service termination:", error);
        }
        this.mcpService = null;
      }

      // Shutdown agent service
      if (this.agentService) {
        try {
          await this.agentService.terminate();
          logger.info("Agent service terminated successfully");
        } catch (error) {
          logger.error("Error during agent service termination:", error);
        }
        this.agentService = null;
      }

      this.initialized = false;
      logger.info("All services shut down successfully");
    } catch (error) {
      logger.error("Error during service shutdown:", error);
      throw error;
    }
  }

  /**
   * Get the agent service instance
   */
  getAgentService(): AgentService | null {
    return this.agentService;
  }

  /**
   * Get the MCP service instance
   */
  getMCPService(): MCPService | null {
    return this.mcpService;
  }

  /**
   * Get the memory monitor instance
   */
  getMemoryMonitor(): ReturnType<typeof setupMemoryMonitoring> | null {
    return this.memoryMonitor;
  }

  /**
   * Check if services are initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get service status summary
   */
  getServiceStatus(): {
    initialized: boolean;
    agentServiceReady: boolean;
    mcpServiceReady: boolean;
    memoryMonitorActive: boolean;
  } {
    return {
      initialized: this.initialized,
      agentServiceReady: !!this.agentService,
      mcpServiceReady: !!this.mcpService,
      memoryMonitorActive: !!this.memoryMonitor,
    };
  }

  // === Private Methods ===

  private initializeMemoryMonitoring(): void {
    try {
      logger.info("Initializing memory monitoring...");
      this.memoryMonitor = setupMemoryMonitoring();
      logger.info("Memory monitoring initialized");
    } catch (error) {
      logger.error("Memory monitoring initialization failed:", error);
      // Continue without memory monitoring
    }
  }

  private async initializeMCPService(): Promise<void> {
    try {
      logger.info("Initializing MCP service...");

      this.mcpService = new MCPService();

      // Set up error handling for MCP service
      this.mcpService.on("error", error => {
        logger.error("MCPService error:", error);
      });

      this.mcpService.on("ready", () => {
        logger.info("MCPService ready");
      });

      // Initialize MCP service
      await this.mcpService.initialize();

      logger.info("MCP service initialized successfully");
    } catch (error) {
      logger.error("MCP service initialization failed:", error);
      logger.warn("Application will continue without MCP service");
      this.mcpService = null;
      // Don't throw - continue without MCP service
    }
  }

  private async initializeAgentService(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      logger.warn("OPENAI_API_KEY not found, skipping agent service initialization");
      return;
    }

    try {
      logger.info("Initializing AgentService with utility process isolation...");

      // Create AgentService instance
      this.agentService = new AgentService();

      // Set up error handling for agent service
      this.agentService.on("error", error => {
        logger.error("AgentService error:", error);
      });

      this.agentService.on("terminated", data => {
        logger.info("AgentService terminated:", data);
      });

      this.agentService.on("ready", data => {
        logger.info("AgentService ready:", data);
      });

      // Initialize with configuration
      await this.agentService.initialize({
        openaiApiKey: process.env.OPENAI_API_KEY!,
        model: "gpt-4o-mini",
        processorType: "react",
      });

      logger.info("AgentService initialized successfully with utility process isolation");
    } catch (error) {
      logger.error("AgentService initialization failed:", error);
      logger.warn("Application will continue without agent service");
      this.agentService = null;
      // Don't throw - continue without agent service
    }
  }

  /**
   * Connect memory monitor with browser instance
   */
  connectMemoryMonitorToBrowser(browserInstance: any): void {
    if (this.memoryMonitor && browserInstance) {
      this.memoryMonitor.setBrowserInstance(browserInstance);
      logger.info("Memory monitor connected to browser instance");
    }
  }
}