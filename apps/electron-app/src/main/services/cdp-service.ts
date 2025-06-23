import { WebContents } from "electron";
import type { CDPTarget } from "@vibe/shared-types";
import type { CDPMetadata } from "../../types/browser";
import { truncateUrl } from "@vibe/shared-types";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("CdpService");

/**
 * Chrome DevTools Protocol Manager Service
 *
 * Handles CDP debugger attachment, domain enabling, event handling,
 * and metadata management for browser automation capabilities.
 */
export class CDPManager {
  // Private metadata storage keyed by WebContents ID
  private metadata: Map<number, CDPMetadata> = new Map();

  // Configuration constants
  private readonly REMOTE_DEBUGGING_PORT = 9223;
  private readonly MAX_CONNECTION_ATTEMPTS = 3;
  private readonly RETRY_BACKOFF_BASE = 100;

  /**
   * Attaches CDP debugger to WebContents
   */
  public async attachDebugger(
    webContents: WebContents,
    tabKey: string,
  ): Promise<boolean> {
    if (webContents.isDestroyed()) {
      logger.warn(
        `Tab ${tabKey}: WebContents destroyed before CDP setup could complete`,
      );
      return false;
    }

    // Get or create metadata
    let cdpMetadata = this.metadata.get(webContents.id);
    if (!cdpMetadata) {
      cdpMetadata = {
        cdpTargetId: "",
        debuggerPort: this.REMOTE_DEBUGGING_PORT,
        isAttached: false,
        connectionAttempts: 0,
        maxAttempts: this.MAX_CONNECTION_ATTEMPTS,
        lastConnectTime: Date.now(),
        originalUrl: webContents.getURL() || "about:blank",
        currentUrl: webContents.getURL() || "about:blank",
        lastNavigationTime: Date.now(),
        debugInfo: {
          cdpConnectTime: 0,
          lastCommandTime: 0,
          lastErrorTime: 0,
          lastErrorMessage: "",
          commandCount: 0,
          eventCount: 0,
        },
      };
      this.metadata.set(webContents.id, cdpMetadata);
    }

    if (cdpMetadata.connectionAttempts >= cdpMetadata.maxAttempts) {
      logger.error(
        `Tab ${tabKey}: Exceeded maximum CDP connection attempts (${cdpMetadata.maxAttempts})`,
      );
      cdpMetadata.debugInfo.lastErrorMessage =
        "Exceeded maximum connection attempts";
      cdpMetadata.debugInfo.lastErrorTime = Date.now();
      return false;
    }

    cdpMetadata.connectionAttempts++;

    try {
      // Check if already attached to avoid errors
      if (webContents.debugger.isAttached()) {
        logger.info(`Tab ${tabKey}: CDP debugger already attached`);
        cdpMetadata.isAttached = true;
        return true;
      }

      // Capture start time for connection timing
      const startTime = Date.now();

      // Try to attach debugger
      webContents.debugger.attach("1.3");
      cdpMetadata.isAttached = true;

      // Always set a CDP target ID - start with fallback
      cdpMetadata.cdpTargetId = `webcontents-${webContents.id}`;
      logger.debug(
        `[CDPManager] Set fallback CDP target ID for tab ${tabKey}: ${cdpMetadata.cdpTargetId}`,
      );

      // Try to get the real CDP target ID
      try {
        const targetInfo = await webContents.debugger.sendCommand(
          "Target.getTargetInfo",
        );
        logger.debug(
          `[CDPManager] Target.getTargetInfo response for tab ${tabKey}:`,
          targetInfo,
        );

        if (
          targetInfo &&
          targetInfo.targetInfo &&
          targetInfo.targetInfo.targetId
        ) {
          cdpMetadata.cdpTargetId = targetInfo.targetInfo.targetId;
          logger.info(
            `Tab ${tabKey}: CDP target ID acquired: ${cdpMetadata.cdpTargetId}`,
          );
        } else {
          logger.info(
            `Tab ${tabKey}: Using fallback CDP target ID: ${cdpMetadata.cdpTargetId}`,
          );
        }
      } catch (error) {
        logger.warn(
          `Tab ${tabKey}: Failed to get real target ID, using fallback:`,
          error,
        );
        // Keep the fallback ID we already set
      }

      // Update timing info
      cdpMetadata.debugInfo.cdpConnectTime = Date.now();
      cdpMetadata.debugInfo.lastCommandTime = Date.now();
      cdpMetadata.lastConnectTime = Date.now();

      logger.info(
        `Tab ${tabKey}: CDP debugging enabled on port ${this.REMOTE_DEBUGGING_PORT} (connected in ${Date.now() - startTime}ms)`,
      );

      return true;
    } catch (err) {
      cdpMetadata.debugInfo.lastErrorTime = Date.now();
      cdpMetadata.debugInfo.lastErrorMessage =
        err instanceof Error ? err.message : String(err);
      cdpMetadata.isAttached = false;

      logger.error(`Tab ${tabKey}: Failed to attach debugger:`, err);

      // Attempt recovery with exponential backoff
      const backoffTime = Math.min(
        this.RETRY_BACKOFF_BASE * Math.pow(2, cdpMetadata.connectionAttempts),
        2000,
      );
      logger.info(
        `Tab ${tabKey}: Retrying CDP connection in ${backoffTime}ms (attempt ${cdpMetadata.connectionAttempts}/${cdpMetadata.maxAttempts})`,
      );

      // Try to clean up any partial connection
      try {
        if (webContents.debugger.isAttached()) {
          webContents.debugger.detach();
        }
      } catch {
        // Ignore errors during cleanup
      }

      // Wait and retry if under max attempts
      if (cdpMetadata.connectionAttempts < cdpMetadata.maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, backoffTime));
        return this.attachDebugger(webContents, tabKey);
      }

