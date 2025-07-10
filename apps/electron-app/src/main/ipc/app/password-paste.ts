import { ipcMain } from "electron";
import {
  pastePasswordForDomain,
  pastePasswordForActiveTab,
} from "@/password-paste-handler";

/**
 * Password paste IPC handlers
 */

ipcMain.handle("password:paste-for-domain", async (_event, domain: string) => {
  return await pastePasswordForDomain(domain);
});

ipcMain.handle("password:paste-for-active-tab", async _event => {
  return await pastePasswordForActiveTab();
});
