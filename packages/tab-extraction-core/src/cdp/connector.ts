import CDP from "chrome-remote-interface";
import { createLogger } from "@vibe/shared-types";
import type { CDPTarget } from "../types/index.js";
import { extractionConfig } from "../config/extraction.js";

const logger = createLogger("cdp-connector");

export interface CDPConnection {
  client: CDP.Client;
  target: CDPTarget;
  disconnect: () => Promise<void>;
  lastUsed: number;
  inUse: boolean;
}

interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export class CDPConnector {
  private host: string;
  private port: number;
  private connections: Map<string, CDPConnection> = new Map();
  private connectionTimestamps: Map<string, number> = new Map();
  private connectionTimeout = extractionConfig.cdp.connectionTimeout;
  private cleanupInterval: NodeJS.Timeout | null = null;

  // Connection pool settings from config
  private maxPoolSize = extractionConfig.cdp.poolSize;
  private maxIdleTime = extractionConfig.cdp.idleTimeout;
  private connectionPool: Map<string, CDPConnection> = new Map();

  // Retry settings from config
  private retryOptions: RetryOptions = extractionConfig.cdp.retryOptions;

  constructor(host: string = "localhost", port: number = 9223) {
    this.host = host;
    this.port = port;

    // Start periodic cleanup of stale connections
    this.cleanupInterval = setInterval(
      () => {
        this.cleanupStaleConnections();
        this.cleanupIdlePoolConnections();
      },
      5 * 60 * 1000,
    ); // Run every 5 minutes
  }

  private cleanupStaleConnections(): void {
    const now = Date.now();
    const staleTargets: string[] = [];

    this.connectionTimestamps.forEach((timestamp, targetId) => {
      if (now - timestamp > this.connectionTimeout) {
        staleTargets.push(targetId);
      }
    });

    if (staleTargets.length > 0) {
      logger.info(`Cleaning up ${staleTargets.length} stale connections`);
      staleTargets.forEach(targetId => {
        this.disconnect(targetId).catch(error => {
          logger.error(
            `Error cleaning up stale connection ${targetId}:`,
            error,
          );
        });
      });
    }
  }

  private cleanupIdlePoolConnections(): void {
    const now = Date.now();
    const idleConnections: string[] = [];

    this.connectionPool.forEach((connection, key) => {
      if (!connection.inUse && now - connection.lastUsed > this.maxIdleTime) {
        idleConnections.push(key);
      }
    });

    idleConnections.forEach(async key => {
      const connection = this.connectionPool.get(key);
      if (connection) {
        try {
          await connection.client.close();
          this.connectionPool.delete(key);
          logger.debug(`Removed idle connection from pool: ${key}`);
        } catch (error) {
          logger.error(`Error closing idle connection: ${error}`);
        }
      }
    });
  }

  private async getPooledConnection(
    targetId: string,
  ): Promise<CDPConnection | null> {
    const poolKey = `${this.host}:${this.port}:${targetId}`;
    const pooledConnection = this.connectionPool.get(poolKey);

    if (pooledConnection && !pooledConnection.inUse) {
      try {
        // Test if connection is still alive
        await pooledConnection.client.Runtime.evaluate({ expression: "1" });
        pooledConnection.inUse = true;
        pooledConnection.lastUsed = Date.now();
        logger.debug(`Reusing pooled connection for ${targetId}`);
        return pooledConnection;
      } catch {
        // Connection is dead, remove from pool
        this.connectionPool.delete(poolKey);
        logger.debug(`Removed dead connection from pool: ${poolKey}`);
      }
    }

    return null;
  }

  private async returnToPool(
    targetId: string,
    connection: CDPConnection,
  ): Promise<void> {
    const poolKey = `${this.host}:${this.port}:${targetId}`;

    if (this.connectionPool.size >= this.maxPoolSize) {
      // Pool is full, close the connection
      await connection.client.close();
      logger.debug(`Pool full, closing connection for ${targetId}`);
      return;
    }

    connection.inUse = false;
    connection.lastUsed = Date.now();
    this.connectionPool.set(poolKey, connection);
    logger.debug(`Returned connection to pool: ${poolKey}`);
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: Error | null = null;
    let delay = this.retryOptions.initialDelay;

    for (let attempt = 0; attempt < this.retryOptions.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.retryOptions.maxRetries - 1) {
          const jitter = Math.random() * 0.1 * delay; // Add 10% jitter
          const actualDelay = Math.min(
            delay + jitter,
            this.retryOptions.maxDelay,
          );

          logger.warn(
            `${context} failed (attempt ${attempt + 1}/${this.retryOptions.maxRetries}), ` +
              `retrying in ${Math.round(actualDelay)}ms...`,
            { error: lastError.message },
          );

          await this.delay(actualDelay);
          delay = Math.min(
            delay * this.retryOptions.backoffFactor,
            this.retryOptions.maxDelay,
          );
        }
      }
    }

    throw new Error(
      `${context} failed after ${this.retryOptions.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  async connect(targetId?: string, targetUrl?: string): Promise<CDPConnection> {
    logger.info(
      `[CDPConnector] Connect called with targetId: ${targetId}, targetUrl: ${targetUrl}`,
    );

    // Check if we already have a connection
    if (targetId && this.connections.has(targetId)) {
      logger.debug(`Reusing existing connection for target ${targetId}`);
      const connection = this.connections.get(targetId)!;
      connection.lastUsed = Date.now();
      return connection;
    }

    // Check connection pool
    if (targetId) {
      const pooledConnection = await this.getPooledConnection(targetId);
      if (pooledConnection) {
        this.connections.set(targetId, pooledConnection);
        this.connectionTimestamps.set(targetId, Date.now());
        return pooledConnection;
      }
    }

    return this.retryWithBackoff(async () => {
      logger.debug(`Attempting CDP connection to ${this.host}:${this.port}`);

      // Get list of targets
      const targets = await CDP.List({ host: this.host, port: this.port });
      logger.info(
        `[CDPConnector] Found ${targets.length} CDP targets at ${this.host}:${this.port}`,
      );

      if (targets.length === 0) {
        throw new Error("No CDP targets available");
      }

      // Log all available targets for debugging (only in development)
      if (process.env.NODE_ENV !== "production") {
        logger.debug(
          "Available CDP targets:",
          targets.map(t => ({
            id: t.id,
            url: t.url,
            type: t.type,
            title: t.title,
          })),
        );
      }

      // Find the target
      let target: CDPTarget | undefined;
      if (targetId) {
        logger.debug(`[CDPConnector] Looking for target by ID: ${targetId}`);
        target = targets.find(t => t.id === targetId);

        // If not found by ID and we have a URL, try to find by URL
        if (!target && targetUrl) {
          logger.debug(
            `Target ${targetId} not found by ID, trying to find by URL: ${targetUrl}`,
          );

          // Clean the URL for better matching
          const cleanUrl = targetUrl.split("?")[0].split("#")[0];
          logger.debug(`[CDPConnector] Clean URL for matching: ${cleanUrl}`);

          // Try exact match first
          target = targets.find(t => t.type === "page" && t.url === targetUrl);

          if (target) {
            logger.info(
              `[CDPConnector] Found target by exact URL match: ${target.id}`,
            );
          }

          // Try matching without query params
          if (!target) {
            target = targets.find(
              t =>
                t.type === "page" &&
                t.url &&
                t.url.split("?")[0].split("#")[0] === cleanUrl,
            );
            if (target) {
              logger.info(
                `[CDPConnector] Found target by clean URL match: ${target.id}`,
              );
            }
          }

          // Try domain match
          if (!target) {
            try {
              const urlDomain = new URL(targetUrl).hostname;
              logger.debug(`[CDPConnector] Trying domain match: ${urlDomain}`);
              target = targets.find(
                t =>
                  t.type === "page" &&
                  t.url &&
                  new URL(t.url).hostname === urlDomain,
              );
              if (target) {
                logger.info(
                  `[CDPConnector] Found target by domain match: ${target.id}`,
                );
              }
            } catch (e) {
              logger.error(
                `[CDPConnector] Error parsing URL for domain match:`,
                e,
              );
            }
          }
        }

        if (!target) {
          // Log available targets for debugging
          logger.error(
            `[CDPConnector] Target ${targetId} not found. Available targets:`,
            targets.map(t => ({ id: t.id, url: t.url, type: t.type })),
          );
          throw new Error(`Target ${targetId} not found`);
        } else {
          logger.info(
            `[CDPConnector] Found target: ${target.id} (${target.url})`,
          );
        }
      } else {
        // Get the first page target
        logger.debug(
          `[CDPConnector] No target ID specified, looking for first page target`,
        );
        target = targets.find(t => t.type === "page");
        if (!target) {
          throw new Error("No page targets available");
        }
        logger.info(
          `[CDPConnector] Using first page target: ${target.id} (${target.url})`,
        );
      }

      // Connect to the target
      logger.debug(`[CDPConnector] Connecting to target ${target.id}...`);
      const client = await CDP({
        host: this.host,
        port: this.port,
        target: target.id,
      });

      // Enable necessary domains with retry
      await this.retryWithBackoff(async () => {
        await Promise.all([
          client.Page.enable(),
          client.Runtime.enable(),
          client.DOM.enable(),
        ]);
      }, "Enabling CDP domains");

      const connection: CDPConnection = {
        client,
        target,
        lastUsed: Date.now(),
        inUse: true,
        disconnect: async () => {
          await this.disconnect(target.id);
        },
      };

      this.connections.set(target.id, connection);
      this.connectionTimestamps.set(target.id, Date.now());
      logger.info(`Successfully connected to CDP target ${target.id}`);

      return connection;
    }, "CDP connection");
  }

  async disconnect(targetId: string): Promise<void> {
    const connection = this.connections.get(targetId);
    if (connection) {
      try {
        // Try to return to pool instead of closing
        if (connection.inUse) {
          await this.returnToPool(targetId, connection);
        }

        this.connections.delete(targetId);
        this.connectionTimestamps.delete(targetId);
        logger.debug(`Disconnected from CDP target ${targetId}`);
      } catch (error) {
        logger.error(`Error disconnecting from CDP target ${targetId}:`, error);
      }
    }
  }

  async disconnectAll(): Promise<void> {
    // Clear the cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // Close all pooled connections
    for (const [key, connection] of this.connectionPool) {
      try {
        await connection.client.close();
      } catch (error) {
        logger.error(`Error closing pooled connection ${key}:`, error);
      }
    }
    this.connectionPool.clear();

    const targetIds = Array.from(this.connections.keys());
    await Promise.all(targetIds.map(id => this.disconnect(id)));
  }

  async listTargets(): Promise<CDPTarget[]> {
    return this.retryWithBackoff(
      async () => CDP.List({ host: this.host, port: this.port }),
      "Listing CDP targets",
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Get pool statistics for monitoring
  getPoolStats() {
    const pooled = Array.from(this.connectionPool.values());
    return {
      totalConnections: this.connections.size,
      poolSize: this.connectionPool.size,
      activePoolConnections: pooled.filter(c => c.inUse).length,
      idlePoolConnections: pooled.filter(c => !c.inUse).length,
    };
  }
}
