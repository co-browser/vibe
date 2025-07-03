#!/usr/bin/env node

/**
 * Development script to delete all storage data
 * Only works when app is not running
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Get user data path based on platform
function getUserDataPath() {
  const appName = 'vibe';
  
  switch (process.platform) {
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName);
    case 'win32':
      return path.join(process.env.APPDATA || os.homedir(), appName);
    case 'linux':
      return path.join(os.homedir(), '.config', appName);
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

// Check if running in production
if (process.env.NODE_ENV === 'production') {
  console.error('❌ This script cannot be run in production!');
  process.exit(1);
}

// Get storage file paths
const userDataPath = getUserDataPath();
const storageFiles = [
  'vibe.json',           // Main storage file
];

console.log('🗑️  Storage Deletion Script');
console.log('========================');
console.log(`Platform: ${process.platform}`);
console.log(`User data path: ${userDataPath}`);
console.log('');

// Check if directory exists
if (!fs.existsSync(userDataPath)) {
  console.log('✅ No storage directory found. Nothing to delete.');
  process.exit(0);
}

// Delete storage files
let deletedCount = 0;
storageFiles.forEach(file => {
  const filePath = path.join(userDataPath, file);
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      console.log(`✅ Deleted: ${file}`);
      deletedCount++;
    } catch (error) {
      console.error(`❌ Failed to delete ${file}:`, error.message);
    }
  } else {
    console.log(`⏭️  Skipped: ${file} (not found)`);
  }
});

console.log('');
console.log(`Summary: Deleted ${deletedCount} file(s)`);

// Optionally delete the entire app directory
if (process.argv.includes('--all')) {
  console.log('');
  console.log('🗑️  Deleting entire app directory...');
  try {
    fs.rmSync(userDataPath, { recursive: true, force: true });
    console.log('✅ App directory deleted');
  } catch (error) {
    console.error('❌ Failed to delete app directory:', error.message);
  }
}