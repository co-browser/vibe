#!/usr/bin/env node

/**
 * Utility script to kill processes on a specific port
 * Usage: node scripts/kill-port.js [port]
 * Default: kills processes on port 3001 (MCP Gmail server)
 */

const { execSync } = require("child_process");

const port = process.argv[2] || "3001";

function killPort(port) {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: 'utf8' }).trim().split('\n');
    if (pids.length > 0 && pids[0]) {
      console.log(`🔍 Found ${pids.length} process(es) on port ${port}`);
      for (const pid of pids) {
        if (pid) {
          try {
            process.kill(parseInt(pid), 'SIGKILL');
            console.log(`  ✅ Killed process ${pid}`);
          } catch (err) {
            console.log(`  ⚠️  Failed to kill process ${pid}: ${err.message}`);
          }
        }
      }
      console.log(`\n✨ Port ${port} is now free!`);
    } else {
      console.log(`✅ Port ${port} is already free`);
    }
  } catch {
    console.log(`✅ Port ${port} is already free`);
  }
}

console.log(`🧹 Checking port ${port}...\n`);
killPort(port);