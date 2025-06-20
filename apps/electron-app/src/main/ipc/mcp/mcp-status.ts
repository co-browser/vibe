/**
 * IPC handlers for MCP service status
 */

import { ipcMain } from "electron";
import type { MCPService } from "@/services/mcp-service";

// Module-level reference to MCP service instance
let mcpServiceInstance: MCPService | null = null;

/**
 * Set the MCP service instance for IPC handlers
 */
export function setMCPServiceInstance(service: MCPService | null): void {
  mcpServiceInstance = service;
}

/**
 * Get MCP service status
 */
ipcMain.handle("mcp:get-status", async () => {
  if (!mcpServiceInstance) {
    return {
      initialized: false,
      serviceStatus: "not_initialized",
    };
  }

  try {
    return mcpServiceInstance.getStatus();
  } catch (error) {
    console.error("[IPC] Failed to get MCP status:", error);
    return {
      initialized: false,
      serviceStatus: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
});
