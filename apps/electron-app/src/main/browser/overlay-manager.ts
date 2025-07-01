/**
 * OverlayManager - Manages transparent overlay WebContentsView
 * Provides a layer above all tabs for popups, tooltips, and floating UI
 */

import { WebContentsView, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import { is } from "@electron-toolkit/utils";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("OverlayManager");

export interface OverlayContent {
  html: string;
  css?: string;
  script?: string;
  visible?: boolean;
}

export class OverlayManager {
  private window: BrowserWindow;
  private overlayView: WebContentsView | null = null;
  private isInitialized: boolean = false;

  constructor(window: BrowserWindow) {
    this.window = window;
    this.setupIpcHandlers();
  }

  /**
   * Initialize the overlay view
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info("Initializing overlay manager");

    // Create transparent overlay view
    this.overlayView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        transparent: true,
        webSecurity: true,
        preload: path.join(__dirname, "../preload/index.js"),
      },
    });

    // Set transparent background
    this.overlayView.setBackgroundColor("#00000000");

    // Load overlay HTML
    if (is.dev && process.env.ELECTRON_RENDERER_URL) {
      await this.overlayView.webContents.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/overlay.html`,
      );
    } else {
      await this.overlayView.webContents.loadFile(
        path.join(__dirname, "../renderer/overlay.html"),
      );
    }

    // Set initial bounds to cover entire window
    const { width, height } = this.window.getContentBounds();
    this.overlayView.setBounds({ x: 0, y: 0, width, height });

    // Add to window
    this.window.contentView.addChildView(this.overlayView);

    // Initially hide overlay
    this.overlayView.setVisible(false);

    // Forward IPC messages from overlay to main window
    this.setupOverlayIpcForwarding();

    // Handle window resize
    this.window.on("resize", () => this.updateBounds());

    this.isInitialized = true;
    logger.info("Overlay manager initialized");
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
  }

  /**
   * Setup IPC handlers for overlay commands
   */
  private setupIpcHandlers(): void {
    ipcMain.handle("overlay:show", async () => {
      if (this.overlayView) {
        this.overlayView.setVisible(true);
        this.bringToFront();
        return true;
      }
      return false;
    });

    ipcMain.handle("overlay:hide", async () => {
      if (this.overlayView) {
        this.overlayView.setVisible(false);
        return true;
      }
      return false;
    });

    ipcMain.handle(
      "overlay:render",
      async (_event, content: OverlayContent) => {
        if (!this.overlayView) return false;

        const script = `
        (function() {
          const container = document.getElementById('vibe-overlay-container');
          if (!container) return;
          
          // Set HTML content
          container.innerHTML = ${JSON.stringify(content.html || "")};
          
          // Add custom CSS if provided
          if (${JSON.stringify(content.css || "")}) {
            const style = document.createElement('style');
            style.textContent = ${JSON.stringify(content.css || "")};
            document.head.appendChild(style);
          }
          
          // Execute custom script if provided
          if (${JSON.stringify(content.script || "")}) {
            try {
              eval(${JSON.stringify(content.script || "")});
            } catch (error) {
              console.error('Overlay script error:', error);
            }
          }
          
          // Show/hide based on content
          if (${content.visible !== false}) {
            // Make overlay visible by calling the IPC directly
            if (window.electron && window.electron.ipcRenderer) {
              window.electron.ipcRenderer.invoke('overlay:show');
            }
          }
        })();
      `;

        await this.overlayView.webContents.executeJavaScript(script);
        return true;
      },
    );

    ipcMain.handle("overlay:clear", async () => {
      if (!this.overlayView) return false;

      const script = `
        const container = document.getElementById('vibe-overlay-container');
        if (container) container.innerHTML = '';
      `;

      await this.overlayView.webContents.executeJavaScript(script);
      this.overlayView.setVisible(false);
      return true;
    });

    ipcMain.handle(
      "overlay:update",
      async (_event, updates: Partial<OverlayContent>) => {
        if (!this.overlayView) return false;

        if (updates.html !== undefined) {
          await this.overlayView.webContents.executeJavaScript(`
          const container = document.getElementById('vibe-overlay-container');
          if (container) container.innerHTML = ${JSON.stringify(updates.html)};
        `);
        }

        if (updates.visible !== undefined) {
          this.overlayView.setVisible(updates.visible);
          if (updates.visible) {
            this.bringToFront();
          }
        }

        return true;
      },
    );

    ipcMain.handle("overlay:execute", async (_event, script: string) => {
      if (!this.overlayView) return null;
      return await this.overlayView.webContents.executeJavaScript(script);
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
   * Ensure overlay is on top of all other views
   */
  public bringToFront(): void {
    if (!this.overlayView || !this.window.contentView) return;

    // Remove and re-add to ensure it's on top
    this.window.contentView.removeChildView(this.overlayView);
    this.window.contentView.addChildView(this.overlayView);
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
  public isVisible(): boolean {
    // WebContentsView doesn't have isVisible method, track state internally
    return (
      this.overlayView !== null &&
      this.overlayView.webContents &&
      !this.overlayView.webContents.isDestroyed()
    );
  }

  /**
   * Destroy the overlay manager
   */
  public destroy(): void {
    if (this.overlayView) {
      this.window.contentView.removeChildView(this.overlayView);
      // @ts-expect-error - destroy method exists
      this.overlayView.webContents.destroy();
      this.overlayView = null;
    }

    // Remove IPC handlers
    ipcMain.removeHandler("overlay:show");
    ipcMain.removeHandler("overlay:hide");
    ipcMain.removeHandler("overlay:render");
    ipcMain.removeHandler("overlay:clear");
    ipcMain.removeHandler("overlay:update");
    ipcMain.removeHandler("overlay:execute");
  }
}
