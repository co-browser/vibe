import { ipcMain } from "electron";

/**
 * WARNING: Do NOT store API keys in plain text for production use.
 * Use secure storage (e.g., OS keychain, Electron safeStorage, or encryption) to protect sensitive credentials.
 */

/**
 * API key management handlers
 * Direct approach - no registration functions needed
 */

const apiKeys = {
  openai: process.env.OPENAI_API_KEY,
};

ipcMain.handle("get-api-key", (_event: any, keyName: string) => {
  if (["openai"].includes(keyName)) {
    return apiKeys[keyName as keyof typeof apiKeys];
  }
  return null;
});

ipcMain.handle("set-api-key", (_event: any, keyName: string, value: string) => {
  if (["openai"].includes(keyName)) {
    apiKeys[keyName as keyof typeof apiKeys] = value;
    process.env.OPENAI_API_KEY = value;
    return true;
  }
  return false;
});
