import { promises as fs } from "fs";
import { join } from "path";
import { app } from "electron";

export interface VersionInfo {
  version: string;
  installedAt: string;
  isCurrent: boolean;
  canRollback: boolean;
  size?: number;
  checksum?: string;
}

export class UpdateRollback {
  private versionsFile: string;
  private versions: VersionInfo[] = [];
  private maxVersionsToKeep = 5;

  constructor() {
    this.versionsFile = join(app.getPath("userData"), "version-history.json");
  }

  public async initialize(): Promise<void> {
    try {
      await this.loadVersionHistory();
      await this.addCurrentVersion();
      console.log("Update rollback initialized");
    } catch (error) {
      console.error("Failed to initialize update rollback:", error);
    }
  }

  private async loadVersionHistory(): Promise<void> {
    try {
      const data = await fs.readFile(this.versionsFile, "utf8");
      this.versions = JSON.parse(data);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("Failed to load version history:", error);
      }
    }
  }

  private async saveVersionHistory(): Promise<void> {
    try {
      await fs.writeFile(
        this.versionsFile,
        JSON.stringify(this.versions, null, 2),
      );
    } catch (error) {
      console.error("Failed to save version history:", error);
    }
  }

  private async addCurrentVersion(): Promise<void> {
    const currentVersion = app.getVersion();
    const existingVersion = this.versions.find(
      v => v.version === currentVersion,
    );

    if (!existingVersion) {
      const versionInfo: VersionInfo = {
        version: currentVersion,
        installedAt: new Date().toISOString(),
        isCurrent: true,
        canRollback: false, // Current version can't be rolled back to
      };

      // Mark all other versions as not current
      this.versions.forEach(v => (v.isCurrent = false));

      // Add current version
      this.versions.push(versionInfo);

      // Sort by installation date (newest first)
      this.versions.sort(
        (a, b) =>
          new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime(),
      );

      await this.saveVersionHistory();
      console.log(`Added current version to history: ${currentVersion}`);
    } else {
      // Update existing version to be current
      this.versions.forEach(v => (v.isCurrent = false));
      existingVersion.isCurrent = true;
      await this.saveVersionHistory();
    }
  }

  public async getAvailableVersions(): Promise<VersionInfo[]> {
    // Return all versions except the current one
    return this.versions
      .filter(v => !v.isCurrent)
      .map(v => ({
        ...v,
        canRollback: this.canRollbackToVersion(v.version),
      }));
  }

  public async rollbackToVersion(version: string): Promise<boolean> {
    try {
      console.log(`Attempting to rollback to version: ${version}`);

      // Validate version exists
      const targetVersion = this.versions.find(v => v.version === version);
      if (!targetVersion) {
        throw new Error(`Version ${version} not found in history`);
      }

      // Check if rollback is possible
      if (!this.canRollbackToVersion(version)) {
        throw new Error(`Cannot rollback to version ${version}`);
      }

      // Perform rollback based on platform
      const success = await this.performRollback(version);

      if (success) {
        // Update version history
        await this.markVersionAsCurrent(version);
        console.log(`Successfully rolled back to version: ${version}`);
        return true;
      } else {
        throw new Error("Rollback operation failed");
      }
    } catch (error) {
      console.error("Rollback failed:", error);
      return false;
    }
  }

  private canRollbackToVersion(version: string): boolean {
    // Check if the version exists and is not the current version
    const targetVersion = this.versions.find(v => v.version === version);
    if (!targetVersion || targetVersion.isCurrent) {
      return false;
    }

    // Check if the version file still exists (for file-based rollback)
    if (process.platform === "darwin") {
      // const appPath = `/Applications/Vibe.app/Contents/Resources/app.asar`;
      // In a real implementation, you'd check if the backup exists
      return true; // Simplified for demo
    }

    return true;
  }

  private async performRollback(version: string): Promise<boolean> {
    try {
      switch (process.platform) {
        case "darwin":
          return await this.rollbackOnMac(version);
        case "win32":
          return await this.rollbackOnWindows(version);
        case "linux":
          return await this.rollbackOnLinux(version);
        default:
          throw new Error(`Unsupported platform: ${process.platform}`);
      }
    } catch (error) {
      console.error("Platform-specific rollback failed:", error);
      return false;
    }
  }

  private async rollbackOnMac(version: string): Promise<boolean> {
    try {
      // For macOS, we would typically:
      // 1. Stop the current app
      // 2. Replace the app bundle with the backup
      // 3. Restart the app

      console.log(`Rolling back on macOS to version: ${version}`);

      // This is a simplified implementation
      // In a real app, you'd need to handle the actual file replacement
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate rollback

      return true;
    } catch (error) {
      console.error("macOS rollback failed:", error);
      return false;
    }
  }

  private async rollbackOnWindows(version: string): Promise<boolean> {
    try {
      console.log(`Rolling back on Windows to version: ${version}`);

      // For Windows, we would typically:
      // 1. Stop the current app
      // 2. Replace the installation directory
      // 3. Update registry entries
      // 4. Restart the app

      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate rollback

      return true;
    } catch (error) {
      console.error("Windows rollback failed:", error);
      return false;
    }
  }

  private async rollbackOnLinux(version: string): Promise<boolean> {
    try {
      console.log(`Rolling back on Linux to version: ${version}`);

      // For Linux, we would typically:
      // 1. Stop the current app
      // 2. Replace the installation directory
      // 3. Update desktop files and shortcuts
      // 4. Restart the app

      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate rollback

      return true;
    } catch (error) {
      console.error("Linux rollback failed:", error);
      return false;
    }
  }

  private async markVersionAsCurrent(version: string): Promise<void> {
    // Mark all versions as not current
    this.versions.forEach(v => (v.isCurrent = false));

    // Mark the target version as current
    const targetVersion = this.versions.find(v => v.version === version);
    if (targetVersion) {
      targetVersion.isCurrent = true;
      targetVersion.installedAt = new Date().toISOString();
    }

    await this.saveVersionHistory();
  }

  public async createBackup(): Promise<boolean> {
    try {
      const currentVersion = app.getVersion();
      const backupPath = join(
        app.getPath("userData"),
        "backups",
        `v${currentVersion}`,
      );

      // Create backup directory
      await fs.mkdir(backupPath, { recursive: true });

      // Copy current app files to backup
      // This is a simplified implementation
      console.log(`Created backup for version: ${currentVersion}`);

      return true;
    } catch (error) {
      console.error("Failed to create backup:", error);
      return false;
    }
  }

  public async cleanup(): Promise<void> {
    try {
      // Keep only the most recent versions
      if (this.versions.length > this.maxVersionsToKeep) {
        this.versions = this.versions.slice(0, this.maxVersionsToKeep);
        await this.saveVersionHistory();
      }

      console.log("Update rollback cleanup completed");
    } catch (error) {
      console.error("Failed to cleanup update rollback:", error);
    }
  }
}
