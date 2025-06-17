#!/usr/bin/env node

const { spawn, execSync } = require("child_process");
const process = require("process");
const path = require("path");

// Load environment variables from root .env file
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

let turboProcess;
const childProcesses = [];

// Function to cleanup processes
function cleanup() {
  console.log("\n🧹 Cleaning up processes...");

  // Kill all child processes
  childProcesses.forEach((proc) => {
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
process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err);
  cleanup();
});

// Wait for a port to be available

async function main() {
  try {
    // Build dependencies first
    console.log("📦 Building required dependencies...\n");
    execSync("turbo run build --filter=@vibe/tab-extraction-core", {
      stdio: "inherit",
    });
    console.log("✅ Dependencies built successfully\n");

    // Check if OPENAI_API_KEY is available
    if (!process.env.OPENAI_API_KEY) console.log("⚠️  OPENAI_API_KEY not foun in env\n");

    turboProcess = spawn("turbo", ["run", "dev"], {
      stdio: "inherit",
      detached: true,
    });
    childProcesses.push(turboProcess);

    if (turboProcess) {
      turboProcess.on("error", (err) => {
        console.error("Failed to start turbo:", err);
        cleanup();
      });

      turboProcess.on("exit", (code) => {
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
