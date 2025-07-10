import fs from 'fs';
import path from 'path';

/**
 * Load environment variables from a .env file
 * @param {string} envPath - Path to the .env file (defaults to .env in current directory)
 */
export function loadEnvFile(envPath = '.env') {
  try {
    // Try to find .env file in current directory or parent directories
    let envFilePath = envPath;
    if (!path.isAbsolute(envPath)) {
      // Start from current directory and work up to find .env
      let currentDir = process.cwd();
      while (currentDir !== path.dirname(currentDir)) {
        const testPath = path.join(currentDir, envPath);
        if (fs.existsSync(testPath)) {
          envFilePath = testPath;
          break;
        }
        currentDir = path.dirname(currentDir);
      }
    }

    if (!fs.existsSync(envFilePath)) {
      console.log(`[env-loader]: .env file not found at ${envFilePath}`);
      return;
    }

    console.log(`[env-loader]: Loading environment variables from ${envFilePath}`);
    
    const envContent = fs.readFileSync(envFilePath, 'utf8');
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }

      // Parse key=value pairs
      const equalIndex = trimmedLine.indexOf('=');
      if (equalIndex > 0) {
        const key = trimmedLine.substring(0, equalIndex).trim();
        const value = trimmedLine.substring(equalIndex + 1).trim();
        
        // Only set if not already defined in environment
        if (!process.env[key]) {
          process.env[key] = value;
          console.log(`[env-loader]: Loaded ${key}`);
        } else {
          console.log(`[env-loader]: Skipped ${key} (already set)`);
        }
      }
    }
  } catch (error) {
    console.error('[env-loader]: Error loading .env file:', error.message);
  }
}

/**
 * Check if required environment variables are set
 * @param {string[]} requiredVars - Array of required environment variable names
 * @returns {boolean} - True if all required variables are set
 */
export function checkRequiredEnvVars(requiredVars) {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    console.warn(`[env-loader]: Missing required environment variables: ${missing.join(', ')}`);
    return false;
  }
  
  return true;
} 