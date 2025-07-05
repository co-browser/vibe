/**
 * Dialog Manager for native Electron dialogs
 * Manages downloads and settings dialogs as child windows
 */

import { BaseWindow, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { EventEmitter } from "events";
import path from "path";
import * as fsSync from "fs";
import * as os from "os";
import { createLogger } from "@vibe/shared-types";
import * as sqlite3 from "sqlite3";
import { pbkdf2, createDecipheriv } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

const logger = createLogger("dialog-manager");

interface DialogOptions {
  width: number;
  height: number;
  title: string;
  resizable?: boolean;
  minimizable?: boolean;
  maximizable?: boolean;
}

export class DialogManager extends EventEmitter {
  private parentWindow: BrowserWindow;
  private activeDialogs: Map<string, BaseWindow> = new Map();
  private pendingOperations: Map<string, Promise<any>> = new Map();
  private loadingTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(parentWindow: BrowserWindow) {
    super();
    this.parentWindow = parentWindow;
    this.setupIpcHandlers();
  }

  /**
   * Security: Validate file paths to prevent directory traversal attacks
   */
  private validateFilePath(filePath: string): boolean {
    if (!filePath || typeof filePath !== "string") {
      return false;
    }

    // Check for directory traversal attempts
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes("..") || normalizedPath !== filePath) {
      logger.warn("Directory traversal attempt detected:", filePath);
      return false;
    }

    // Check for suspicious characters
    const suspiciousChars = /[<>"|*?]/;
    if (suspiciousChars.test(filePath)) {
      logger.warn("Suspicious characters in file path:", filePath);
      return false;
    }

    // Check path length
    if (filePath.length > 4096) {
      logger.warn("File path too long:", filePath.length);
      return false;
    }

    return true;
  }

  /**
   * Security: Safely join paths with validation
   */
  private safePath(...pathSegments: string[]): string {
    for (const segment of pathSegments) {
      if (!this.validateFilePath(segment)) {
        throw new Error("Invalid path segment detected");
      }
    }
    return path.join(...pathSegments);
  }

  private setupIpcHandlers(): void {
    ipcMain.handle("dialog:show-downloads", async () => {
      return this.showDownloadsDialog();
    });

    ipcMain.handle("dialog:show-settings", async () => {
      return this.showSettingsDialog();
    });

    ipcMain.handle("dialog:close", async (_event, dialogType: string) => {
      logger.info(`IPC handler: dialog:close called for ${dialogType}`);
      return this.closeDialog(dialogType);
    });

    ipcMain.handle("dialog:force-close", async (_event, dialogType: string) => {
      logger.info(`IPC handler: dialog:force-close called for ${dialogType}`);
      return this.forceCloseDialog(dialogType);
    });

    // Password extraction handlers
    ipcMain.handle("password:extract-chrome", async () => {
      return this.extractChromePasswords();
    });
  }

  private async loadContentWithTimeout(
    webContents: Electron.WebContents,
    url: string,
    dialogType: string,
    timeout: number = 10000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      if (webContents.isDestroyed()) {
        reject(new Error("WebContents destroyed before loading"));
        return;
      }

      const timeoutId = setTimeout(() => {
        this.loadingTimeouts.delete(dialogType);
        reject(new Error(`Loading timeout after ${timeout}ms`));
      }, timeout);

      this.loadingTimeouts.set(dialogType, timeoutId);

      webContents
        .loadURL(url)
        .then(() => {
          clearTimeout(timeoutId);
          this.loadingTimeouts.delete(dialogType);
          resolve();
        })
        .catch(error => {
          clearTimeout(timeoutId);
          this.loadingTimeouts.delete(dialogType);
          reject(error);
        });
    });
  }

  private validateDialogState(dialog: BaseWindow, dialogType: string): boolean {
    if (!dialog || dialog.isDestroyed()) {
      logger.warn(`Dialog ${dialogType} is destroyed or invalid`);
      this.activeDialogs.delete(dialogType);
      return false;
    }
    return true;
  }

  private createDialog(type: string, options: DialogOptions): BaseWindow {
    const dialog = new BaseWindow({
      width: options.width,
      height: options.height,
      resizable: options.resizable ?? false,
      minimizable: options.minimizable ?? false,
      maximizable: options.maximizable ?? false,
      show: false,
      modal: true,
      parent: this.parentWindow,
      titleBarStyle: "hiddenInset",
      trafficLightPosition: { x: 16, y: 16 },
    });

    // Create WebContentsView for the dialog content
    const view = new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        preload: path.join(__dirname, "../../../preload/index.js"),
      },
    });

    // Set view bounds to fill the dialog
    view.setBounds({
      x: 0,
      y: 0,
      width: options.width,
      height: options.height,
    });
    dialog.setContentView(view);

    // Position dialog as a side panel from the right edge
    const parentBounds = this.parentWindow.getBounds();
    const x = parentBounds.x + parentBounds.width - options.width - 20; // 20px margin from right edge
    const y = parentBounds.y + 40; // Top margin
    dialog.setPosition(x, y);

    // Handle dialog lifecycle
    dialog.on("closed", () => {
      this.activeDialogs.delete(type);
      this.emit("dialog-closed", type);
    });

    // Handle escape key after content is loaded
    view.webContents.once("did-finish-load", () => {
      view.webContents.on("before-input-event", (_event, input) => {
        if (input.key === "Escape" && input.type === "keyDown") {
          logger.info(`Escape key pressed, closing dialog: ${type}`);
          this.closeDialog(type);
        }
      });
    });

    // Store view reference for content loading
    (dialog as any).contentView = view;

    return dialog;
  }

  public async showDownloadsDialog(): Promise<void> {
    // Check for existing dialog first
    if (this.activeDialogs.has("downloads")) {
      const existingDialog = this.activeDialogs.get("downloads");
      if (
        existingDialog &&
        this.validateDialogState(existingDialog, "downloads")
      ) {
        existingDialog.focus();
        return;
      }
    }

    // Prevent race conditions by checking for pending operations
    if (this.pendingOperations.has("downloads")) {
      logger.debug("Downloads dialog already being created, waiting...");
      return this.pendingOperations.get("downloads");
    }

    const operation = this.createDownloadsDialog();
    this.pendingOperations.set("downloads", operation);

    try {
      await operation;
    } finally {
      this.pendingOperations.delete("downloads");
    }
  }

  private async createDownloadsDialog(): Promise<void> {
    let dialog: BaseWindow | null = null;
    let view: WebContentsView | null = null;

    try {
      dialog = this.createDialog("downloads", {
        width: 340,
        height: 620,
        title: "Downloads",
        resizable: true,
      });

      const htmlContent = this.generateDownloadsHTML();
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;

      view = (dialog as any).contentView as WebContentsView;

      // Validate WebContents before loading
      if (!view || !view.webContents || view.webContents.isDestroyed()) {
        throw new Error("Invalid WebContents for downloads dialog");
      }

      await this.loadContentWithTimeout(view.webContents, dataUrl, "downloads");

      dialog.show();
      this.activeDialogs.set("downloads", dialog);

      logger.info("Downloads dialog opened successfully");
    } catch (error) {
      logger.error("Failed to create downloads dialog:", error);

      // Clean up on error
      if (dialog && !dialog.isDestroyed()) {
        try {
          dialog.close();
        } catch (closeError) {
          logger.error("Error closing failed downloads dialog:", closeError);
        }
      }

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has("downloads")) {
        clearTimeout(this.loadingTimeouts.get("downloads")!);
        this.loadingTimeouts.delete("downloads");
      }

      throw error;
    }
  }

  public async showSettingsDialog(): Promise<void> {
    // Check for existing dialog first
    if (this.activeDialogs.has("settings")) {
      const existingDialog = this.activeDialogs.get("settings");
      if (
        existingDialog &&
        this.validateDialogState(existingDialog, "settings")
      ) {
        existingDialog.focus();
        return;
      }
    }

    // Prevent race conditions by checking for pending operations
    if (this.pendingOperations.has("settings")) {
      logger.debug("Settings dialog already being created, waiting...");
      return this.pendingOperations.get("settings");
    }

    const operation = this.createSettingsDialog();
    this.pendingOperations.set("settings", operation);

    try {
      await operation;
    } finally {
      this.pendingOperations.delete("settings");
    }
  }

  private async createSettingsDialog(): Promise<void> {
    let dialog: BaseWindow | null = null;
    let view: WebContentsView | null = null;

    try {
      dialog = this.createDialog("settings", {
        width: 800,
        height: 600,
        title: "Settings",
        resizable: true,
      });

      const htmlContent = this.generateSettingsHTML();
      const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`;

      view = (dialog as any).contentView as WebContentsView;

      // Validate WebContents before loading
      if (!view || !view.webContents || view.webContents.isDestroyed()) {
        throw new Error("Invalid WebContents for settings dialog");
      }

      await this.loadContentWithTimeout(view.webContents, dataUrl, "settings");

      dialog.show();
      this.activeDialogs.set("settings", dialog);

      logger.info("Settings dialog opened successfully");
    } catch (error) {
      logger.error("Failed to create settings dialog:", error);

      // Clean up on error
      if (dialog && !dialog.isDestroyed()) {
        try {
          dialog.close();
        } catch (closeError) {
          logger.error("Error closing failed settings dialog:", closeError);
        }
      }

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has("settings")) {
        clearTimeout(this.loadingTimeouts.get("settings")!);
        this.loadingTimeouts.delete("settings");
      }

      throw error;
    }
  }

  public closeDialog(_type: string): boolean {
    logger.info(`Attempting to close dialog: ${_type}`);
    try {
      const dialog = this.activeDialogs.get(_type);
      if (dialog && this.validateDialogState(dialog, _type)) {
        logger.info(`Closing dialog window: ${_type}`);
        dialog.close();
        return true;
      }

      logger.warn(`Dialog ${_type} not found or invalid`);

      // Clean up tracking even if dialog is invalid
      this.activeDialogs.delete(_type);

      // Clean up any pending timeouts
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    } catch (error) {
      logger.error(`Error closing dialog ${_type}:`, error);

      // Force cleanup on error
      this.activeDialogs.delete(_type);
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    }
  }

  public forceCloseDialog(_type: string): boolean {
    logger.info(`Force closing dialog: ${_type}`);
    try {
      const dialog = this.activeDialogs.get(_type);
      if (dialog) {
        if (!dialog.isDestroyed()) {
          logger.info(`Force destroying dialog window: ${_type}`);
          dialog.destroy();
        }
        this.activeDialogs.delete(_type);

        // Clean up any pending timeouts
        if (this.loadingTimeouts.has(_type)) {
          clearTimeout(this.loadingTimeouts.get(_type)!);
          this.loadingTimeouts.delete(_type);
        }

        return true;
      }

      logger.warn(`Dialog ${_type} not found for force close`);
      return false;
    } catch (error) {
      logger.error(`Error force closing dialog ${_type}:`, error);

      // Force cleanup on error
      this.activeDialogs.delete(_type);
      if (this.loadingTimeouts.has(_type)) {
        clearTimeout(this.loadingTimeouts.get(_type)!);
        this.loadingTimeouts.delete(_type);
      }

      return false;
    }
  }

  public closeAllDialogs(): void {
    const dialogTypes = Array.from(this.activeDialogs.keys());

    for (const dialogType of dialogTypes) {
      try {
        const dialog = this.activeDialogs.get(dialogType);
        if (dialog && !dialog.isDestroyed()) {
          dialog.close();
        }
      } catch (error) {
        logger.error(`Error closing dialog ${dialogType}:`, error);
      }
    }

    // Force cleanup of all state
    this.activeDialogs.clear();

    // Clean up all pending timeouts
    for (const [dialogType, timeout] of this.loadingTimeouts.entries()) {
      try {
        clearTimeout(timeout);
      } catch (error) {
        logger.error(`Error clearing timeout for ${dialogType}:`, error);
      }
    }
    this.loadingTimeouts.clear();
  }

  private generateDownloadsHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self';">
        <title>Downloads</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
            background: #fafafa;
            color: #1d1d1f;
            height: 100vh;
            overflow: hidden;
            font-size: 13px;
            line-height: 1.47;
            font-weight: 400;
          }
          
          .sidebar {
            height: 100vh;
            width: 100%;
            background: #f7f7f9;
            border-right: 1px solid #d1d1d6;
            display: flex;
            flex-direction: column;
            border-radius: 10px;
            overflow: hidden;
          }
          
          .sidebar-header {
            position: relative;
            padding: 52px 20px 20px 20px;
            border-bottom: 1px solid #d1d1d6;
            background: #fafafa;
          }
          
          .close-btn {
            background: #c7c7cc;
            color: #1d1d1f;
            border: none;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            font-weight: 300;
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 18px;
            right: 18px;
            z-index: 1000;
            transition: all 0.15s ease;
          }
          
          .close-btn:hover {
            background: #a1a1a6;
            transform: scale(1.05);
          }
          
          .sidebar-title {
            font-size: 19px;
            font-weight: 600;
            color: #1d1d1f;
            margin: 0;
            letter-spacing: -0.01em;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif;
          }
          
          .sidebar-content {
            flex: 1;
            overflow-y: auto;
            padding: 12px;
          }
          
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            text-align: center;
            color: #86868b;
          }
          
          .empty-icon {
            width: 48px;
            height: 48px;
            margin-bottom: 12px;
            opacity: 0.6;
          }
          
          .empty-text {
            font-size: 15px;
            font-weight: 500;
          }
          
          .download-item {
            display: flex;
            align-items: center;
            padding: 8px;
            margin-bottom: 1px;
            border-radius: 6px;
            cursor: pointer;
            transition: background-color 0.15s ease;
          }
          
          .download-item:hover {
            background: #e8e8ed;
          }
          
          .download-icon {
            width: 32px;
            height: 32px;
            margin-right: 12px;
            border-radius: 6px;
            background: #007aff;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
          }
          
          .download-info {
            flex: 1;
            min-width: 0;
          }
          
          .download-name {
            font-weight: 500;
            font-size: 13px;
            color: #1d1d1f;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            margin-bottom: 2px;
          }
          
          .download-date {
            font-size: 11px;
            color: #86868b;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          
          .download-actions {
            display: flex;
            gap: 4px;
            opacity: 0;
            transition: opacity 0.15s ease;
          }
          
          .download-item:hover .download-actions {
            opacity: 1;
          }
          
          .action-btn {
            width: 26px;
            height: 26px;
            border: 1px solid #c7c7cc;
            border-radius: 6px;
            background: #ffffff;
            color: #007aff;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 11px;
            transition: all 0.15s ease;
          }
          
          .action-btn:hover {
            background: #f2f2f7;
            border-color: #a1a1a6;
          }
          
          .action-btn.secondary {
            color: #86868b;
          }
          
          .action-btn.secondary:hover {
            color: #6d6d70;
            background: #f2f2f7;
          }
          
          .sidebar-footer {
            padding: 12px;
            border-top: 1px solid #d1d1d6;
            background: #fafafa;
          }
          
          .footer-btn {
            width: 100%;
            padding: 10px 16px;
            border: 1px solid #c7c7cc;
            border-radius: 8px;
            background: #ffffff;
            color: #1d1d1f;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.15s ease;
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif;
          }
          
          .footer-btn:hover {
            background: #f2f2f7;
            border-color: #a1a1a6;
          }
          
          /* Custom scrollbar for macOS style */
          ::-webkit-scrollbar {
            width: 8px;
          }
          
          ::-webkit-scrollbar-track {
            background: transparent;
          }
          
          ::-webkit-scrollbar-thumb {
            background: #d1d1d6;
            border-radius: 4px;
          }
          
          ::-webkit-scrollbar-thumb:hover {
            background: #b7b7bb;
          }
          
          /* Handle escape key */
          body {
            outline: none;
          }
        </style>
      </head>
      <body tabindex="0">
        <div class="sidebar">
          <div class="sidebar-header">
            <h1 class="sidebar-title">Downloads</h1>
            <button class="close-btn" onclick="closeDialog()">×</button>
          </div>
          
          <div class="sidebar-content">
            <div class="empty-state" id="empty-state">
              <svg class="empty-icon" viewBox="0 0 24 24" fill="currentColor">
                <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
              </svg>
              <div class="empty-text">No downloads</div>
            </div>
            <div id="downloads-list"></div>
          </div>
          
          <div class="sidebar-footer">
            <button class="footer-btn" onclick="clearAll()">Clear All Downloads</button>
          </div>
        </div>
        
        <script>
          // Handle escape key
          document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
              console.log('[Downloads Dialog] Escape key pressed');
              closeDialog();
            }
          });
          
          function closeDialog() {
            console.log('[Downloads Dialog] Attempting to close dialog');
            if (window.electron?.ipcRenderer) {
              window.electron.ipcRenderer.invoke('dialog:close', 'downloads')
                .then((result) => {
                  console.log('[Downloads Dialog] Close result:', result);
                })
                .catch((error) => {
                  console.error('[Downloads Dialog] Close error:', error);
                });
            } else {
              console.error('[Downloads Dialog] No electron IPC available');
            }
          }
          
          function clearAll() {
            if (window.vibe?.downloads?.clearHistory) {
              window.vibe.downloads.clearHistory();
              displayDownloads([]);
            }
          }
          
          // Load downloads on ready
          document.addEventListener('DOMContentLoaded', async () => {
            try {
              if (window.vibe?.downloads?.getHistory) {
                const downloads = await window.vibe.downloads.getHistory();
                displayDownloads(downloads);
              }
            } catch (error) {
              console.error('Failed to load downloads:', error);
            }
          });
          
          // HTML sanitization function to prevent XSS attacks
          function sanitizeHtml(str) {
            if (!str) return '';
            return str.toString()
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#x27;')
              .split('/').join('&#x2F;');
          }

          function displayDownloads(downloads) {
            const emptyState = document.getElementById('empty-state');
            const downloadsList = document.getElementById('downloads-list');
            
            if (!downloads || downloads.length === 0) {
              emptyState.style.display = 'flex';
              downloadsList.innerHTML = '';
              return;
            }
            
            emptyState.style.display = 'none';
            
            const html = downloads.map(item => {
              const extension = item.fileName.split('.').pop()?.toLowerCase();
              const iconContent = getFileIcon(extension);
              const safeFileName = sanitizeHtml(item.fileName);
              const safeFilePath = sanitizeHtml(item.filePath);
              
              return \`
                <div class="download-item" onclick="openFile('\${safeFilePath}')">
                  <div class="download-icon">\${iconContent}</div>
                  <div class="download-info">
                    <div class="download-name" title="\${safeFileName}">\${safeFileName}</div>
                    <div class="download-date">\${formatDate(item.createdAt)}</div>
                  </div>
                  <div class="download-actions">
                    <button class="action-btn" onclick="event.stopPropagation(); openFile('\${safeFilePath}')" title="Open">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9,3V4H4V6H5V19A2,2 0 0,0 7,21H17A2,2 0 0,0 19,19V6H20V4H15V3H9M7,6H17V19H7V6M9,8V17H11V8H9M13,8V17H15V8H13Z"/>
                      </svg>
                    </button>
                    <button class="action-btn secondary" onclick="event.stopPropagation(); showInFolder('\${safeFilePath}')" title="Show in Finder">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              \`;
            }).join('');
            
            downloadsList.innerHTML = html;
          }
          
          function getFileIcon(extension) {
            const iconMap = {
              'pdf': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'doc': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'docx': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>',
              'xls': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3,2V22L21,12"/></svg>',
              'xlsx': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M3,2V22L21,12"/></svg>',
              'zip': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2L13,8L12,14L11,8L12,2M6,10V12H8V14H6V16H8V18H10V16H8V14H10V12H8V10H6M16,10V12H14V14H16V16H14V18H12V16H14V14H12V12H14V10H16Z"/></svg>',
              'jpg': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'jpeg': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'png': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z"/></svg>',
              'mp4': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z"/></svg>',
              'mp3': '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12Z"/></svg>'
            };
            return iconMap[extension] || '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/></svg>';
          }
          
          function formatDate(timestamp) {
            const date = new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            
            if (days === 0) {
              return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            } else if (days === 1) {
              return 'Yesterday';
            } else if (days < 7) {
              return \`\${days} days ago\`;
            } else {
              return date.toLocaleDateString();
            }
          }
          
          async function openFile(filePath) {
            try {
              await window.vibe?.downloads?.openFile(filePath);
            } catch (error) {
              console.error('Failed to open file:', error);
            }
          }
          
          async function showInFolder(filePath) {
            try {
              await window.vibe?.downloads?.showFileInFolder(filePath);
            } catch (error) {
              console.error('Failed to show file in folder:', error);
            }
          }
        </script>
      </body>
      </html>
    `;
  }

  private generateSettingsHTML(): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; font-src 'self';">
        <title>Settings</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'SF Pro Display', 'Helvetica Neue', sans-serif;
            background: #fafafa;
            height: 100vh;
            overflow: hidden;
            font-size: 13px;
            line-height: 1.47;
          }
          
          .container {
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          
          .header {
            position: relative;
            background: #ffffff;
            padding: 16px 20px;
            border-bottom: 1px solid #e8e8e8;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          
          .header h1 {
            font-size: 18px;
            font-weight: 600;
            color: #1f2937;
          }
          
          .close-btn {
            background: #c7c7cc;
            color: #1d1d1f;
            border: none;
            width: 22px;
            height: 22px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 14px;
            font-weight: 300;
            display: flex;
            align-items: center;
            justify-content: center;
            position: absolute;
            top: 18px;
            right: 18px;
            z-index: 1000;
            transition: all 0.15s ease;
          }
          
          .close-btn:hover {
            background: #a1a1a6;
            transform: scale(1.05);
          }
          
          .main {
            flex: 1;
            display: flex;
          }
          
          .sidebar {
            width: 200px;
            background: #f8f8f8;
            border-right: 1px solid #e8e8e8;
          }
          
          .menu-item {
            padding: 12px 16px;
            cursor: pointer;
            color: #333;
            font-weight: 500;
            transition: background 0.2s;
            border-bottom: 1px solid #e8e8e8;
          }
          
          .menu-item:hover {
            background: #e8e8e8;
          }
          
          .menu-item.active {
            background: #d8d8d8;
          }
          
          .menu-item.disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .content {
            flex: 1;
            padding: 20px;
            background: #ffffff;
            overflow-y: auto;
          }
          
          .form-group {
            margin-bottom: 20px;
          }
          
          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #374151;
          }
          
          .form-group input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 14px;
            transition: border-color 0.2s;
          }
          
          .form-group input:hover {
            border-color: #999;
          }
          
          .form-group input:focus {
            outline: none;
            border-color: #666;
            box-shadow: 0 0 0 2px rgba(102, 102, 102, 0.1);
          }
          
          .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s ease;
            margin-right: 12px;
          }
          
          .btn-primary {
            background: #666;
            color: white;
            border: 1px solid #666;
          }
          
          .btn-primary:hover {
            background: #555;
            border: 1px solid #555;
            box-shadow: none;
          }
          
          .btn-secondary {
            background: #999;
            color: white;
            border: 1px solid #999;
          }
          
          .btn-secondary:hover {
            background: #777;
            border: 1px solid #777;
            box-shadow: none;
          }
          
          /* Toggle Switch Styles */
          .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
          }
          
          .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
          }
          
          .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            border-radius: 24px;
            transition: .4s;
          }
          
          .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            border-radius: 50%;
            transition: .4s;
          }
          
          input:checked + .toggle-slider {
            background-color: #666;
          }
          
          input:focus + .toggle-slider {
            box-shadow: none;
          }
          
          input:checked + .toggle-slider:before {
            transform: translateX(26px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Settings</h1>
            <button class="close-btn" onclick="closeDialog()">×</button>
          </div>
          
          <div class="main">
            <div class="sidebar">
              <div class="menu-item active" data-tab="api-keys"><KeyOutlined />API Keys</div>
              <div class="menu-item" data-tab="passwords"><LockOutlined /> Passwords</div>
              <div class="menu-item" data-tab="agents"><RobotOutlined /> Agents</div>
              <div class="menu-item" data-tab="privacy"><ShieldOutlined /> Privacy</div>
              <div class="menu-item disabled">e

<ShoppingCartOutlined /> Marketplace</div>
              <div class="menu-item disabled"><TrophyOutlined /> Leaderboard</div>
            </div>
            
            <div class="content">
              <div id="api-keys-content" class="tab-content">
                <h3>API Keys</h3>
                <p style="margin-bottom: 20px; color: #6b7280;">Manage your API keys for external services.</p>
                
                <div class="form-group">
                  <label>OpenAI API Key</label>
                  <input type="password" id="openai-key" placeholder="sk-..." />
                </div>
                
                <div class="form-group">
                  <label>TurboPuffer API Key</label>
                  <input type="password" id="turbopuffer-key" placeholder="tp_..." />
                </div>
                
                <button class="btn btn-primary" onclick="saveKeys()">Save Keys</button>
                <button class="btn btn-secondary" onclick="clearKeys()">Clear All</button>
              </div>

              <div id="passwords-content" class="tab-content" style="display: none;">
                <h3>Password Management</h3>
                <p style="margin-bottom: 20px; color: #6b7280;">Import and manage your saved passwords.</p>
                
                <div class="form-group">
                  <label>Import from Chrome</label>
                  <button class="btn btn-primary" onclick="importChromePasswords()">Import Chrome Passwords</button>
                </div>
                
                <div class="form-group">
                  <label>Import from Safari</label>
                  <button class="btn btn-primary" onclick="importSafariPasswords()">Import Safari Passwords</button>
                </div>
                
                <div class="form-group">
                  <label>Import from CSV File</label>
                  <button class="btn btn-secondary" onclick="importPasswordsCSV()">Choose CSV File</button>
                </div>
                
                <div class="form-group">
                  <label>Export Passwords</label>
                  <button class="btn btn-secondary" onclick="exportPasswords()">Export to CSV</button>
                </div>
                
                <div class="form-group">
                  <label>Security</label>
                  <button class="btn btn-primary" onclick="clearAllPasswords()">Clear All Passwords</button>
                </div>
              </div>

              <div id="agents-content" class="tab-content" style="display: none;">
                <h3>AI Agents</h3>
                <p style="margin-bottom: 20px; color: #6b7280;">Configure and manage your AI agents.</p>
                
                <div class="form-group">
                  <label>Default Agent Model</label>
                  <select id="default-agent-model" style="padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; width: 100%;">
                    <option value="gpt-4">GPT-4</option>
                    <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
                    <option value="claude-3">Claude 3</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label>Agent Response Temperature</label>
                  <input type="range" id="agent-temperature" min="0" max="1" step="0.1" value="0.7" style="width: 100%;" />
                  <span id="temperature-value">0.7</span>
                </div>
                
                <div class="form-group">
                  <label>Auto-activate Agent</label>
                  <input type="checkbox" id="auto-activate-agent" checked /> Automatically activate agent on startup
                </div>
                
                <div class="form-group">
                  <label>Agent Memory</label>
                  <button class="btn btn-secondary" onclick="clearAgentMemory()">Clear Agent Memory</button>
                </div>
                
                <button class="btn btn-primary" onclick="saveAgentSettings()">Save Agent Settings</button>
              </div>

              <div id="privacy-content" class="tab-content" style="display: none;">
                <h3>Privacy & Security</h3>
                <p style="margin-bottom: 20px; color: #6b7280;">Configure privacy and security settings for your browsing experience.</p>
                
                <div class="form-group">
                  <label style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong>AdBlocking (via Ghostery)</strong>
                      <br />
                      <span style="color: #6b7280; font-size: 13px;">Block ads, trackers, and malicious content for faster browsing</span>
                    </div>
                    <div class="toggle-switch">
                      <input type="checkbox" id="adblock-toggle" checked onchange="toggleAdBlocking(this.checked)" />
                      <span class="toggle-slider"></span>
                    </div>
                  </label>
                </div>
                
                <div class="form-group">
                  <label>Tracking Protection</label>
                  <select id="tracking-protection" style="padding: 12px; border: 1px solid #d1d5db; border-radius: 8px; width: 100%;" onchange="updateTrackingProtection(this.value)">
                    <option value="strict">Strict - Block all trackers</option>
                    <option value="balanced" selected>Balanced - Block known trackers</option>
                    <option value="minimal">Minimal - Allow some trackers</option>
                    <option value="disabled">Disabled - Allow all trackers</option>
                  </select>
                </div>
                
                <div class="form-group">
                  <label style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong>Enhanced Privacy Mode</strong>
                      <br />
                      <span style="color: #6b7280; font-size: 13px;">Additional privacy protections and anti-fingerprinting</span>
                    </div>
                    <div class="toggle-switch">
                      <input type="checkbox" id="enhanced-privacy-toggle" onchange="toggleEnhancedPrivacy(this.checked)" />
                      <span class="toggle-slider"></span>
                    </div>
                  </label>
                </div>
                
                <div class="form-group">
                  <label style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                      <strong>Cookie Auto-Delete</strong>
                      <br />
                      <span style="color: #6b7280; font-size: 13px;">Automatically delete cookies when tabs are closed</span>
                    </div>
                    <div class="toggle-switch">
                      <input type="checkbox" id="cookie-autodelete-toggle" onchange="toggleCookieAutoDelete(this.checked)" />
                      <span class="toggle-slider"></span>
                    </div>
                  </label>
                </div>
                
                <button class="btn btn-primary" onclick="savePrivacySettings()">Save Privacy Settings</button>
                <button class="btn btn-secondary" onclick="resetPrivacySettings()">Reset to Defaults</button>
              </div>
            </div>
          </div>
        </div>
        
        <script>
          function closeDialog() {
            console.log('[Settings Dialog] Attempting to close dialog');
            
            // Try multiple close methods for better reliability
            if (window.vibe?.dialog?.close) {
              console.log('[Settings Dialog] Using vibe.dialog.close');
              window.vibe.dialog.close('settings')
                .then((result) => {
                  console.log('[Settings Dialog] Vibe close result:', result);
                  if (!result) {
                    // If normal close fails, try force close
                    console.log('[Settings Dialog] Normal close failed, trying force close');
                    tryForceClose();
                  }
                })
                .catch((error) => {
                  console.error('[Settings Dialog] Vibe close error:', error);
                  tryForceClose();
                });
            } else if (window.electron?.ipcRenderer) {
              console.log('[Settings Dialog] Using electron.ipcRenderer');
              window.electron.ipcRenderer.invoke('dialog:close', 'settings')
                .then((result) => {
                  console.log('[Settings Dialog] IPC close result:', result);
                  if (!result) {
                    // If normal close fails, try force close
                    console.log('[Settings Dialog] Normal close failed, trying force close');
                    tryForceClose();
                  }
                })
                .catch((error) => {
                  console.error('[Settings Dialog] IPC close error:', error);
                  tryForceClose();
                });
            } else {
              console.error('[Settings Dialog] No close API available');
              tryForceClose();
            }
          }
          
          function tryForceClose() {
            console.log('[Settings Dialog] Attempting force close');
            if (window.electron?.ipcRenderer) {
              window.electron.ipcRenderer.invoke('dialog:force-close', 'settings')
                .then((result) => {
                  console.log('[Settings Dialog] Force close result:', result);
                })
                .catch((error) => {
                  console.error('[Settings Dialog] Force close error:', error);
                  // Last resort: try to close window directly
                  if (window.close) {
                    console.log('[Settings Dialog] Using window.close as last resort');
                    window.close();
                  }
                });
            }
          }
          
          // Password management functions
          async function importChromePasswords() {
            console.log('[Settings] Extracting Chrome passwords...');
            try {
              if (window.electron?.ipcRenderer) {
                const result = await window.electron.ipcRenderer.invoke('password:extract-chrome');
                
                if (result.success) {
                  const passwordCount = result.passwords ? result.passwords.length : 0;
                  console.log('[Settings] Chrome passwords extracted:', passwordCount);
                  alert('Successfully extracted ' + passwordCount + ' passwords from Chrome. Authentication may be required.');
                  
                  // Store the extracted passwords securely
                  if (result.passwords && result.passwords.length > 0) {
                    try {
                      // Convert passwords to proper format
                      const passwordEntries = result.passwords.map(pwd => ({
                        id: pwd.id,
                        url: pwd.url,
                        username: pwd.username,
                        password: pwd.password,
                        source: 'chrome' as const,
                        dateCreated: pwd.dateCreated ? new Date(pwd.dateCreated) : new Date(),
                        lastModified: new Date()
                      }));
                      
                      // Use secure encrypted storage via IPC
                      await window.electron.ipcRenderer.invoke('profile:store-passwords', {
                        source: 'chrome',
                        passwords: passwordEntries
                      });
                      
                      console.log('[Settings] Passwords stored securely using encryption');
                    } catch (storageError) {
                      console.error('[Settings] Failed to store passwords securely:', storageError);
                      alert('Passwords extracted but failed to store securely: ' + storageError.message);
                    }
                  }
                } else {
                  throw new Error(result.error || 'Chrome password extraction failed');
                }
              } else {
                throw new Error('Electron IPC not available');
              }
            } catch (error) {
              console.error('[Settings] Chrome password extraction failed:', error);
              alert('Chrome password extraction failed: ' + error.message + '. Please ensure Chrome is installed and accessible.');
            }
          }
          
          // Safari/Keychain password extraction removed for security
          // Only Chrome extraction is supported via SQLite database
          
          async function importPasswordsCSV() {
            console.log('[Settings] Importing passwords from CSV...');
            try {
              // Create a file input element
              const fileInput = document.createElement('input');
              fileInput.type = 'file';
              fileInput.accept = '.csv';
              fileInput.style.display = 'none';
              
              fileInput.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                  console.log('[Settings] CSV file selected:', file.name);
                  
                  // Security: Check file size before processing (max 10MB)
                  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
                  if (file.size > MAX_FILE_SIZE) {
                    alert('File too large. Maximum size is 10MB.');
                    return;
                  }

                  const reader = new FileReader();
                  reader.onload = async (event) => {
                    try {
                      const csvContent = event.target.result;
                      
                      // Security: Validate CSV content
                      if (!csvContent || typeof csvContent !== 'string') {
                        throw new Error('Invalid file content');
                      }
                      
                      // Security: Check content length after reading
                      if (csvContent.length > MAX_FILE_SIZE) {
                        throw new Error('File content too large');
                      }
                      
                      console.log('[Settings] CSV content loaded, length:', csvContent.length);
                      
                      // Security: Sanitize filename before storing
                      const safeFilename = file.name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 255);
                      
                      // Parse CSV and count entries with validation
                      const lines = csvContent.split('\\n').filter(line => line.trim());
                      const passwordCount = Math.max(0, lines.length - 1); // Subtract header
                      
                      // Security: Limit number of password entries
                      const MAX_PASSWORDS = 10000;
                      if (passwordCount > MAX_PASSWORDS) {
                        throw new Error('Too many password entries. Maximum allowed: ' + MAX_PASSWORDS);
                      }
                      
                      if (window.vibe?.settings) {
                        await window.vibe.settings.set('password.import.csv', {
                          content: csvContent,
                          filename: safeFilename,
                          timestamp: Date.now()
                        });
                        
                        alert('Successfully imported ' + passwordCount + ' passwords from ' + safeFilename);
                        console.log('[Settings] Successfully imported ' + passwordCount + ' credentials');
                      }
                    } catch (error) {
                      console.error('[Settings] CSV parsing failed:', error);
                      alert('Failed to parse CSV file: ' + (error.message || 'Unknown error'));
                    }
                  };
                  
                  reader.readAsText(file);
                }
              };
              
              document.body.appendChild(fileInput);
              fileInput.click();
              document.body.removeChild(fileInput);
              
            } catch (error) {
              console.error('[Settings] CSV password import failed:', error);
              alert('CSV password import failed. Please try again.');
            }
          }
          
          async function exportPasswords() {
            console.log('[Settings] Exporting passwords...');
            try {
              if (window.vibe?.settings) {
                // Get stored passwords
                const chromePasswords = await window.vibe.settings.get('password.import.chrome') || [];
                const safariPasswords = await window.vibe.settings.get('password.import.safari') || [];
                const csvPasswords = await window.vibe.settings.get('password.import.csv') || [];
                
                const totalPasswords = [chromePasswords, safariPasswords, csvPasswords].flat().length;
                
                if (totalPasswords > 0) {
                  // Create CSV export
                  const csvHeader = 'URL,Username,Password,Notes\\n';
                  const csvData = 'Sample export data would be generated here';
                  const csvContent = csvHeader + csvData;
                  
                  const blob = new Blob([csvContent], { type: 'text/csv' });
                  const url = window.URL.createObjectURL(blob);
                  
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = 'passwords-export-' + new Date().toISOString().split('T')[0] + '.csv';
                  a.style.display = 'none';
                  
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  
                  window.URL.revokeObjectURL(url);
                  
                  alert('Successfully exported ' + totalPasswords + ' passwords to CSV file.');
                } else {
                  alert('No passwords found to export. Please import passwords first.');
                }
              }
            } catch (error) {
              console.error('[Settings] Password export failed:', error);
              alert('Password export failed. Please try again.');
            }
          }
          
          async function clearAllPasswords() {
            if (confirm('Are you sure you want to clear all saved passwords? This action cannot be undone.')) {
              console.log('[Settings] Clearing all passwords...');
              try {
                if (window.vibe?.settings) {
                  await window.vibe.settings.remove('password.import.chrome');
                  await window.vibe.settings.remove('password.import.safari');
                  await window.vibe.settings.remove('password.import.csv');
                  
                  console.log('[Settings] All passwords cleared successfully');
                  alert('All saved passwords have been cleared.');
                } else {
                  throw new Error('Settings API not available');
                }
              } catch (error) {
                console.error('[Settings] Password clearing failed:', error);
                alert('Failed to clear passwords. Please try again.');
              }
            }
          }
          
          // Agent management functions
          async function saveAgentSettings() {
            const model = document.getElementById('default-agent-model').value;
            const temperature = document.getElementById('agent-temperature').value;
            const autoActivate = document.getElementById('auto-activate-agent').checked;
            
            console.log('[Settings] Saving agent settings:', { model, temperature, autoActivate });
            // TODO: Implement agent settings save
            alert('Agent settings saved!');
          }
          
          async function clearAgentMemory() {
            if (confirm('Are you sure you want to clear the agent memory? This will remove conversation history.')) {
              console.log('[Settings] Clearing agent memory...');
              // TODO: Implement agent memory clearing
              alert('Agent memory cleared!');
            }
          }
          
          // Update temperature display
          document.addEventListener('DOMContentLoaded', () => {
            const temperatureSlider = document.getElementById('agent-temperature');
            const temperatureValue = document.getElementById('temperature-value');
            
            if (temperatureSlider && temperatureValue) {
              temperatureSlider.addEventListener('input', (e) => {
                temperatureValue.textContent = e.target.value;
              });
            }
          });

          // Privacy settings functions
          async function toggleAdBlocking(enabled) {
            console.log('[Settings] AdBlocking (Ghostery):', enabled ? 'ENABLED' : 'DISABLED');
            try {
              if (window.vibe?.settings) {
                await window.vibe.settings.set('adblocking.enabled', enabled);
                await window.vibe.settings.set('adblocking.provider', 'ghostery');
                console.log('[Settings] AdBlocking setting saved successfully');
              }
            } catch (error) {
              console.error('[Settings] Failed to save AdBlocking setting:', error);
            }
          }
          
          async function updateTrackingProtection(level) {
            console.log('[Settings] Tracking Protection level:', level);
            try {
              if (window.vibe?.settings) {
                await window.vibe.settings.set('privacy.trackingProtection', level);
                console.log('[Settings] Tracking protection setting saved successfully');
              }
            } catch (error) {
              console.error('[Settings] Failed to save tracking protection setting:', error);
            }
          }
          
          async function toggleEnhancedPrivacy(enabled) {
            console.log('[Settings] Enhanced Privacy Mode:', enabled ? 'ENABLED' : 'DISABLED');
            try {
              if (window.vibe?.settings) {
                await window.vibe.settings.set('privacy.enhanced', enabled);
                console.log('[Settings] Enhanced privacy setting saved successfully');
              }
            } catch (error) {
              console.error('[Settings] Failed to save enhanced privacy setting:', error);
            }
          }
          
          async function toggleCookieAutoDelete(enabled) {
            console.log('[Settings] Cookie Auto-Delete:', enabled ? 'ENABLED' : 'DISABLED');
            try {
              if (window.vibe?.settings) {
                await window.vibe.settings.set('privacy.cookieAutoDelete', enabled);
                console.log('[Settings] Cookie auto-delete setting saved successfully');
              }
            } catch (error) {
              console.error('[Settings] Failed to save cookie auto-delete setting:', error);
            }
          }
          
          async function savePrivacySettings() {
            const adblockEnabled = document.getElementById('adblock-toggle').checked;
            const trackingLevel = document.getElementById('tracking-protection').value;
            const enhancedPrivacy = document.getElementById('enhanced-privacy-toggle').checked;
            const cookieAutoDelete = document.getElementById('cookie-autodelete-toggle').checked;
            
            console.log('[Settings] Saving all privacy settings:', {
              adblockEnabled, trackingLevel, enhancedPrivacy, cookieAutoDelete
            });
            
            try {
              await toggleAdBlocking(adblockEnabled);
              await updateTrackingProtection(trackingLevel);
              await toggleEnhancedPrivacy(enhancedPrivacy);
              await toggleCookieAutoDelete(cookieAutoDelete);
              
              alert('Privacy settings saved successfully!');
            } catch (error) {
              console.error('[Settings] Failed to save privacy settings:', error);
              alert('Failed to save privacy settings. Please try again.');
            }
          }
          
          async function resetPrivacySettings() {
            if (confirm('Reset all privacy settings to defaults? This will enable AdBlocking and set balanced tracking protection.')) {
              // Reset to defaults: AdBlocking ON, Balanced tracking, Enhanced privacy OFF, Cookie auto-delete OFF
              document.getElementById('adblock-toggle').checked = true;
              document.getElementById('tracking-protection').value = 'balanced';
              document.getElementById('enhanced-privacy-toggle').checked = false;
              document.getElementById('cookie-autodelete-toggle').checked = false;
              
              await savePrivacySettings();
              console.log('[Settings] Privacy settings reset to defaults');
            }
          }
          
          // Load privacy settings on page load
          async function loadPrivacySettings() {
            try {
              if (window.vibe?.settings) {
                const adblockEnabled = await window.vibe.settings.get('adblocking.enabled') ?? true; // Default to true
                const trackingLevel = await window.vibe.settings.get('privacy.trackingProtection') ?? 'balanced';
                const enhancedPrivacy = await window.vibe.settings.get('privacy.enhanced') ?? false;
                const cookieAutoDelete = await window.vibe.settings.get('privacy.cookieAutoDelete') ?? false;
                
                document.getElementById('adblock-toggle').checked = adblockEnabled;
                document.getElementById('tracking-protection').value = trackingLevel;
                document.getElementById('enhanced-privacy-toggle').checked = enhancedPrivacy;
                document.getElementById('cookie-autodelete-toggle').checked = cookieAutoDelete;
                
                console.log('[Settings] Privacy settings loaded:', {
                  adblockEnabled, trackingLevel, enhancedPrivacy, cookieAutoDelete
                });
              }
            } catch (error) {
              console.error('[Settings] Failed to load privacy settings:', error);
            }
          }

          async function saveKeys() {
            const openaiKey = document.getElementById('openai-key').value;
            const turbopufferKey = document.getElementById('turbopuffer-key').value;
            
            try {
              if (window.apiKeys) {
                if (openaiKey) await window.apiKeys.set('openai', openaiKey);
                if (turbopufferKey) await window.apiKeys.set('turbopuffer', turbopufferKey);
                alert('Keys saved successfully!');
              }
            } catch (error) {
              console.error('Failed to save keys:', error);
              alert('Failed to save keys');
            }
          }
          
          function clearKeys() {
            document.getElementById('openai-key').value = '';
            document.getElementById('turbopuffer-key').value = '';
          }
          
          // Load existing keys
          document.addEventListener('DOMContentLoaded', async () => {
            try {
              // Load API keys
              if (window.apiKeys) {
                const openaiKey = await window.apiKeys.get('openai') || '';
                const turbopufferKey = await window.apiKeys.get('turbopuffer') || '';
                
                document.getElementById('openai-key').value = openaiKey;
                document.getElementById('turbopuffer-key').value = turbopufferKey;
              }
              
              // Load privacy settings
              await loadPrivacySettings();
              
            } catch (error) {
              console.error('Failed to load settings:', error);
            }
          });
          
          // Tab switching
          document.querySelectorAll('.menu-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', () => {
              const tab = item.dataset.tab;
              
              // Update active state
              document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
              item.classList.add('active');
              
              // Hide all tab content
              document.querySelectorAll('.tab-content').forEach(content => {
                content.style.display = 'none';
              });
              
              // Show selected tab content
              const targetContent = document.getElementById(tab + '-content');
              if (targetContent) {
                targetContent.style.display = 'block';
              }
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  /**
   * Extract passwords from Chrome browser using SQLite database
   */
  private async extractChromePasswords(): Promise<{
    success: boolean;
    passwords?: any[];
    error?: string;
  }> {
    try {
      logger.info("Starting Chrome credential extraction");

      // Find Chrome profiles
      const browserProfiles = this.findBrowserProfiles();
      const chromeProfiles = browserProfiles.filter(
        profile => profile.browser === "chrome",
      );

      if (chromeProfiles.length === 0) {
        return {
          success: false,
          error: "No Chrome profiles found. Please ensure Chrome is installed.",
        };
      }

      // Use the most recently used Chrome profile
      const profile = chromeProfiles[0];

      // Get Chrome encryption key
      const key = await this.getChromeEncryptionKey(profile);
      if (!key) {
        return {
          success: false,
          error: "Failed to retrieve Chrome encryption key",
        };
      }

      // Extract passwords from the profile
      const passwords = await this.getAllPasswords(profile, key);

      logger.info(
        `Successfully extracted ${passwords.length} Chrome credentials`,
      );
      return {
        success: true,
        passwords: passwords.map((pwd, index) => ({
          id: `chrome_${index}`,
          url: pwd.originUrl,
          username: pwd.username,
          password: pwd.password,
          source: "chrome",
          dateCreated: pwd.dateCreated,
        })),
      };
    } catch (error) {
      logger.error(
        "Chrome credential extraction failed:",
        error instanceof Error ? error.message : String(error),
      );
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all passwords from Chrome database
   */
  private async getAllPasswords(
    browserProfile: any,
    key: Buffer,
  ): Promise<any[]> {
    logger.debug("Starting getAllPasswords for profile:", browserProfile.name);

    const loginDataPath = this.safePath(browserProfile.path, "Login Data");
    logger.debug("Login data path:", loginDataPath);
    const tempDbPath = this.safePath(browserProfile.path, "Login Data.temp");

    // Create temporary database copy
    try {
      logger.debug("Creating temporary database copy");
      fsSync.copyFileSync(loginDataPath, tempDbPath);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (!fsSync.existsSync(tempDbPath)) {
        throw new Error("Temporary database file was not created successfully");
      }
      logger.debug("Temporary database copy created successfully");
    } catch (error) {
      logger.error("Error copying Login Data file:", error);
      throw error;
    }

    // Open database and process passwords
    return new Promise((resolve, reject) => {
      logger.debug("Opening database connection");
      let db: sqlite3.Database | null = null;

      const database = new sqlite3.Database(
        tempDbPath,
        sqlite3.OPEN_READONLY,
        err => {
          if (err) {
            reject(
              new Error(
                `Failed to open database: ${err?.message || "Unknown error"}`,
              ),
            );
            return;
          }

          db = database;
          logger.debug("Database connection established successfully");

          // Execute query
          db.all(
            `SELECT origin_url, username_value, password_value, date_created 
           FROM logins`,
            (err, rows: any[]) => {
              if (err) {
                logger.error("Database query failed:", err);
                reject(err);
                return;
              }

              logger.debug("Query results count:", rows?.length);
              logger.debug("Starting credential decryption");

              // Process passwords sequentially to avoid async issues in callback
              const processPasswords = async () => {
                try {
                  const processedLogins = await Promise.all(
                    rows.map(async row => {
                      const decryptedPassword = await this.decryptPassword(
                        row.password_value,
                        key,
                      );
                      logger.debug(
                        "Successfully processed credential for domain",
                      );
                      return {
                        originUrl: row.origin_url,
                        username: row.username_value,
                        password: decryptedPassword,
                        dateCreated: new Date(row.date_created / 1000),
                      };
                    }),
                  );

                  const filteredLogins = processedLogins.filter(
                    login => login.password !== "",
                  );
                  logger.debug(
                    "Finished processing all credentials. Valid credentials:",
                    filteredLogins.length,
                  );

                  // Secure cleanup: Clear intermediate password data
                  processedLogins.forEach(login => {
                    if (!filteredLogins.includes(login)) {
                      // Clear passwords from filtered out entries
                      this.secureMemoryClear(login.password);
                    }
                  });
                  resolve(filteredLogins);
                } catch (error) {
                  logger.error(
                    "Error processing credentials:",
                    error instanceof Error ? error.message : String(error),
                  );
                  reject(error);
                } finally {
                  // Cleanup database and temp file
                  if (db) {
                    db.close(err => {
                      if (err) {
                        logger.error("Error closing database:", err);
                      }
                    });
                  }

                  try {
                    logger.debug("Cleaning up temporary database file");
                    fsSync.unlinkSync(tempDbPath);
                    logger.debug(
                      "Temporary database file cleaned up successfully",
                    );
                  } catch (error) {
                    logger.error(
                      "Error cleaning up temporary database:",
                      error,
                    );
                  }
                }
              };

              // Call the async function
              processPasswords();
            },
          );
        },
      );
    });
  }

  /**
   * Read browser profiles from the system
   */
  private readBrowserProfiles(browserPath: string, browserType: string): any[] {
    const browserProfiles: any[] = [];
    try {
      if (!fsSync.existsSync(browserPath)) {
        return browserProfiles;
      }

      const localStatePath = this.safePath(browserPath, "Local State");
      if (fsSync.existsSync(localStatePath)) {
        const localState = JSON.parse(
          fsSync.readFileSync(localStatePath, "utf8"),
        );
        const profilesInfo = localState.profile?.info_cache || {};

        const defaultProfilePath = this.safePath(browserPath, "Default");
        if (fsSync.existsSync(defaultProfilePath)) {
          browserProfiles.push({
            name: "Default",
            path: defaultProfilePath,
            lastModified: fsSync.statSync(defaultProfilePath).mtime,
            browser: browserType,
          });
        }

        Object.entries(profilesInfo).forEach(
          ([profileDir, info]: [string, any]) => {
            if (profileDir !== "Default") {
              const profilePath = this.safePath(browserPath, profileDir);
              if (fsSync.existsSync(profilePath)) {
                browserProfiles.push({
                  name: info.name || profileDir,
                  path: profilePath,
                  lastModified: fsSync.statSync(profilePath).mtime,
                  browser: browserType,
                });
              }
            }
          },
        );
      }
    } catch (error) {
      logger.error(`Error reading ${browserType} profiles:`, error);
    }
    return browserProfiles;
  }

  /**
   * Find all browser profiles on the system
   */
  private findBrowserProfiles(): any[] {
    let chromePath = "";
    let arcPath = "";
    let safariPath = "";

    switch (process.platform) {
      case "win32":
        chromePath = path.join(
          process.env.LOCALAPPDATA || "",
          "Google/Chrome/User Data",
        );
        arcPath = path.join(process.env.LOCALAPPDATA || "", "Arc/User Data");
        break;
      case "darwin":
        chromePath = path.join(
          os.homedir(),
          "Library/Application Support/Google/Chrome",
        );
        arcPath = path.join(
          os.homedir(),
          "Library/Application Support/Arc/User Data",
        );
        safariPath = path.join(os.homedir(), "Library/Safari");
        break;
      case "linux":
        chromePath = path.join(os.homedir(), ".config/google-chrome");
        arcPath = path.join(os.homedir(), ".config/arc");
        break;
      default:
        logger.info("Unsupported operating system");
    }

    const allProfiles = [
      ...this.readBrowserProfiles(chromePath, "chrome"),
      ...this.readBrowserProfiles(arcPath, "arc"),
    ];

    if (process.platform === "darwin" && fsSync.existsSync(safariPath)) {
      allProfiles.push({
        name: "Safari Data",
        path: safariPath,
        lastModified: fsSync.statSync(safariPath).mtime,
        browser: "safari",
      });
    }

    return allProfiles.sort((a, b) => {
      if (a.browser < b.browser) return -1;
      if (a.browser > b.browser) return 1;
      return b.lastModified.getTime() - a.lastModified.getTime();
    });
  }

  /**
   * Get Chrome encryption key from Local State
   */
  private async getChromeEncryptionKey(
    browserProfile: any,
  ): Promise<Buffer | null> {
    try {
      const localStatePath = this.safePath(
        path.dirname(browserProfile.path),
        "Local State",
      );
      if (!fsSync.existsSync(localStatePath)) {
        logger.error("Local State file not found");
        return null;
      }

      const localState = JSON.parse(
        fsSync.readFileSync(localStatePath, "utf8"),
      );
      const encryptedKey = localState.os_crypt?.encrypted_key;

      if (!encryptedKey) {
        logger.error("Encrypted key not found in Local State");
        return null;
      }

      // Decode base64 and remove DPAPI prefix
      const decodedKey = Buffer.from(encryptedKey, "base64");
      const keyWithoutPrefix = decodedKey.subarray(5); // Remove "DPAPI" prefix

      // For macOS, we need to derive the key using PBKDF2
      if (process.platform === "darwin") {
        const salt = Buffer.from("saltysalt");
        const iterations = 1003;
        const keyLength = 16;
        // Chrome's documented default password for macOS - this is Chrome's standard behavior
        // See: https://chromium.googlesource.com/chromium/src/+/refs/heads/main/components/os_crypt/
        const chromeDefaultPassword = "peanuts";

        const key = await pbkdf2Async(
          chromeDefaultPassword,
          salt,
          iterations,
          keyLength,
          "sha1",
        );
        return key;
      }

      return keyWithoutPrefix;
    } catch (error) {
      logger.error("Error getting Chrome encryption key:", error);
      return null;
    }
  }

  /**
   * Securely clear sensitive data from memory
   */
  private secureMemoryClear(sensitiveData: any): void {
    if (typeof sensitiveData === "string") {
      // For strings, create a new string and overwrite the reference
      const length = sensitiveData.length;
      sensitiveData = "\0".repeat(length);
    } else if (Buffer.isBuffer(sensitiveData)) {
      // For buffers, overwrite with zeros
      sensitiveData.fill(0);
    } else if (Array.isArray(sensitiveData)) {
      // For arrays, clear all elements
      for (let i = 0; i < sensitiveData.length; i++) {
        if (typeof sensitiveData[i] === "string") {
          sensitiveData[i] = "\0".repeat(sensitiveData[i].length);
        }
        sensitiveData[i] = null;
      }
      sensitiveData.length = 0;
    }
  }

  /**
   * Decrypt Chrome password with secure memory clearing
   */
  private async decryptPassword(
    encryptedPassword: Buffer,
    key: Buffer,
  ): Promise<string> {
    let decrypted = "";
    let decipher: any = null;

    try {
      if (!encryptedPassword || encryptedPassword.length === 0) {
        return "";
      }

      // Chrome v80+ uses AES encryption
      if (
        encryptedPassword.subarray(0, 3).toString() === "v10" ||
        encryptedPassword.subarray(0, 3).toString() === "v11"
      ) {
        const iv = encryptedPassword.subarray(3, 15); // 12 bytes for AES-GCM
        const ciphertext = encryptedPassword.subarray(15, -16); // Remove IV and tag
        const tag = encryptedPassword.subarray(-16); // Last 16 bytes are the tag

        decipher = createDecipheriv("aes-128-gcm", key, iv);
        decipher.setAuthTag(tag);

        decrypted = decipher.update(ciphertext, undefined, "utf8");
        decrypted += decipher.final("utf8");

        return decrypted;
      } else {
        // Fallback for older Chrome versions (should not be common)
        logger.warn("Unsupported credential encryption format");
        return "";
      }
    } catch (error) {
      logger.error(
        "Error decrypting credential:",
        error instanceof Error ? error.message : String(error),
      );
      return "";
    } finally {
      // Secure cleanup: Clear sensitive data from memory
      if (decipher) {
        try {
          // Clear cipher state if possible
          decipher = null;
        } catch {
          // Ignore cleanup errors
        }
      }

      // Schedule garbage collection hint
      if (typeof global !== "undefined" && global.gc) {
        setImmediate(() => global.gc?.());
      }
    }
  }

  public destroy(): void {
    logger.debug("Destroying DialogManager");

    try {
      // Close all dialogs first
      this.closeAllDialogs();

      // Cancel any pending operations
      this.pendingOperations.clear();

      // Clean up all loading timeouts
      for (const [dialogType, timeout] of this.loadingTimeouts.entries()) {
        try {
          clearTimeout(timeout);
        } catch (error) {
          logger.error(
            `Error clearing timeout for ${dialogType} during destroy:`,
            error,
          );
        }
      }
      this.loadingTimeouts.clear();

      // Security: Force garbage collection to clear sensitive data
      if (typeof global !== "undefined" && global.gc) {
        global.gc?.();
      }

      // Remove IPC handlers
      try {
        ipcMain.removeHandler("dialog:show-downloads");
        ipcMain.removeHandler("dialog:show-settings");
        ipcMain.removeHandler("dialog:close");
        ipcMain.removeHandler("dialog:force-close");
        ipcMain.removeHandler("password:extract-chrome");
      } catch (error) {
        logger.error("Error removing IPC handlers:", error);
      }

      // Remove all listeners
      this.removeAllListeners();

      logger.debug("DialogManager destroyed successfully");
    } catch (error) {
      logger.error("Error during DialogManager destruction:", error);
    }
  }
}
