/**
 * Dialog Manager for native Electron dialogs
 * Manages downloads and settings dialogs as child windows
 */

import { BaseWindow, BrowserWindow, ipcMain, WebContentsView } from "electron";
import { EventEmitter } from "events";
import path from "path";
import { createLogger } from "@vibe/shared-types";

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

  private setupIpcHandlers(): void {
    ipcMain.handle("dialog:show-downloads", async () => {
      return this.showDownloadsDialog();
    });

    ipcMain.handle("dialog:show-settings", async () => {
      return this.showSettingsDialog();
    });

    ipcMain.handle("dialog:close", async (_event, dialogType: string) => {
      return this.closeDialog(dialogType);
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

    // Center dialog on parent
    const parentBounds = this.parentWindow.getBounds();
    const x = Math.round(
      parentBounds.x + (parentBounds.width - options.width) / 2,
    );
    const y = Math.round(
      parentBounds.y + (parentBounds.height - options.height) / 2,
    );
    dialog.setPosition(x, y);

    // Handle dialog lifecycle
    dialog.on("closed", () => {
      this.activeDialogs.delete(type);
      this.emit("dialog-closed", type);
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
        width: 500,
        height: 400,
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
    try {
      const dialog = this.activeDialogs.get(_type);
      if (dialog && this.validateDialogState(dialog, _type)) {
        dialog.close();
        return true;
      }

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
        <title>Downloads</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            height: 100vh;
            overflow: hidden;
          }
          
          .container {
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          
          .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
            background: #ef4444;
            color: white;
            border: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          
          .content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
          }
          
          .empty-state {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 200px;
            color: #6b7280;
          }
          
          .empty-icon {
            font-size: 48px;
            margin-bottom: 16px;
          }
          
          .footer {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            padding: 16px 20px;
            border-top: 1px solid rgba(0, 0, 0, 0.1);
            display: flex;
            justify-content: flex-end;
            gap: 12px;
          }
          
          .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            cursor: pointer;
            transition: all 0.2s;
          }
          
          .btn-secondary {
            background: #f3f4f6;
            color: #374151;
          }
          
          .btn-secondary:hover {
            background: #e5e7eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Downloads</h1>
            <button class="close-btn" onclick="closeDialog()">&times;</button>
          </div>
          
          <div class="content">
            <div class="empty-state">
              <div class="empty-icon">📥</div>
              <div>No downloads found</div>
            </div>
          </div>
          
          <div class="footer">
            <button class="btn btn-secondary" onclick="clearAll()">Clear All</button>
            <button class="btn btn-secondary" onclick="closeDialog()">Close</button>
          </div>
        </div>
        
        <script>
          function closeDialog() {
            window.electron?.ipcRenderer.invoke('dialog:close', 'downloads');
          }
          
          function clearAll() {
            if (window.vibe?.downloads?.clearHistory) {
              window.vibe.downloads.clearHistory();
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
          
          function displayDownloads(downloads) {
            const content = document.querySelector('.content');
            if (!downloads || downloads.length === 0) {
              return; // Keep empty state
            }
            
            const html = downloads.map(item => \`
              <div class="download-item" style="
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px;
                background: rgba(255, 255, 255, 0.8);
                border-radius: 8px;
                margin-bottom: 8px;
                backdrop-filter: blur(10px);
              ">
                <div>
                  <div style="font-weight: 600; margin-bottom: 4px;">\${item.fileName}</div>
                  <div style="font-size: 12px; color: #6b7280;">\${new Date(item.createdAt).toLocaleString()}</div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button onclick="openFile('\${item.filePath}')" style="
                    background: #3b82f6;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                  ">Open</button>
                  <button onclick="showInFolder('\${item.filePath}')" style="
                    background: #6b7280;
                    color: white;
                    border: none;
                    padding: 4px 8px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                  ">Show</button>
                </div>
              </div>
            \`).join('');
            
            content.innerHTML = html;
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
        <title>Settings</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            height: 100vh;
            overflow: hidden;
          }
          
          .container {
            height: 100vh;
            display: flex;
            flex-direction: column;
          }
          
          .header {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            padding: 16px 20px;
            border-bottom: 1px solid rgba(0, 0, 0, 0.1);
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
            background: #ef4444;
            color: white;
            border: none;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            cursor: pointer;
            font-size: 12px;
          }
          
          .main {
            flex: 1;
            display: flex;
          }
          
          .sidebar {
            width: 200px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border-right: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .menu-item {
            padding: 12px 16px;
            cursor: pointer;
            color: white;
            font-weight: 600;
            transition: background 0.2s;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          }
          
          .menu-item:hover {
            background: rgba(255, 255, 255, 0.1);
          }
          
          .menu-item.active {
            background: rgba(255, 255, 255, 0.2);
          }
          
          .menu-item.disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          
          .content {
            flex: 1;
            padding: 20px;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
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
          
          .form-group input:focus {
            outline: none;
            border-color: #3b82f6;
          }
          
          .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            margin-right: 12px;
          }
          
          .btn-primary {
            background: #3b82f6;
            color: white;
          }
          
          .btn-primary:hover {
            background: #2563eb;
          }
          
          .btn-secondary {
            background: #6b7280;
            color: white;
          }
          
          .btn-secondary:hover {
            background: #4b5563;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Settings</h1>
            <button class="close-btn" onclick="closeDialog()">&times;</button>
          </div>
          
          <div class="main">
            <div class="sidebar">
              <div class="menu-item active" data-tab="api-keys">🔑 API Keys</div>
              <div class="menu-item" data-tab="passwords">🔐 Passwords</div>
              <div class="menu-item" data-tab="agents">🤖 Agents</div>
              <div class="menu-item disabled">🛒 Marketplace</div>
              <div class="menu-item disabled">🏆 Leaderboard</div>
            </div>
            
            <div class="content">
              <div id="api-keys-content">
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
            </div>
          </div>
        </div>
        
        <script>
          function closeDialog() {
            window.electron?.ipcRenderer.invoke('dialog:close', 'settings');
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
              if (window.apiKeys) {
                const openaiKey = await window.apiKeys.get('openai') || '';
                const turbopufferKey = await window.apiKeys.get('turbopuffer') || '';
                
                document.getElementById('openai-key').value = openaiKey;
                document.getElementById('turbopuffer-key').value = turbopufferKey;
              }
            } catch (error) {
              console.error('Failed to load keys:', error);
            }
          });
          
          // Tab switching
          document.querySelectorAll('.menu-item:not(.disabled)').forEach(item => {
            item.addEventListener('click', () => {
              const tab = item.dataset.tab;
              
              // Update active state
              document.querySelectorAll('.menu-item').forEach(i => i.classList.remove('active'));
              item.classList.add('active');
              
              // Show content (for now just API keys)
              if (tab === 'api-keys') {
                document.getElementById('api-keys-content').style.display = 'block';
              }
            });
          });
        </script>
      </body>
      </html>
    `;
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

      // Remove IPC handlers
      try {
        ipcMain.removeHandler("dialog:show-downloads");
        ipcMain.removeHandler("dialog:show-settings");
        ipcMain.removeHandler("dialog:close");
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
