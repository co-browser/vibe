/**
 * OverlayManager - High-performance transparent overlay WebContentsView
 * Provides a layer above all tabs for popups, tooltips, and floating UI
 *
 * Performance optimizations:
 * - Preloaded HTML template with dynamic content injection
 * - Batched IPC operations with command queue
 * - Efficient content updates without full re-renders
 * - Memory-conscious resource management
 */

import { WebContentsView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { createLogger } from "@vibe/shared-types";
import { EventEmitter } from "events";

const logger = createLogger("OverlayManager");

export interface OverlayContent {
  html: string;
  css?: string;
  script?: string;
  visible?: boolean;
  priority?: "low" | "normal" | "high" | "critical";
  type?: string;
}

export interface OverlayCommand {
  type: "show" | "hide" | "render" | "update" | "clear" | "execute";
  data?: any;
  id?: string;
}

export interface OverlayOptions {
  enableCache?: boolean;
  maxCacheSize?: number;
  batchDelay?: number;
}

export class OverlayManager extends EventEmitter {
  private static instances: Map<number, OverlayManager> = new Map();
  private static handlersRegistered = false;

  private window: BrowserWindow;
  private overlayView: WebContentsView | null = null;
  private isInitialized: boolean = false;
  private isVisible: boolean = false;
  private commandQueue: OverlayCommand[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private contentCache = new Map<string, OverlayContent>();
  private readonly options: Required<OverlayOptions>;
  private currentContent: OverlayContent | null = null;
  private currentPriority: "low" | "normal" | "high" | "critical" = "normal";

  constructor(window: BrowserWindow, options: OverlayOptions = {}) {
    super();
    this.window = window;
    this.options = {
      enableCache: options.enableCache ?? true,
      maxCacheSize: options.maxCacheSize ?? 50,
      batchDelay: options.batchDelay ?? 1, // Ultra-fast response for clicks
    };

    // Register this instance
    OverlayManager.instances.set(window.id, this);

    // Register IPC handlers only once, globally
    if (!OverlayManager.handlersRegistered) {
      OverlayManager.registerGlobalHandlers();
      OverlayManager.handlersRegistered = true;
    }
  }

  /**
   * Initialize the overlay view with enhanced security and performance optimizations
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info(
      "Initializing high-performance overlay manager with enhanced security",
    );

    // Create transparent overlay view with enhanced security
    this.overlayView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true, // Enable sandbox for security
        transparent: true,
        webSecurity: true,
        preload: path.join(__dirname, "../preload/index.js"),
        // Performance optimizations
        offscreen: false,
        backgroundThrottling: false,
        // Additional security measures
        disableBlinkFeatures: "AutomationControlled",
        spellcheck: false,
      },
    });

    // Set transparent background
    this.overlayView.setBackgroundColor("#00000000");

    // Load safe overlay HTML with built-in security
    const safeHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Overlay</title>
        <meta http-equiv="Content-Security-Policy" content="default-src 'self' 'unsafe-inline'; script-src 'self'; style-src 'self' 'unsafe-inline';">
        <style>
          body { 
            margin: 0; 
            padding: 0; 
            overflow: hidden; 
            background: theme('colors.transparent');
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
          #vibe-overlay-container { 
            position: fixed; 
            top: 0; 
            left: 0; 
            width: 100vw; 
            height: 100vh; 
            pointer-events: none; 
            z-index: 2147483647; 
            display: block;
            visibility: visible;
            opacity: 1;
          }
          .vibe-overlay-interactive { pointer-events: auto; }
          .vibe-overlay-error {
            position: fixed;
            top: 10px;
            right: 10px;
            background: theme('colors.red.500');
            color: theme('colors.white');
            padding: 8px 12px;
            border-radius: 4px;
            font-size: 12px;
            z-index: 2147483648;
            pointer-events: auto;
          }
        </style>
      </head>
      <body>
        <div id="vibe-overlay-container"></div>
        <div id="vibe-overlay-error" class="vibe-overlay-error" style="display: none;"></div>
        <script>
          // Safe initialization without script injection
          (function() {
            'use strict';
            
            // Report health status
            if (window.electronAPI && window.electronAPI.overlay) {
              window.electronAPI.overlay.send('overlay:health-check', { 
                status: 'ready',
                timestamp: Date.now()
              });
            }
            
            // Safe event delegation with error handling
            function safeEventHandling() {
              try {
                // Click debouncing for better performance
                let lastClickTime = 0;
                const CLICK_DEBOUNCE_MS = 100;
                
                // Click handling with debouncing
                document.addEventListener('click', function(e) {
                  try {
                    const now = Date.now();
                    if (now - lastClickTime < CLICK_DEBOUNCE_MS) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    lastClickTime = now;
                    
                    const target = e.target;
                    
                    // Handle delete button clicks with improved targeting
                    const deleteButton = target.closest('[data-delete-id]') || (target.dataset && target.dataset.deleteId ? target : null);
                    if (deleteButton && deleteButton.dataset && deleteButton.dataset.deleteId) {
                      e.preventDefault();
                      e.stopPropagation();
                      console.log('Delete button clicked for ID:', deleteButton.dataset.deleteId);
                      if (window.electronAPI && window.electronAPI.overlay) {
                        // Immediately provide visual feedback
                        deleteButton.style.color = theme('colors.red.500');
                        deleteButton.style.transform = 'scale(1.2)';
                        
                        window.electronAPI.overlay.send('omnibox:delete-history', deleteButton.dataset.deleteId);
                      }
                      return;
                    }
                    
                    // Handle suggestion clicks
                    if (target && target.dataset && target.dataset.suggestionId) {
                      if (window.electronAPI && window.electronAPI.overlay) {
                        // Immediately provide visual feedback
                        target.style.backgroundColor = theme('colors.blue.200');
                        
                        window.electronAPI.overlay.send('omnibox:suggestion-clicked', {
                          id: target.dataset.suggestionId,
                          index: parseInt(target.dataset.suggestionIndex) || 0,
                          type: target.dataset.suggestionType,
                          url: target.dataset.suggestionUrl,
                          text: target.dataset.suggestionText
                        });
                      }
                    }
                  } catch (error) {
                    reportError('click-handler', error);
                  }
                });
                
                // Keyboard handling
                document.addEventListener('keydown', function(e) {
                  try {
                    if (e.key === 'Escape') {
                      if (window.electronAPI && window.electronAPI.overlay) {
                        window.electronAPI.overlay.send('omnibox:escape-dropdown');
                      }
                    }
                  } catch (error) {
                    reportError('keyboard-handler', error);
                  }
                });
                
              } catch (error) {
                reportError('event-setup', error);
              }
            }
            
            // Error reporting function
            function reportError(type, error) {
              console.error('Overlay error:', type, error);
              
              // Show visual error indicator
              const errorDiv = document.getElementById('vibe-overlay-error');
              if (errorDiv) {
                errorDiv.textContent = 'Overlay Error: ' + type;
                errorDiv.style.display = 'block';
                setTimeout(() => {
                  errorDiv.style.display = 'none';
                }, 5000);
              }
              
              // Send to main process
              if (window.electronAPI && window.electronAPI.overlay) {
                window.electronAPI.overlay.send('overlay:error', { 
                  type: type, 
                  error: error.message || error.toString(),
                  timestamp: Date.now()
                });
              }
            }
            
            // Initialize safe event handling
            safeEventHandling();
            
          })();
        </script>
      </body>
      </html>
    `;

    // Load the safe HTML
    await this.overlayView.webContents.loadURL(
      `data:text/html,${encodeURIComponent(safeHtml)}`,
    );

    // Set initial bounds to cover entire window
    const { width, height } = this.window.getContentBounds();
    this.overlayView.setBounds({ x: 0, y: 0, width, height });

    // Add to window
    this.window.contentView.addChildView(this.overlayView);

    // Initially hide overlay
    this.overlayView.setVisible(false);
    this.isVisible = false;

    // Forward IPC messages from overlay to main window
    this.setupOverlayIpcForwarding();

    // Handle window resize with debouncing
    let resizeTimer: NodeJS.Timeout | null = null;
    this.window.on("resize", () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => this.updateBounds(), 100);
    });

    // Setup performance monitoring
    this.setupPerformanceMonitoring();

    this.isInitialized = true;
    logger.info(
      "High-performance overlay manager initialized with enhanced security",
    );
  }

  /**
   * Setup IPC forwarding from overlay to main window
   */
  private setupOverlayIpcForwarding(): void {
    if (!this.overlayView) return;

    // Forward omnibox events from overlay to main window
    this.overlayView.webContents.ipc.on(
      "omnibox:suggestion-clicked",
      (_event, suggestion) => {
        logger.debug("Forwarding suggestion click from overlay:", suggestion);
        this.window.webContents.send("omnibox:suggestion-clicked", suggestion);
      },
    );

    this.overlayView.webContents.ipc.on("omnibox:escape-dropdown", () => {
      logger.debug("Forwarding escape dropdown from overlay");
      this.window.webContents.send("omnibox:escape-dropdown");
    });

    this.overlayView.webContents.ipc.on(
      "omnibox:delete-history",
      (_event, suggestionId) => {
        logger.debug("Forwarding delete history from overlay:", suggestionId);
        this.window.webContents.send("omnibox:delete-history", suggestionId);
      },
    );

    this.overlayView.webContents.ipc.on(
      "omnibox:navigate-and-close",
      (_event, url) => {
        logger.debug("Navigating and closing overlay:", url);
        this.window.webContents.send("omnibox:navigate-and-close", url);
      },
    );

    // Add error reporting from overlay
    this.overlayView.webContents.ipc.on("overlay:error", (_event, error) => {
      logger.error("Overlay error reported:", error);
      this.emit("overlay-error", error);
    });

    // Add health check from overlay
    this.overlayView.webContents.ipc.on(
      "overlay:health-check",
      (_event, status) => {
        logger.debug("Overlay health check:", status);
        this.emit("overlay-health", status);
      },
    );
  }

  /**
   * Setup performance monitoring with error prevention
   */
  private setupPerformanceMonitoring(): void {
    if (!this.overlayView) return;

    // Monitor render performance
    this.overlayView.webContents.on("did-finish-load", () => {
      this.overlayView?.webContents.executeJavaScript(`
        // Setup performance observer with error prevention
        if (window.PerformanceObserver) {
          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            entries.forEach(entry => {
              if (entry.duration > 16) { // Longer than one frame at 60fps
                console.warn('Slow overlay operation:', entry.name, entry.duration + 'ms');
              }
            });
          });
          observer.observe({ entryTypes: ['measure', 'navigation'] });
        }

        // Setup error monitoring
        window.addEventListener('error', function(event) {
          console.error('Overlay error caught:', event.error);
          if (window.electronAPI && window.electronAPI.overlay) {
            window.electronAPI.overlay.send('overlay:error', {
              type: 'uncaught-error',
              error: event.error?.message || event.message,
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno
            });
          }
        });

        // Setup unhandled promise rejection monitoring
        window.addEventListener('unhandledrejection', function(event) {
          console.error('Overlay unhandled promise rejection:', event.reason);
          if (window.electronAPI && window.electronAPI.overlay) {
            window.electronAPI.overlay.send('overlay:error', {
              type: 'unhandled-rejection',
              error: event.reason?.message || event.reason?.toString() || 'Unknown promise rejection'
            });
          }
        });

        // Monitor for suspicious script execution
        const originalEval = window.eval;
        const originalFunction = window.Function;
        const originalSetTimeout = window.setTimeout;
        const originalSetInterval = window.setInterval;

        let scriptExecutionCount = 0;
        const MAX_SCRIPT_EXECUTIONS = 100;

        window.eval = function(...args) {
          scriptExecutionCount++;
          if (scriptExecutionCount > MAX_SCRIPT_EXECUTIONS) {
            throw new Error('Too many eval() calls detected - possible infinite loop');
          }
          return originalEval.apply(this, args);
        };

        window.Function = function(...args) {
          scriptExecutionCount++;
          if (scriptExecutionCount > MAX_SCRIPT_EXECUTIONS) {
            throw new Error('Too many Function() calls detected - possible infinite loop');
          }
          return originalFunction.apply(this, args);
        };

        window.setTimeout = function(fn, delay, ...args) {
          if (typeof fn === 'string') {
            console.warn('String-based setTimeout detected - potential security risk');
            if (window.electronAPI && window.electronAPI.overlay) {
              window.electronAPI.overlay.send('overlay:error', {
                type: 'string-setTimeout',
                error: 'String-based setTimeout detected'
              });
            }
            return;
          }
          return originalSetTimeout(fn, delay, ...args);
        };

        window.setInterval = function(fn, delay, ...args) {
          if (typeof fn === 'string') {
            console.warn('String-based setInterval detected - potential security risk');
            if (window.electronAPI && window.electronAPI.overlay) {
              window.electronAPI.overlay.send('overlay:error', {
                type: 'string-setInterval',
                error: 'String-based setInterval detected'
              });
            }
            return;
          }
          return originalSetInterval(fn, delay, ...args);
        };

        // Reset counter periodically
        setInterval(() => {
          scriptExecutionCount = 0;
        }, 5000);
      `);
    });

    // Monitor for process errors
    this.overlayView.webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription) => {
        logger.error("Overlay failed to load:", errorCode, errorDescription);
        this.emit("overlay-load-failed", { errorCode, errorDescription });
      },
    );
  }

  /**
   * Queue a command for batched execution, with immediate processing for critical content
   */
  private queueCommand(command: OverlayCommand): void {
    // Check if this is critical priority content that should bypass batching
    const isCritical = command.data?.priority === "critical";

    if (isCritical) {
      // Process critical content immediately for ultra-fast response
      logger.debug(
        `Processing critical overlay command immediately: ${command.type}`,
      );
      this.processCriticalCommand(command);
      return;
    }

    this.commandQueue.push(command);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.processBatch();
      }, this.options.batchDelay);
    }
  }

  /**
   * Process critical commands immediately without batching
   */
  private async processCriticalCommand(command: OverlayCommand): Promise<void> {
    switch (command.type) {
      case "show":
      case "hide":
        await this.executeVisibilityCommand(command);
        break;
      case "render":
      case "update":
        await this.executeRenderCommand(command.data);
        break;
      case "clear":
        await this.executeClearCommand();
        break;
      case "execute":
        await this.executeScriptCommand(command.data);
        break;
    }
  }

  /**
   * Process batched commands efficiently
   */
  private async processBatch(): Promise<void> {
    if (this.commandQueue.length === 0) return;

    const commands = [...this.commandQueue];
    this.commandQueue = [];
    this.batchTimer = null;

    // Group commands by type for efficient processing
    const grouped = commands.reduce(
      (acc, cmd) => {
        if (!acc[cmd.type]) acc[cmd.type] = [];
        acc[cmd.type].push(cmd);
        return acc;
      },
      {} as Record<string, OverlayCommand[]>,
    );

    // Process each group
    for (const [type, cmds] of Object.entries(grouped)) {
      switch (type) {
        case "show":
        case "hide": {
          // Take the last visibility command
          const lastVisibility = cmds[cmds.length - 1];
          await this.executeVisibilityCommand(lastVisibility);
          break;
        }
        case "render":
        case "update": {
          // Merge all render/update commands
          const mergedContent = this.mergeContentCommands(cmds);
          await this.executeRenderCommand(mergedContent);
          break;
        }
        case "clear":
          await this.executeClearCommand();
          break;
        case "execute":
          // Execute scripts in order
          for (const cmd of cmds) {
            await this.executeScriptCommand(cmd.data);
          }
          break;
      }
    }
  }

  /**
   * Merge multiple content commands into one
   */
  private mergeContentCommands(commands: OverlayCommand[]): OverlayContent {
    return commands.reduce((merged, cmd) => {
      if (cmd.data) {
        return { ...merged, ...cmd.data };
      }
      return merged;
    }, {} as OverlayContent);
  }

  /**
   * Execute visibility command
   */
  private async executeVisibilityCommand(
    command: OverlayCommand,
  ): Promise<void> {
    if (!this.overlayView) return;

    const shouldShow = command.type === "show";
    if (this.isVisible !== shouldShow) {
      if (shouldShow) {
        // Show overlay and ensure it's on top
        this.bringToFront();
        this.overlayView.setVisible(true);
        this.isVisible = true;

        // Also make the content visible via JavaScript
        await this.overlayView.webContents.executeJavaScript(`
          (function() {
            const container = document.getElementById('vibe-overlay-container');
            if (container) {
              container.style.display = 'block';
              container.style.visibility = 'visible';
              container.style.opacity = '1';
            }
          })();
        `);
      } else {
        // Hide overlay
        this.overlayView.setVisible(false);
        this.isVisible = false;

        // Also hide the content via JavaScript
        await this.overlayView.webContents.executeJavaScript(`
          (function() {
            const container = document.getElementById('vibe-overlay-container');
            if (container) {
              container.style.display = 'none';
              container.style.visibility = 'hidden';
              container.style.opacity = '0';
            }
          })();
        `);
      }
      this.emit("visibility-changed", shouldShow);
    }
  }

  /**
   * Execute render command with caching and priority system
   */
  private async executeRenderCommand(content: OverlayContent): Promise<void> {
    if (!this.overlayView) return;

    // Set default priority if not specified
    const contentPriority = content.priority || "normal";
    const contentType = content.type || "unknown";

    // Priority order: critical > high > normal > low
    const priorityOrder = { low: 0, normal: 1, high: 2, critical: 3 };

    // Check if this content should override current content
    if (priorityOrder[contentPriority] < priorityOrder[this.currentPriority]) {
      logger.debug(
        `Ignoring overlay content with lower priority: ${contentPriority} < ${this.currentPriority} (type: ${contentType})`,
      );
      return;
    }

    logger.debug(
      `Rendering overlay content: priority=${contentPriority}, type=${contentType}`,
    );

    // Skip cache for critical content (autocomplete) - it changes too frequently
    const skipCache = contentPriority === "critical";

    // Check cache only for non-critical content
    const cacheKey = this.generateCacheKey(content);
    if (
      !skipCache &&
      this.options.enableCache &&
      this.contentCache.has(cacheKey)
    ) {
      logger.debug("Using cached overlay content");
      content = this.contentCache.get(cacheKey)!;
    }

    // Update current content and priority
    this.currentContent = content;
    this.currentPriority = contentPriority;

    try {
      // Update HTML content safely
      if (content.html) {
        await this.overlayView.webContents.executeJavaScript(`
          (function() {
            try {
              const container = document.getElementById('vibe-overlay-container');
              if (container) {
                container.innerHTML = ${JSON.stringify(content.html)};
              }
            } catch (error) {
              console.error('Overlay HTML update error:', error);
            }
          })();
        `);
      }

      // Update CSS content safely
      if (content.css) {
        await this.overlayView.webContents.executeJavaScript(`
          (function() {
            try {
              const cssId = 'vibe-overlay-custom-css';
              let style = document.getElementById(cssId);
              if (!style) {
                style = document.createElement('style');
                style.id = cssId;
                document.head.appendChild(style);
              }
              style.textContent = ${JSON.stringify(content.css)};
            } catch (error) {
              console.error('Overlay CSS update error:', error);
            }
          })();
        `);
      }

      // Execute script content safely
      if (content.script) {
        await this.executeScriptCommand(content.script);
      }

      // Handle visibility
      if (content.visible !== undefined) {
        await this.executeVisibilityCommand({
          type: content.visible ? "show" : "hide",
        });
      }

      // Update cache only for non-critical content
      if (!skipCache && this.options.enableCache) {
        this.contentCache.set(cacheKey, content);
        this.pruneCache();
      }
    } catch (error) {
      logger.error("Failed to execute render command:", error);
    }
  }

  /**
   * Execute clear command
   */
  private async executeClearCommand(): Promise<void> {
    if (!this.overlayView) return;

    try {
      await this.overlayView.webContents.executeJavaScript(`
        (function() {
          try {
            const container = document.getElementById('vibe-overlay-container');
            if (container) container.innerHTML = '';
            const customCss = document.getElementById('vibe-overlay-custom-css');
            if (customCss) customCss.remove();
          } catch (error) {
            console.error('Overlay clear error:', error);
          }
        })();
      `);

      this.currentContent = null;
      this.currentPriority = "normal"; // Reset priority when clearing
      await this.executeVisibilityCommand({ type: "hide" });
    } catch (error) {
      logger.error("Failed to execute clear command:", error);
    }
  }

  /**
   * Execute script command with comprehensive safety measures
   */
  private async executeScriptCommand(script: string): Promise<any> {
    if (!this.overlayView) return null;

    // Validate script before execution
    if (!this.isScriptSafe(script)) {
      logger.error(
        "Script validation failed - potentially unsafe script detected",
      );
      return null;
    }

    try {
      // Set a timeout for script execution to prevent hanging
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Script execution timeout")), 5000);
      });

      // Wrap script in a comprehensive safety context
      const safeScript = `
        (function() {
          'use strict';
          
          // Disable potentially dangerous operations
          const originalEval = window.eval;
          const originalFunction = window.Function;
          const originalSetTimeout = window.setTimeout;
          const originalSetInterval = window.setInterval;
          
          try {
            // Override dangerous functions
            window.eval = function() { throw new Error('eval() is disabled for security'); };
            window.Function = function() { throw new Error('Function() constructor is disabled for security'); };
            
            // Limit setTimeout/setInterval to prevent infinite loops
            let timeoutCount = 0;
            const MAX_TIMEOUTS = 10;
            
            window.setTimeout = function(fn, delay) {
              if (++timeoutCount > MAX_TIMEOUTS) {
                throw new Error('Too many timeouts - possible infinite loop');
              }
              return originalSetTimeout(fn, Math.min(delay || 0, 10000)); // Max 10 second delay
            };
            
            window.setInterval = function(fn, delay) {
              if (++timeoutCount > MAX_TIMEOUTS) {
                throw new Error('Too many intervals - possible infinite loop');
              }
              return originalSetInterval(fn, Math.min(delay || 0, 10000)); // Max 10 second delay
            };
            
            // Execute the actual script
            ${script}
            
          } catch (error) {
            console.error('Overlay script execution error:', error);
            return { error: error.message, stack: error.stack };
          } finally {
            // Restore original functions
            window.eval = originalEval;
            window.Function = originalFunction;
            window.setTimeout = originalSetTimeout;
            window.setInterval = originalSetInterval;
          }
        })();
      `;

      const executionPromise =
        this.overlayView.webContents.executeJavaScript(safeScript);

      // Race between timeout and execution
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Check if script returned an error
      if (result && typeof result === "object" && result.error) {
        logger.error("Script execution returned error:", result.error);
        return null;
      }

      return result;
    } catch (error) {
      logger.error("Failed to execute script command:", error);
      return null;
    }
  }

  /**
   * Validate script safety before execution
   */
  private isScriptSafe(script: string): boolean {
    if (!script || typeof script !== "string") {
      return false;
    }

    // Check for potentially dangerous patterns (but allow legitimate function definitions)
    const dangerousPatterns = [
      /eval\s*\(/i,
      /new\s+Function/i, // Block Function constructor but allow function declarations
      /document\.write/i,
      /document\.writeln/i,
      /innerHTML\s*=\s*['"`]/i,
      /outerHTML\s*=\s*['"`]/i,
      /script\s*>/i,
      /<script/i,
      /javascript:/i,
      /data:text\/html/i,
      /vbscript:/i,
      /on\w+\s*=/i, // Event handlers
      /setTimeout\s*\(\s*['"`]/i, // String-based setTimeout
      /setInterval\s*\(\s*['"`]/i, // String-based setInterval
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(script)) {
        logger.warn(
          "Potentially unsafe script pattern detected:",
          pattern.source,
        );
        return false;
      }
    }

    // Check script length to prevent overly complex scripts
    if (script.length > 10000) {
      logger.warn("Script too long - potential performance issue");
      return false;
    }

    return true;
  }

  /**
   * Generate cache key for content
   */
  private generateCacheKey(content: OverlayContent): string {
    return `${content.html?.slice(0, 100)}-${content.css?.slice(0, 50)}`;
  }

  /**
   * Prune cache to maintain size limit
   */
  private pruneCache(): void {
    if (this.contentCache.size > this.options.maxCacheSize) {
      const toDelete = this.contentCache.size - this.options.maxCacheSize;
      const keys = Array.from(this.contentCache.keys());
      for (let i = 0; i < toDelete; i++) {
        this.contentCache.delete(keys[i]);
      }
    }
  }

  /**
   * Setup IPC handlers for overlay commands (static registration)
   */
  private static registerGlobalHandlers(): void {
    // Batched show handler
    ipcMain.handle("overlay:show", async event => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return false;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager) return false;

      manager.queueCommand({ type: "show" });
      return true;
    });

    // Batched hide handler
    ipcMain.handle("overlay:hide", async event => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return false;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager) return false;

      manager.queueCommand({ type: "hide" });
      return true;
    });

    // Batched render handler
    ipcMain.handle("overlay:render", async (event, content: OverlayContent) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return false;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager) return false;

      manager.queueCommand({ type: "render", data: content });
      return true;
    });

    // Batched clear handler
    ipcMain.handle("overlay:clear", async event => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return false;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager) return false;

      manager.queueCommand({ type: "clear" });
      return true;
    });

    // Batched update handler
    ipcMain.handle(
      "overlay:update",
      async (event, updates: Partial<OverlayContent>) => {
        const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
        if (!windowId) return false;

        const manager = OverlayManager.instances.get(windowId);
        if (!manager) return false;

        manager.queueCommand({ type: "update", data: updates });
        return true;
      },
    );

    // Direct execute handler (not batched for immediate response)
    ipcMain.handle("overlay:execute", async (event, script: string) => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return null;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager || !manager.overlayView) return null;

      return await manager.overlayView.webContents.executeJavaScript(script);
    });

    // Get current state
    ipcMain.handle("overlay:getState", async event => {
      const windowId = BrowserWindow.fromWebContents(event.sender)?.id;
      if (!windowId) return null;

      const manager = OverlayManager.instances.get(windowId);
      if (!manager) return null;

      return {
        isVisible: manager.isVisible,
        hasContent: manager.currentContent !== null,
        cacheSize: manager.contentCache.size,
      };
    });
  }

  /**
   * Update overlay bounds to match window
   */
  private updateBounds(): void {
    if (!this.overlayView) return;

    const { width, height } = this.window.getContentBounds();
    this.overlayView.setBounds({ x: 0, y: 0, width, height });
  }

  /**
   * Ensure overlay is on top of all other views (optimized)
   */
  public bringToFront(): void {
    if (!this.overlayView || !this.window.contentView) return;

    // Always ensure overlay is the topmost view
    this.window.contentView.removeChildView(this.overlayView);
    this.window.contentView.addChildView(this.overlayView);

    // Update bounds to match window
    this.updateBounds();

    // Ensure visibility
    this.overlayView.setVisible(true);
    this.isVisible = true;

    logger.debug("Overlay brought to front and made visible");
  }

  /**
   * Get the overlay view
   */
  public getOverlayView(): WebContentsView | null {
    return this.overlayView;
  }

  /**
   * Check if overlay is visible
   */
  public isOverlayVisible(): boolean {
    return this.isVisible;
  }

  /**
   * Get current overlay content
   */
  public getCurrentContent(): OverlayContent | null {
    return this.currentContent;
  }

  /**
   * Clear cache
   */
  public clearCache(): void {
    this.contentCache.clear();
    logger.info("Overlay cache cleared");
  }

  /**
   * Get performance statistics
   */
  public async getPerformanceStats(): Promise<any> {
    if (!this.overlayView) return null;

    return await this.overlayView.webContents.executeJavaScript(`
      (function() {
        const entries = performance.getEntriesByType('measure')
          .filter(e => e.name.includes('overlay'));
        return {
          renderCount: entries.length,
          averageRenderTime: entries.reduce((sum, e) => sum + e.duration, 0) / entries.length,
          slowRenders: entries.filter(e => e.duration > 16).length
        };
      })();
    `);
  }

  /**
   * Destroy the overlay manager
   */
  public destroy(): void {
    // Clear timers
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Clear cache
    this.contentCache.clear();

    // Destroy overlay view
    if (this.overlayView) {
      if (!this.window.isDestroyed()) {
        this.window.contentView.removeChildView(this.overlayView);
      }

      if (!this.overlayView.webContents.isDestroyed()) {
        // @ts-expect-error - destroy method exists
        this.overlayView.webContents.destroy();
      }

      this.overlayView = null;
    }

    // Remove this instance from the static map
    OverlayManager.instances.delete(this.window.id);

    // Note: We don't remove IPC handlers here anymore since they're global
    // and might still be needed by other windows. They'll be cleaned up
    // when the app closes.

    // Remove all event listeners
    this.removeAllListeners();

    logger.info("Overlay manager destroyed");
  }
}
