import { ipcMain, BrowserWindow } from "electron";
import { profileService } from "@/services/profile-service";
import type { ProfileData } from "@vibe/shared-types";

const CHANNELS = {
  GET_STATUS: "profile:get-status",
  INITIALIZE: "profile:initialize",
  CREATE_PROFILE: "profile:create-profile",
  GET_PROFILE: "profile:get-profile",
  UPDATE_PROFILE: "profile:update-profile",
  CLEAR_PROFILE: "profile:clear-profile",
  SET_API_KEY: "profile:set-api-key",
  GET_API_KEY: "profile:get-api-key",
  DELETE_API_KEY: "profile:delete-api-key",
  SET_PASSWORD: "profile:set-password",
  GET_PASSWORD: "profile:get-password",
  ADD_BROWSING_HISTORY: "profile:add-browsing-history",
  GET_BROWSING_HISTORY: "profile:get-browsing-history",
  SET_PREFERENCE: "profile:set-preference",
  GET_PREFERENCE: "profile:get-preference",
} as const;

ipcMain.handle(CHANNELS.GET_STATUS, () => profileService.getStatus());
ipcMain.handle(CHANNELS.INITIALIZE, () => profileService.initialize());
ipcMain.handle(
  CHANNELS.CREATE_PROFILE,
  (_e, data: Omit<ProfileData, "id" | "createdAt" | "updatedAt">) =>
    profileService.createProfile(data),
);
ipcMain.handle(CHANNELS.GET_PROFILE, () => profileService.getProfile());
ipcMain.handle(CHANNELS.UPDATE_PROFILE, (_e, updates: Partial<ProfileData>) =>
  profileService.updateProfile(updates),
);
ipcMain.handle(CHANNELS.CLEAR_PROFILE, () => profileService.clearProfile());
ipcMain.handle(CHANNELS.SET_API_KEY, (_e, service: string, key: string) =>
  profileService.setApiKey(service, key),
);
ipcMain.handle(CHANNELS.GET_API_KEY, (_e, service: string) =>
  profileService.getApiKey(service),
);
ipcMain.handle(CHANNELS.DELETE_API_KEY, (_e, service: string) =>
  profileService.deleteApiKey(service),
);
ipcMain.handle(CHANNELS.SET_PASSWORD, (_e, domain: string, password: string) =>
  profileService.setSavedPassword(domain, password),
);
ipcMain.handle(CHANNELS.GET_PASSWORD, (_e, domain: string) =>
  profileService.getSavedPassword(domain),
);
ipcMain.handle(
  CHANNELS.ADD_BROWSING_HISTORY,
  (_e, url: string, title: string) =>
    profileService.addBrowsingHistory(url, title),
);
ipcMain.handle(CHANNELS.GET_BROWSING_HISTORY, (_e, limit?: number) =>
  profileService.getBrowsingHistory(limit),
);
ipcMain.handle(CHANNELS.SET_PREFERENCE, (_e, key: string, value: any) =>
  profileService.setPreference(key, value),
);
ipcMain.handle(CHANNELS.GET_PREFERENCE, (_e, key: string) =>
  profileService.getPreference(key),
);

profileService.on("api-key-changed", ({ service, key }) => {
  BrowserWindow.getAllWindows().forEach(window => {
    window.webContents.send("profile:api-key-changed", { service, key });
  });
});
