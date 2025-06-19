/**
 * MCP Service - High-level coordinator for MCP operations
 * Uses MCPWorker internally to manage utility process communication
 */

import { EventEmitter } from "events";
import { MCPWorker } from "./mcp-worker";
import type { IMCPService, MCPServerStatus } from "@vibe/shared-types";

export class MCPService extends EventEmitter implements IMCPService {
  private worker: MCPWorker | null = null;
  private initialized = false;
  private status: "disconnected" | "initializing" | "ready" | "error" =
    "disconnected";

  constructor() {
    super();
  }

  /**
   * Initialize the MCP service
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      console.log("[MCPService] Already initialized");
      return;
    }

    try {
      this.status = "initializing";
      console.log("[MCPService] Initializing MCP service");

      // Create and start MCPWorker instance
      this.worker = new MCPWorker();

      // Handle worker events
      this.setupWorkerEventHandlers();

      // Start the worker process
      await this.worker.start();

      this.initialized = true;
      this.status = "ready";

      console.log("[MCPService] MCP service initialized successfully");

      // Emit service ready event
      this.emit("ready", {
        status: this.status,
      });
    } catch (error) {
      this.status = "error";
      console.error("[MCPService] Initialization failed:", error);

      // Cleanup on failure
      if (this.worker) {
        await this.worker.stop().catch(() => {});
        this.worker = null;
      }

      // Emit error event
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Get current MCP service status
   */
  getStatus(): {
    initialized: boolean;
    serviceStatus: string;
    workerStatus?: {
      servers?: Record<string, MCPServerStatus>;
    };
  } {
    const baseStatus = {
      initialized: this.initialized,
      serviceStatus: this.status,
    };

    // Get worker status if available
    let workerStatus:
      | { servers?: Record<string, MCPServerStatus> }
      | undefined = undefined;
    if (this.worker) {
      try {
        // Transform worker connection status to match interface
        workerStatus = {
          servers: {
            // We'll update this when we have actual server statuses from the worker
          },
        };
      } catch (error) {
        console.warn("[MCPService] Failed to get worker status:", error);
      }
    }

    return {
      ...baseStatus,
      workerStatus,
    };
  }

  /**
   * Terminate the MCP service
   */
  async terminate(): Promise<void> {
    try {
      console.log("[MCPService] Terminating MCP service");

      this.status = "disconnected";
      this.initialized = false;

      // Remove all event listeners
      this.removeAllListeners();

      // Stop MCPWorker cleanly
      if (this.worker) {
        try {
          await Promise.race([
            this.worker.stop(),
            new Promise((_, reject) =>
              setTimeout(
                () => reject(new Error("Worker shutdown timeout")),
                5000,
              ),
            ),
          ]);

          console.log("[MCPService] Worker stopped successfully");
        } catch (workerError) {
          console.warn("[MCPService] Worker shutdown error:", workerError);
        } finally {
          this.worker = null;
        }
      }

      console.log("[MCPService] MCP service terminated successfully");
    } catch (error) {
      console.error("[MCPService] Error during termination:", error);
      this.status = "error";
      this.worker = null;
      throw error;
    }
  }

  /**
   * Setup event handlers for worker events
   */
  private setupWorkerEventHandlers(): void {
    if (!this.worker) return;

    this.worker.on("connected", data => {
      if (process.env.LOG_LEVEL === "debug") {
        console.log("[MCPService] Worker connected:", data);
      }
      this.emit("connected", data);
    });

    this.worker.on("disconnected", data => {
      console.warn("[MCPService] Worker disconnected:", data);
      this.status = "error";
      this.emit("disconnected", data);
    });

    this.worker.on("error", error => {
      console.error("[MCPService] Worker error:", error);
      this.status = "error";
      this.emit("error", error);
    });
  }
}
