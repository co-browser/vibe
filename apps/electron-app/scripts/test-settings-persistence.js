#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */

/**
 * Test script to verify settings persistence
 * Run this script to check if settings files exist and contain expected data
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the app data directory
const appDataPath = path.join(os.homedir(), 'Library', 'Application Support', 'vibe');

console.log('=== Vibe Settings Persistence Verification ===\n');
console.log('App data directory:', appDataPath);
console.log('');

// Check if directory exists
if (!fs.existsSync(appDataPath)) {
  console.error('❌ App data directory does not exist!');
  console.log('   Settings will be created when the app runs for the first time.');
  process.exit(1);
}

console.log('✅ App data directory exists\n');

// List of expected files
const settingsFiles = [
  { name: 'vibe-settings.json', description: 'General settings' },
  { name: 'vibe-secure.json', description: 'Encrypted API keys' },
  { name: 'vibe-profiles.json', description: 'User profiles' },
  { name: 'vibe-userdata.json', description: 'User data' }
];

console.log('Checking settings files:');
console.log('─'.repeat(50));

settingsFiles.forEach(file => {
  const filePath = path.join(appDataPath, file.name);
  
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${file.name}`);
    console.log(`   Description: ${file.description}`);
    console.log(`   Size: ${stats.size} bytes`);
    console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
    
    // For non-secure files, show a preview of contents
    if (!file.name.includes('secure')) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(content);
        console.log(`   Keys: ${Object.keys(parsed).join(', ') || 'empty'}`);
      } catch {
        console.log('   Content: Unable to parse');
      }
    } else {
      console.log('   Content: Encrypted');
    }
  } else {
    console.log(`❌ ${file.name} - Not found`);
    console.log(`   Description: ${file.description}`);
  }
  console.log('');
});

console.log('─'.repeat(50));

// Check for desktop store (Touch ID encrypted data)
const desktopStorePath = path.join(appDataPath, 'desktop-store.json');
if (fs.existsSync(desktopStorePath)) {
  console.log('✅ Desktop store found (Touch ID secured)');
  const stats = fs.statSync(desktopStorePath);
  console.log(`   Size: ${stats.size} bytes`);
  console.log(`   Modified: ${stats.mtime.toLocaleString()}`);
} else {
  console.log('ℹ️  Desktop store not found (created after Touch ID setup)');
}

console.log('\n=== Verification Complete ===');
console.log('\nTo test persistence:');
console.log('1. Open the app and go to Settings');
console.log('2. Enter some API keys');
console.log('3. Close the app completely');
console.log('4. Run this script again to see updated timestamps');
console.log('5. Reopen the app - your settings should be restored');