      // Fall back to operation without CDP if we've exhausted retries
      logger.warn(
        `Tab ${tabKey}: Continuing without CDP debugging after ${cdpMetadata.maxAttempts} failed attempts`,
      );
      return false;
    }
  }

  /**
   * Detaches CDP debugger from WebContents
   */
  public detachDebugger(webContents: WebContents): void {
    if (webContents.isDestroyed()) {
      return;
    }

    try {
      // Remove event handlers first to prevent memory leaks
      const eventHandlers = (webContents as any).__cdpEventHandlers;
      if (eventHandlers && eventHandlers instanceof Set) {
        eventHandlers.forEach((handler: any) => {
          webContents.debugger.removeListener("message", handler);
        });
        eventHandlers.clear();
        delete (webContents as any).__cdpEventHandlers;
      }

      // Detach debugger if attached
      if (webContents.debugger.isAttached()) {
        webContents.debugger.detach();
      }

      // Update metadata
      const cdpMetadata = this.metadata.get(webContents.id);
      if (cdpMetadata) {
        cdpMetadata.isAttached = false;
      }

      logger.debug("[CDPManager] Debugger detached and cleaned up");
    } catch (error) {
      logger.error("[CDPManager] Error during debugger detachment:", error);
    }
  }

  /**
   * Enables required CDP domains (Page, Network, Runtime)
   */
  public async enableDomains(webContents: WebContents): Promise<boolean> {
    if (webContents.isDestroyed()) {
      return false;
    }

    const cdpMetadata = this.metadata.get(webContents.id);
    if (!cdpMetadata) {
      logger.warn("[CDPManager] Cannot enable domains: no metadata found");
      return false;
    }

    if (!webContents.debugger.isAttached()) {
      logger.warn("[CDPManager] Cannot enable domains: debugger not attached");
      return false;
    }

    try {
      // Enable Page domain
      cdpMetadata.debugInfo.lastCommandTime = Date.now();
      cdpMetadata.debugInfo.commandCount++;
      await webContents.debugger.sendCommand("Page.enable");

      // Enable Network domain
      cdpMetadata.debugInfo.lastCommandTime = Date.now();
      cdpMetadata.debugInfo.commandCount++;
      await webContents.debugger.sendCommand("Network.enable");

      // Enable Runtime domain
      cdpMetadata.debugInfo.lastCommandTime = Date.now();
      cdpMetadata.debugInfo.commandCount++;
      await webContents.debugger.sendCommand("Runtime.enable");

      // Enable CSP bypass for better script execution
      cdpMetadata.debugInfo.lastCommandTime = Date.now();
      cdpMetadata.debugInfo.commandCount++;
      await webContents.debugger.sendCommand("Page.setBypassCSP", {
        enabled: true,
      });

      return true;
    } catch (err) {
      cdpMetadata.debugInfo.lastErrorTime = Date.now();
      cdpMetadata.debugInfo.lastErrorMessage =
        err instanceof Error ? err.message : String(err);
      logger.error("[CDPManager] Failed to enable CDP domains:", err);
      return false;
    }
  }

  /**
   * Gets CDP target ID for WebContents
   */
  public async getTargetId(webContents: WebContents): Promise<string | null> {
    if (webContents.isDestroyed()) {
      return null;
    }

    const cdpMetadata = this.metadata.get(webContents.id);

    // Return cached target ID if available
    if (cdpMetadata && cdpMetadata.cdpTargetId) {
      return cdpMetadata.cdpTargetId;
    }

    // If no debugger attached, return fallback ID
    if (!webContents.debugger.isAttached()) {
      const fallbackId = `webcontents-${webContents.id}`;
      if (cdpMetadata) {
        cdpMetadata.cdpTargetId = fallbackId;
      }
      return fallbackId;
    }

    try {
      // Try to get real CDP target ID via debugger command
      const targetInfo = await webContents.debugger.sendCommand(
        "Target.getTargetInfo",
      );

      if (
        targetInfo &&
        targetInfo.targetInfo &&
        targetInfo.targetInfo.targetId
      ) {
        const realTargetId = targetInfo.targetInfo.targetId;

        // Update metadata if available
        if (cdpMetadata) {
          cdpMetadata.cdpTargetId = realTargetId;
          cdpMetadata.debugInfo.lastCommandTime = Date.now();
          cdpMetadata.debugInfo.commandCount++;
        }

        return realTargetId;
      } else {
        // Fall back to webcontents-based ID
        const fallbackId = `webcontents-${webContents.id}`;
        if (cdpMetadata) {
          cdpMetadata.cdpTargetId = fallbackId;
        }
        return fallbackId;
      }
    } catch (error) {
      // Fall back to webcontents-based ID on error
      const fallbackId = `webcontents-${webContents.id}`;
      if (cdpMetadata) {
        cdpMetadata.cdpTargetId = fallbackId;
        cdpMetadata.debugInfo.lastErrorTime = Date.now();
        cdpMetadata.debugInfo.lastErrorMessage =
          error instanceof Error ? error.message : String(error);
      }
      return fallbackId;
    }
  }

  /**
   * Polls for CDP target by URL
   */
  public async pollForTargetId(url: string): Promise<CDPTarget | null> {
    try {
      const cdpUrl =
        process.env.CDP_BASE_URL ||
        `http://127.0.0.1:${this.REMOTE_DEBUGGING_PORT}`;
      const response = await fetch(`${cdpUrl}/json/list`);

      if (!response.ok) {
        logger.warn(
          `[CDPManager] CDP /json/list request failed: ${response.status} ${response.statusText}`,
        );
        return null;
      }

      const targets = (await response.json()) as Array<{
        id: string;
        url: string;
        type: string;
        webSocketDebuggerUrl: string;
        devtoolsFrontendUrl: string;
      }>;

      // Find target by URL
      const foundTarget = targets.find(
        target => target.type === "page" && target.url === url,
      );

      if (foundTarget && foundTarget.id) {
        return {
          id: foundTarget.id,
          url: foundTarget.url,
          type: foundTarget.type,
          webSocketDebuggerUrl: foundTarget.webSocketDebuggerUrl,
          devtoolsFrontendUrl: foundTarget.devtoolsFrontendUrl,
        };
      }

      logger.debug(
        `[CDPManager] Tab not found in CDP targets for URL: ${truncateUrl(url)}`,
      );
      return null;
    } catch (error) {
      logger.error(
        `[CDPManager] Error polling CDP for URL ${truncateUrl(url)}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Sets up CDP event handlers
   */
  public setupEventHandlers(webContents: WebContents, tabKey: string): void {
    if (webContents.isDestroyed()) {
      logger.warn(
        `[CDPManager] Cannot setup event handlers for tab ${tabKey}: WebContents destroyed`,
      );
      return;
    }

    const cdpMetadata = this.metadata.get(webContents.id);
    if (!cdpMetadata) {
      logger.warn(
        `[CDPManager] Cannot setup event handlers for tab ${tabKey}: no metadata found`,
      );
      return;
    }

    if (!webContents.debugger.isAttached()) {
      logger.warn(
        `[CDPManager] Cannot setup event handlers for tab ${tabKey}: debugger not attached`,
      );
      return;
    }

    // Set up CDP event handlers with tracking
    const eventHandler = (_event: any, method: string, params: any): void => {
      // Increment event counter for debugging
      cdpMetadata.debugInfo.eventCount++;

      // Track CDP events for debugging

      // Handle Page.frameNavigated events
      if (method === "Page.frameNavigated") {
        cdpMetadata.lastNavigationTime = Date.now();
        if (params.frame && params.frame.url) {
          // Update navigation URLs in metadata
          const newUrl = params.frame.url;

          // Don't update for internal pages
          if (
            !newUrl.startsWith("localhost:") &&
            !newUrl.startsWith("about:")
          ) {
            cdpMetadata.originalUrl = newUrl;
            cdpMetadata.currentUrl = newUrl;
            logger.debug(
              `[CDPManager] Tab ${tabKey} navigated to: ${truncateUrl(newUrl)}`,
            );
          }
        }
      }
    };

    // Attach the event handler
    webContents.debugger.on("message", eventHandler);

    // Store reference to handler for cleanup (attach to webContents object)
    if (!(webContents as any).__cdpEventHandlers) {
      (webContents as any).__cdpEventHandlers = new Set();
    }
    (webContents as any).__cdpEventHandlers.add(eventHandler);

    logger.debug(`[CDPManager] Event handlers setup for tab ${tabKey}`);
  }

  /**
   * Gets metadata for WebContents
   */
  public getMetadata(webContents: WebContents): CDPMetadata | null {
    return this.metadata.get(webContents.id) || null;
  }

  /**
   * Updates metadata for WebContents
   */
  public updateMetadata(
    webContents: WebContents,
    updates: Partial<CDPMetadata>,
  ): void {
    if (webContents.isDestroyed()) {
      return;
    }

    const existingMetadata = this.metadata.get(webContents.id);
    if (!existingMetadata) {
      logger.warn(
        "[CDPManager] Cannot update metadata: no existing metadata found",
      );
      return;
    }

    // Merge updates into existing metadata
    Object.assign(existingMetadata, updates);
  }

  /**
   * Checks if debugger is attached to WebContents
   */
  public isDebuggerAttached(webContents: WebContents): boolean {
    if (webContents.isDestroyed()) {
      return false;
    }

    // Check both electron debugger state and our metadata
    const isElectronAttached = webContents.debugger.isAttached();
    const cdpMetadata = this.metadata.get(webContents.id);
    const isMetadataAttached = cdpMetadata?.isAttached ?? false;

    // Update metadata if there's a mismatch
    if (cdpMetadata && isElectronAttached !== isMetadataAttached) {
      cdpMetadata.isAttached = isElectronAttached;
    }

    return isElectronAttached;
  }

  /**
   * Cleans up all resources for a WebContents (call when tab is removed)
   */
  public cleanup(webContents: WebContents): void {
    if (!webContents.isDestroyed()) {
      this.detachDebugger(webContents);
    }

    // Remove metadata
    this.metadata.delete(webContents.id);
  }
}
