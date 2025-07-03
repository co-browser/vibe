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
export function getAgentService(): IAgentProvider | null {
  return agentServiceInstance;
}

ipcMain.handle("chat:get-agent-status", async () => {
  try {
    const agentService = getAgentService();

    if (!agentService) {
      return false;
    }

    const serviceStatus = agentService.getStatus();
    return serviceStatus.ready;
  } catch (error) {
    logger.error("Error getting agent status:", error);
    return false;
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

ipcMain.handle(
  "agent:update-auth-token",
  async (_event, token: string | null) => {
    try {
      const agentService = getAgentService();

      if (!agentService) {
        throw new Error("AgentService not available");
      }

      logger.info("Updating agent auth token:", token ? "present" : "null");
      await agentService.updateAuthToken(token);

      return {
        success: true,
        message: "Auth token updated successfully",
      };
    } catch (error) {
      logger.error("Failed to update auth token:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
);
