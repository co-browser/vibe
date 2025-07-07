/**
 * File Drop Service
 * Handles drag and drop operations for files from external applications
 */

import { BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("FileDropService");

export interface DropZoneConfig {
  accept: string[]; // File extensions or mime types
  maxFiles: number;
  maxSize: number; // in bytes
  element?: string; // CSS selector for drop zone
}

export interface DroppedFile {
  name: string;
  path: string;
  size: number;
  type: string;
  lastModified: number;
  isImage: boolean;
  isText: boolean;
  isDocument: boolean;
}

export class FileDropService {
  private static instance: FileDropService;
  private dropZones: Map<string, DropZoneConfig> = new Map();

  private constructor() {
    this.setupIpcHandlers();
  }

  public static getInstance(): FileDropService {
    if (!FileDropService.instance) {
      FileDropService.instance = new FileDropService();
    }
    return FileDropService.instance;
  }

  private setupIpcHandlers(): void {
    // Register drop zone
    ipcMain.handle(
      "file-drop:register-zone",
      (_event, zoneId: string, config: DropZoneConfig) => {
        this.dropZones.set(zoneId, config);
        logger.info(`Registered drop zone: ${zoneId}`, config);
        return { success: true };
      },
    );

    // Unregister drop zone
    ipcMain.handle("file-drop:unregister-zone", (_event, zoneId: string) => {
      this.dropZones.delete(zoneId);
      logger.info(`Unregistered drop zone: ${zoneId}`);
      return { success: true };
    });

    // Process dropped files
    ipcMain.handle(
      "file-drop:process-files",
      async (_event, zoneId: string, filePaths: string[]) => {
        const config = this.dropZones.get(zoneId);
        if (!config) {
          return { success: false, error: "Drop zone not found" };
        }

        try {
          const processedFiles = await this.processFiles(filePaths, config);
          return { success: true, files: processedFiles };
        } catch (error) {
          logger.error("Failed to process dropped files:", error);
          return {
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          };
        }
      },
    );

    // Get file preview data
    ipcMain.handle(
      "file-drop:get-preview",
      async (_event, filePath: string) => {
        try {
          const preview = await this.generateFilePreview(filePath);
          return { success: true, preview };
        } catch (error) {
          logger.error("Failed to generate file preview:", error);
          return { success: false, error: "Failed to generate preview" };
        }
      },
    );
  }

  private async processFiles(
    filePaths: string[],
    config: DropZoneConfig,
  ): Promise<DroppedFile[]> {
    const files: DroppedFile[] = [];

    // Check file count limit
    if (filePaths.length > config.maxFiles) {
      throw new Error(`Too many files. Maximum allowed: ${config.maxFiles}`);
    }

    for (const filePath of filePaths) {
      try {
        const stats = fs.statSync(filePath);

        // Check if it's a file (not directory)
        if (!stats.isFile()) {
          logger.warn(`Skipping non-file: ${filePath}`);
          continue;
        }

        // Check file size
        if (stats.size > config.maxSize) {
          throw new Error(
            `File too large: ${path.basename(filePath)}. Maximum size: ${this.formatFileSize(config.maxSize)}`,
          );
        }

        const ext = path.extname(filePath).toLowerCase();
        const name = path.basename(filePath);

        // Check file type if restrictions are specified
        if (config.accept.length > 0) {
          const isAccepted = config.accept.some(accept => {
            if (accept.startsWith(".")) {
              return ext === accept;
            }
            // Check mime type category
            if (accept.includes("/")) {
              const mimeType = this.getMimeType(ext);
              return mimeType.startsWith(accept) || mimeType === accept;
            }
            return false;
          });

          if (!isAccepted) {
            throw new Error(
              `File type not supported: ${ext}. Accepted types: ${config.accept.join(", ")}`,
            );
          }
        }

        const droppedFile: DroppedFile = {
          name,
          path: filePath,
          size: stats.size,
          type: this.getMimeType(ext),
          lastModified: stats.mtime.getTime(),
          isImage: this.isImageFile(ext),
          isText: this.isTextFile(ext),
          isDocument: this.isDocumentFile(ext),
        };

        files.push(droppedFile);
        logger.info(
          `Processed file: ${name} (${this.formatFileSize(stats.size)})`,
        );
      } catch (error) {
        if (error instanceof Error) {
          throw error; // Re-throw validation errors
        }
        logger.error(`Failed to process file ${filePath}:`, error);
        throw new Error(`Failed to process file: ${path.basename(filePath)}`);
      }
    }

    return files;
  }

  private async generateFilePreview(filePath: string): Promise<{
    type: string;
    content?: string;
    thumbnail?: string;
    metadata: any;
  }> {
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);

    const metadata = {
      name: path.basename(filePath),
      size: stats.size,
      lastModified: stats.mtime.getTime(),
      extension: ext,
    };

    // Text file preview
    if (this.isTextFile(ext)) {
      try {
        const content = fs.readFileSync(filePath, "utf8");
        return {
          type: "text",
          content: content.slice(0, 1000), // First 1000 chars
          metadata,
        };
      } catch (error) {
        logger.warn(`Failed to read text file ${filePath}:`, error);
      }
    }

    // Image file preview (base64 thumbnail)
    if (this.isImageFile(ext)) {
      try {
        const imageBuffer = fs.readFileSync(filePath);
        const base64 = imageBuffer.toString("base64");
        return {
          type: "image",
          thumbnail: `data:${this.getMimeType(ext)};base64,${base64}`,
          metadata,
        };
      } catch (error) {
        logger.warn(`Failed to read image file ${filePath}:`, error);
      }
    }

    return {
      type: "file",
      metadata,
    };
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      ".txt": "text/plain",
      ".md": "text/markdown",
      ".json": "application/json",
      ".js": "application/javascript",
      ".ts": "application/typescript",
      ".html": "text/html",
      ".css": "text/css",
      ".xml": "application/xml",
      ".pdf": "application/pdf",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".ppt": "application/vnd.ms-powerpoint",
      ".pptx":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".bmp": "image/bmp",
      ".ico": "image/x-icon",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
      ".avi": "video/x-msvideo",
      ".mov": "video/quicktime",
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".ogg": "audio/ogg",
      ".zip": "application/zip",
      ".rar": "application/x-rar-compressed",
      ".tar": "application/x-tar",
      ".gz": "application/gzip",
    };

    return mimeTypes[extension] || "application/octet-stream";
  }

  private isImageFile(extension: string): boolean {
    return [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ].includes(extension);
  }

  private isTextFile(extension: string): boolean {
    return [
      ".txt",
      ".md",
      ".json",
      ".js",
      ".ts",
      ".html",
      ".css",
      ".xml",
      ".csv",
      ".log",
    ].includes(extension);
  }

  private isDocumentFile(extension: string): boolean {
    return [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"].includes(
      extension,
    );
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  /**
   * Setup file drop handling for a BrowserWindow
   */
  public setupWindowDropHandling(window: BrowserWindow): void {
    // Enable file drag and drop
    window.webContents.on("will-navigate", (event, navigationUrl) => {
      // Prevent navigation when files are dropped
      if (navigationUrl.startsWith("file://")) {
        event.preventDefault();
      }
    });

    // Handle dropped files at the OS level
    window.webContents.on("dom-ready", () => {
      // Inject drop zone CSS for visual feedback
      window.webContents.insertCSS(`
        .vibe-drop-zone {
          position: relative;
          transition: all 0.2s ease;
        }
        
        .vibe-drop-zone.drag-over {
          background-color: rgba(0, 123, 255, 0.1) !important;
          border: 2px dashed #007bff !important;
          border-radius: 8px !important;
        }
        
        .vibe-drop-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 123, 255, 0.1);
          backdrop-filter: blur(2px);
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          pointer-events: none;
        }
        
        .vibe-drop-message {
          background: white;
          padding: 24px 32px;
          border-radius: 12px;
          box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
          border: 2px dashed #007bff;
          text-align: center;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }
        
        .vibe-drop-icon {
          font-size: 48px;
          color: #007bff;
          margin-bottom: 16px;
        }
        
        .vibe-drop-text {
          font-size: 18px;
          font-weight: 600;
          color: #333;
          margin-bottom: 8px;
        }
        
        .vibe-drop-hint {
          font-size: 14px;
          color: #666;
        }
      `);
    });

    logger.info(`File drop handling setup for window: ${window.id}`);
  }
}
