#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const process = require("process");
const path = require("path");

// Load environment variables from root .env file
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

// Set cleaner log levels for development
process.env.LOG_LEVEL = process.env.LOG_LEVEL || "info";
process.env.SENTRY_LOG_LEVEL = "error";
process.env.ELECTRON_DISABLE_STACK_TRACES = "true";

let turboProcess;
const childProcesses = [];
let isCleaningUp = false;

/**
 * Check if a port is in use
 */
async function isPortInUse(port) {
  try {
    execSync(`lsof -ti:${port}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill processes using a specific port
 */
async function killPort(port) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim().split('\n');
    for (const pid of pids) {
      if (pid) {
        try {
          process.kill(parseInt(pid), 'SIGKILL');
          console.log(`  Killed process ${pid} on port ${port}`);
        } catch {
          // Process might already be dead
        }
      }
    }
  } catch {
    // No processes found on port
  }
}

/**
 * Terminates all spawned child processes and the turbo process, then exits the current process.
 *
 * Ensures that any running development environment processes are properly cleaned up on exit or interruption.
 */
async function cleanup() {
  // Prevent multiple cleanup calls
  if (isCleaningUp) return;
  isCleaningUp = true;

  console.log("\n🧹 Cleaning up processes...");

  // Kill all child processes
  childProcesses.forEach(proc => {
    if (proc && !proc.killed) {
      try {
        process.kill(-proc.pid, "SIGTERM");
      } catch {
        // Process might already be dead
      }
    }
  });

  // Kill turbo process and all its children
  if (turboProcess && !turboProcess.killed) {
    try {
      process.kill(-turboProcess.pid, "SIGTERM");
    } catch {
      // Process might already be dead
    }
  }

  // Wait a bit for graceful shutdown
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Check if port 3001 is still in use (MCP Gmail server)
  if (await isPortInUse(3001)) {
    console.log("🔍 Port 3001 still in use, forcing cleanup...");
    await killPort(3001);
  }

  console.log("✅ Cleanup complete");
  process.exit(0);
}

// Handle various exit signals
const handleSignal = () => {
  cleanup().catch(console.error);
};

process.on("SIGINT", handleSignal);
process.on("SIGTERM", handleSignal);

// Handle uncaught exceptions
process.on("uncaughtException", err => {
  console.error("Uncaught exception:", err);
  cleanup().catch(console.error);
});

/**
 * Builds required dependencies and starts the turbo development environment, managing process lifecycle and cleanup on errors or termination.
 */

async function main() {
  try {
    // Check if port 3001 is already in use
    if (await isPortInUse(3001)) {
      console.log("⚠️  Port 3001 is already in use (MCP Gmail server)");
      console.log("🔧 Cleaning up stale processes...");
      await killPort(3001);
      console.log("✅ Port 3001 freed\n");
    }

    // Build dependencies first
    console.log("📦 Building required dependencies...\n");

    // Build tab extraction core
    execSync("turbo run build --filter=@vibe/tab-extraction-core", {
      stdio: "inherit",
    });

    // Build MCP packages
    console.log("📦 Building MCP packages...\n");
    execSync("turbo run build --filter=@vibe/mcp-*", {
      stdio: "inherit",
    });

    console.log("✅ Dependencies built successfully\n");

    turboProcess = spawn("turbo", ["run", "dev"], {
      stdio: "inherit",
      detached: true,
    });
    childProcesses.push(turboProcess);

    if (turboProcess) {
      turboProcess.on("error", err => {
        console.error("Failed to start turbo:", err);
        cleanup();
      });

      turboProcess.on("exit", code => {
        if (code !== 0 && code !== null) {
          console.error(`Turbo exited with code ${code}`);
        }
        cleanup();
      });
    }

    console.log("🎉 All services started! Press Ctrl+C to stop.\n");
  } catch (err) {
    console.error("❌ Failed to start development environment:", err.message);
    cleanup();
  }
}

main();
