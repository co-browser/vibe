import { ipcMain } from "electron";

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
