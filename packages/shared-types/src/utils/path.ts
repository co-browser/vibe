/**
 * Path utilities for Node.js environments only
 * These utilities are not available in browser contexts
 */

import * as path from "path";
import * as fs from "fs";

/**
 * Find the monorepo workspace root by looking for a marker file
 * @param startPath - The directory to start searching from
 * @param markerFile - The file that indicates the workspace root (default: pnpm-workspace.yaml)
 * @returns The workspace root path or null if not found
 * @throws Error if startPath is invalid
 */
export function findWorkspaceRoot(
  startPath: string,
  markerFile: string = "pnpm-workspace.yaml",
): string | null {
  if (!startPath || typeof startPath !== "string") {
    throw new Error("Invalid startPath: must be a non-empty string");
  }

  try {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      if (fs.existsSync(path.join(currentPath, markerFile))) {
        return currentPath;
      }
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break; // Prevent infinite loop
      currentPath = parentPath;
    }

    return null;
  } catch (error) {
    // Handle any filesystem errors gracefully
    console.error(`Error finding workspace root from ${startPath}:`, error);
    return null;
  }
}

/**
 * Find a file by searching up the directory tree
 * @param startPath - The directory to start searching from
 * @param fileName - The file name to search for
 * @returns The full path to the file or null if not found
 * @throws Error if parameters are invalid
 */
export function findFileUpwards(
  startPath: string,
  fileName: string,
): string | null {
  if (!startPath || typeof startPath !== "string") {
    throw new Error("Invalid startPath: must be a non-empty string");
  }
  if (!fileName || typeof fileName !== "string") {
    throw new Error("Invalid fileName: must be a non-empty string");
  }

  try {
    let currentPath = path.resolve(startPath);
    const root = path.parse(currentPath).root;

    while (currentPath !== root) {
      const filePath = path.join(currentPath, fileName);
      if (fs.existsSync(filePath)) {
        return filePath;
      }
      const parentPath = path.dirname(currentPath);
      if (parentPath === currentPath) break;
      currentPath = parentPath;
    }

    return null;
  } catch (error) {
    console.error(`Error finding file ${fileName} from ${startPath}:`, error);
    return null;
  }
}

/**
 * Get the path to a package in the monorepo
 * @param packageName - The package name (e.g., "mcp-gmail")
 * @param fromPath - The path to start searching from
 * @returns The path to the package or null if not found
 * @throws Error if parameters are invalid
 */
export function getMonorepoPackagePath(
  packageName: string,
  fromPath: string,
): string | null {
  if (!packageName || typeof packageName !== "string") {
    throw new Error("Invalid packageName: must be a non-empty string");
  }
  if (!fromPath || typeof fromPath !== "string") {
    throw new Error("Invalid fromPath: must be a non-empty string");
  }

  try {
    const workspaceRoot = findWorkspaceRoot(fromPath);
    if (!workspaceRoot) return null;

    const packagePath = path.join(workspaceRoot, "packages", packageName);
    return fs.existsSync(packagePath) ? packagePath : null;
  } catch (error) {
    console.error(`Error finding package ${packageName}:`, error);
    return null;
  }
}
