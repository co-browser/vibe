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

/**
 * Terminates all spawned child processes and the turbo process, then exits the current process.
 *
 * Ensures that any running development environment processes are properly cleaned up on exit or interruption.
 */
function cleanup() {
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

  console.log("✅ Cleanup complete");
  process.exit(0);
}

// Handle various exit signals
process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
process.on("exit", cleanup);

// Handle uncaught exceptions
process.on("uncaughtException", err => {
  console.error("Uncaught exception:", err);
  cleanup();
});

/**
 * Builds required dependencies and starts the turbo development environment, managing process lifecycle and cleanup on errors or termination.
 */

async function main() {
  try {
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

    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY)
      console.log("⚠️  OPENAI_API_KEY not foun in env\n");

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
