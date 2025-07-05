#!/usr/bin/env node

/**
 * Development script to inspect storage contents
 * Shows all stored data without decrypting secure items
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

// Format bytes to human readable
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Analyze storage structure
function analyzeStorage(data) {
  const stats = {
    totalKeys: 0,
    secureKeys: 0,
    settingsKeys: 0,
    profileKeys: 0,
    otherKeys: 0,
    profiles: [],
    apiKeys: {}
  };

  function countKeys(obj, prefix = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      stats.totalKeys++;

      if (fullKey.startsWith('secure.') || fullKey.includes('.secure.') || 
          fullKey.endsWith('.apiKeys') || fullKey.endsWith('.passwords')) {
        stats.secureKeys++;
      } else if (fullKey.startsWith('settings.')) {
        stats.settingsKeys++;
      } else if (fullKey.startsWith('profile.') || key === 'profiles') {
        stats.profileKeys++;
      } else {
        stats.otherKeys++;
      }

      // Extract profile info
      if (key === 'profiles' && typeof value === 'object') {
        stats.profiles = Object.keys(value);
      }

      // Don't recurse into secure values
      if (!fullKey.includes('secure') && typeof value === 'object' && value !== null) {
        countKeys(value, fullKey);
      }
    }
  }

  countKeys(data);
  return stats;
}

// Main execution
const userDataPath = getUserDataPath();
const storageFile = path.join(userDataPath, 'vibe.json');

console.log('🔍 Storage Inspector');
console.log('==================');
console.log(`Platform: ${process.platform}`);
console.log(`Storage file: ${storageFile}`);
console.log('');

// Check if file exists
if (!fs.existsSync(storageFile)) {
  console.log('❌ Storage file not found. App may not have been run yet.');
  process.exit(0);
}

// Read and parse storage
try {
  const fileStats = fs.statSync(storageFile);
  const content = fs.readFileSync(storageFile, 'utf8');
  const data = JSON.parse(content);
  
  console.log('📊 File Statistics:');
  console.log(`   Size: ${formatBytes(fileStats.size)}`);
  console.log(`   Modified: ${fileStats.mtime.toLocaleString()}`);
  console.log('');

  const stats = analyzeStorage(data);
  
  console.log('🗂️  Storage Contents:');
  console.log(`   Total keys: ${stats.totalKeys}`);
  console.log(`   Secure keys: ${stats.secureKeys} (encrypted)`);
  console.log(`   Settings keys: ${stats.settingsKeys}`);
  console.log(`   Profile keys: ${stats.profileKeys}`);
  console.log(`   Other keys: ${stats.otherKeys}`);
  console.log('');

  if (stats.profiles.length > 0) {
    console.log('👤 Profiles:');
    stats.profiles.forEach(id => {
      const profile = data.profiles?.[id];
      if (profile) {
        console.log(`   - ${profile.name} (${id})`);
        console.log(`     Email: ${profile.email || 'Not set'}`);
        console.log(`     Active: ${profile.isActive ? 'Yes' : 'No'}`);
        console.log(`     Created: ${new Date(profile.createdAt).toLocaleDateString()}`);
      }
    });
    console.log('');
  }

  // Show non-secure top-level keys
  console.log('🔑 Top-level Keys:');
  Object.keys(data).forEach(key => {
    if (!key.startsWith('secure') && key !== 'profiles') {
      const value = data[key];
      const preview = typeof value === 'object' ? 
        `{${Object.keys(value).slice(0, 3).join(', ')}${Object.keys(value).length > 3 ? '...' : ''}}` :
        JSON.stringify(value);
      console.log(`   ${key}: ${preview}`);
    }
  });

  // Show raw data if requested
  if (process.argv.includes('--raw')) {
    console.log('');
    console.log('📝 Raw Data (secure values hidden):');
    const sanitized = JSON.parse(JSON.stringify(data));
    
    // Hide secure values
    function hideSecure(obj, path = '') {
      for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;
        if (fullPath.includes('secure') || fullPath.includes('apiKey') || fullPath.includes('password')) {
          obj[key] = '[ENCRYPTED]';
        } else if (typeof value === 'object' && value !== null) {
          hideSecure(value, fullPath);
        }
      }
    }
    
    hideSecure(sanitized);
    console.log(JSON.stringify(sanitized, null, 2));
  }

} catch (error) {
  console.error('❌ Failed to read storage:', error.message);
  process.exit(1);
}