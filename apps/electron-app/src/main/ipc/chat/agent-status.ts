import { ipcMain } from "electron";
import { createLogger, IAgentProvider } from "@vibe/shared-types";

const logger = createLogger("AgentStatusIPC");

/**
 * Agent status and initialization handlers
 * Updated to use new AgentService architecture with proper interfaces
 */

// Global reference to the agent service instance
// This will be set by the main process during initialization
let agentServiceInstance: IAgentProvider | null = null;

/**
 * Set the agent service instance (called by main process)
 */
export function setAgentServiceInstance(service: IAgentProvider): void {
  agentServiceInstance = service;
}

/**
 * Get the current agent service instance
 */
function getAgentService(): IAgentProvider | null {
  return agentServiceInstance;
}

ipcMain.handle("chat:get-agent-status", async () => {
  try {
    const agentService = getAgentService();

    if (!agentService) {
      return {
        status: "not_initialized",
        ready: false,
        initialized: false,
      };
    }

    const serviceStatus = agentService.getStatus();

    return {
      status: serviceStatus.ready ? "ready" : serviceStatus.serviceStatus,
      ready: serviceStatus.ready,
      initialized: serviceStatus.initialized,
      serviceStatus: serviceStatus.serviceStatus,
      workerConnected: serviceStatus.workerStatus?.connected || false,
      isHealthy: serviceStatus.isHealthy || false,
      lastActivity: serviceStatus.lastActivity,
    };
  } catch (error) {
    logger.error("Error getting agent status:", error);
    return {
      status: "error",
      ready: false,
      initialized: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});

ipcMain.handle("chat:initialize-agent", async () => {
  try {
    const agentService = getAgentService();

    if (!agentService) {
      throw new Error("AgentService not available");
    }

    const currentStatus = agentService.getStatus();
    if (currentStatus.initialized) {
      logger.info("Agent already initialized");
      return {
        success: true,
        message: "Agent already initialized",
        status: currentStatus,
      };
    }

    logger.info("Agent initialization requested via IPC");

    return {
      success: true,
      message: "Agent initialization handled by main process",
    };
  } catch (error) {
    logger.error("Agent initialization failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
