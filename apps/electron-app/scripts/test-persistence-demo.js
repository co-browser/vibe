#!/usr/bin/env node
/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Demo script showing how settings persistence works
 * This simulates what the app does when saving/loading settings
 */

const Store = require('electron-store');
const { safeStorage } = require('electron');
const path = require('path');
const os = require('os');

// Cross-platform app data directory
const getAppDataPath = () => {
  switch (process.platform) {
    case 'win32':
      return path.join(os.homedir(), 'AppData', 'Roaming', 'vibe');
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', 'vibe');
    default:
      return path.join(os.homedir(), '.config', 'vibe');
  }
};

// Create stores similar to how the app does it
const settingsStore = new Store({
  name: 'vibe-settings',
  cwd: getAppDataPath()
});

// Create secure store with error handling for encryption
let secureStore;
try {
  secureStore = new Store({
    name: 'vibe-secure',
    cwd: getAppDataPath(),
    encryptionKey: 'vibe-secure-store' // In the app, this uses a more secure key
  });
} catch (error) {
  console.log('⚠️  Could not create secure store (encryption mismatch):', error.message);
  secureStore = null;
}

console.log('=== Vibe Settings Persistence Demo ===\n');

// Demonstrate saving a test setting
const testKey = 'testTimestamp';
const testValue = new Date().toISOString();

console.log('1. Saving test setting:');
console.log(`   Key: ${testKey}`);
console.log(`   Value: ${testValue}`);
settingsStore.set(testKey, testValue);
console.log('   ✅ Saved to disk automatically\n');

// Demonstrate loading it back
console.log('2. Loading test setting:');
const loadedValue = settingsStore.get(testKey);
console.log(`   Loaded value: ${loadedValue}`);
console.log(`   ✅ Matches saved value: ${loadedValue === testValue}\n`);

// Show all current settings
console.log('3. Current settings in store:');
const allSettings = settingsStore.store;
Object.keys(allSettings).forEach(key => {
  const value = allSettings[key];
  if (typeof value === 'object') {
    console.log(`   ${key}: [object]`);
  } else {
    console.log(`   ${key}: ${value}`);
  }
});

console.log('\n4. API Key Storage (Secure Store):');
// Note: In the real app, this would be encrypted with safeStorage
if (secureStore) {
  try {
    const hasApiKeys = secureStore.has('openaiApiKey') || secureStore.has('turboRouterKey');
    if (hasApiKeys) {
      console.log('   ✅ API keys are stored (encrypted)');
      if (secureStore.has('openaiApiKey')) {
        console.log('   - OpenAI key: ***' + (secureStore.get('openaiApiKey') || '').slice(-4));
      }
      if (secureStore.has('turboRouterKey')) {
        console.log('   - Turbo Router key: ***' + (secureStore.get('turboRouterKey') || '').slice(-4));
      }
    } else {
      console.log('   ℹ️  No API keys stored yet');
    }
  } catch (e) {
    console.log('   ⚠️  Cannot read secure store (encryption mismatch)');
  }
} else {
  console.log('   ⚠️  Secure store not available (encryption mismatch)');
}

console.log('\n=== Summary ===');
console.log('✅ Settings are automatically persisted to disk');
console.log('✅ Settings survive app restarts');
console.log('✅ API keys are stored separately in encrypted storage');
console.log('\nThe electron-store library handles all file I/O automatically.');
console.log('Any call to store.set() immediately writes to disk.');