/**
 * Simple test file to verify desktop store functionality
 * This can be run manually to test the store operations
 */

import {
  setUpdateSettings,
  getUpdateSettings,
  setSecureItem,
  getSecureItem,
  deleteSecureItem,
  setUpdateBuildNumber,
  getUpdateBuildNumber,
  clearUpdateBuildNumber,
  setTheme,
  getTheme,
} from "./desktop-store";

// Test function to verify store operations
export async function testDesktopStore() {
  console.log("Testing Desktop Store...");

  // Test update settings
  console.log("Testing update settings...");
  const testSettings = { useTestFeedUrl: true };
  setUpdateSettings(testSettings);
  const retrievedSettings = getUpdateSettings();
  console.log(
    "Update settings test:",
    retrievedSettings.useTestFeedUrl === true ? "PASS" : "FAIL",
  );

  // Test theme
  console.log("Testing theme...");
  setTheme("dark");
  const theme = getTheme();
  console.log("Theme test:", theme === "dark" ? "PASS" : "FAIL");

  // Test update build number
  console.log("Testing update build number...");
  setUpdateBuildNumber("1.2.3");
  const buildNumber = getUpdateBuildNumber();
  console.log("Build number test:", buildNumber === "1.2.3" ? "PASS" : "FAIL");

  // Test secure storage (if available)
  console.log("Testing secure storage...");
  const testKey = "test-secure-key";
  const testValue = "test-secure-value";

  setSecureItem(testKey, testValue);
  const retrievedValue = getSecureItem(testKey);
  console.log(
    "Secure storage test:",
    retrievedValue === testValue ? "PASS" : "FAIL",
  );

  // Clean up
  deleteSecureItem(testKey);
  clearUpdateBuildNumber();

  console.log("Desktop Store tests completed!");
}

// Uncomment to run tests manually
// testDesktopStore().catch(console.error);
