import { ipcMain } from "electron";
import { createLogger, IAgentProvider } from "@vibe/shared-types";
import { AgentService } from "@/services/agent-service";
import { getSetting } from "@/ipc/user/shared-utils";
import { setAgentServiceInstance as setChatMessagingInstance } from "@/ipc/chat/chat-messaging";
import { setAgentServiceInstance as setTabAgentInstance } from "@/utils/tab-agent";
import { getAuthToken } from "@/ipc/app/app-info";

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
      // Check if we have an API key available
      const hasApiKey = !!(await getSetting("openaiApiKey"));

      return {
        status: hasApiKey ? "not_initialized" : "no_api_key",
        ready: false,
        initialized: false,
        serviceStatus: hasApiKey ? "disconnected" : "no_api_key",
      };
    }

    const serviceStatus = agentService.getStatus();

    // Check if we have an API key using the flag from service
    const hasApiKey = serviceStatus.hasApiKey || false;

    // Agent service might be "ready" but without an actual agent if no API key
    const actuallyReady = serviceStatus.ready && hasApiKey;

    return {
      status: !hasApiKey
        ? "no_api_key"
        : actuallyReady
          ? "ready"
          : serviceStatus.serviceStatus,
      ready: actuallyReady,
      initialized: serviceStatus.initialized,
      serviceStatus: serviceStatus.serviceStatus,
      workerConnected: serviceStatus.workerStatus?.connected || false,
      isHealthy: serviceStatus.isHealthy && hasApiKey,
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

ipcMain.handle("chat:create-agent-service", async () => {
  try {
    // Check if agent service already exists
    if (agentServiceInstance) {
      return {
        success: true,
        message: "Agent service already exists",
      };
    }

    // Check for API key in storage or environment
    const apiKey = await getSetting("openaiApiKey");
    if (!apiKey) {
      throw new Error("No API key found in storage or environment");
    }

    logger.info("Creating agent service after app startup");

    // Create and initialize agent service
    const agentService = new AgentService();
    // Retrieve auth token from proper storage mechanism
    const authToken = getAuthToken();

    // Set up error handling
    agentService.on("error", error => {
      logger.error("AgentService error:", error);
    });

    agentService.on("terminated", data => {
      logger.info("AgentService terminated:", data);
    });

    agentService.on("ready", data => {
      logger.info("AgentService ready:", data);
    });

    // Initialize with configuration
    await agentService.initialize({
      openaiApiKey: apiKey,
      model: "gpt-4o-mini",
      processorType: "react",
      authToken: authToken ?? undefined,
    });

    // Update the global instance
    agentServiceInstance = agentService;

    // Wire up IPC handlers
    setAgentServiceInstance(agentService);
    setChatMessagingInstance(agentService);
    setTabAgentInstance(agentService);

    logger.info("Agent service created and initialized successfully");
    return { success: true };
  } catch (error) {
    logger.error("Failed to create agent service:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
