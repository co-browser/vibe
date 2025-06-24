import { safeStorage, systemPreferences } from 'electron';
import Store from 'electron-store';
import { createLogger } from "@vibe/shared-types";

const logger = createLogger("DesktopStore");

export enum VibeDict {
  UpdateSettings = 'updateSettings',
  Theme = 'theme',
  EncryptedData = 'EncryptedData',
  Language = 'language',
  DisableKeyboardShortcuts = 'disableKeyboardShortcuts',
  ASCFile = 'ascFile',
  UpdateBuildNumber = 'updateBuildNumber',
  WinBounds = 'winBounds',
  DevTools = 'devTools',
}

export type IDesktopVibeUpdateSettings = {
  useTestFeedUrl: boolean;
};

export type IDesktopVibeMap = {
  [VibeDict.WinBounds]: Electron.Rectangle;
  [VibeDict.UpdateSettings]: IDesktopVibeUpdateSettings;
  [VibeDict.DevTools]: boolean;
  [VibeDict.Theme]: string;
  [VibeDict.EncryptedData]: Record<string, string>;
  [VibeDict.DisableKeyboardShortcuts]: {
    disableAllShortcuts: boolean;
  };
  [VibeDict.ASCFile]: string;
  [VibeDict.UpdateBuildNumber]: string;
};

const store = new Store<IDesktopVibeMap>({ name: 'cobrowser' });

export const instance = store;

export const clear = () => {
  store.clear();
};

export const getUpdateSettings = () =>
  store.get(VibeDict.UpdateSettings, {
    useTestFeedUrl: false,
  });

export const setUpdateSettings = (
  updateSettings: IDesktopVibeUpdateSettings,
): void => {
  store.set(VibeDict.UpdateSettings, updateSettings);
};

export const getSecureItem = (key: string) => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error('safeStorage is not available');
    return undefined;
  }
  const item = store.get(VibeDict.EncryptedData, {});
  const value = item[key];
  if (value) {
    try {
      const result = safeStorage.decryptString(Buffer.from(value, 'hex'));
      return result;
    } catch {
      logger.error(`failed to decrypt ${key}`);
      return undefined;
    }
  }
  return undefined;
};

export const setSecureItem = (key: string, value: string): void => {
  const available = safeStorage.isEncryptionAvailable();
  if (!available) {
    logger.error('safeStorage is not available');
    return;
  }
  try {
    const items = store.get(VibeDict.EncryptedData, {});
    items[key] = safeStorage.encryptString(value).toString('hex');
    store.set(VibeDict.EncryptedData, items);
  } catch {
    logger.error(`failed to encrypt ${key}`);
  }
};

export const deleteSecureItem = (key: string) => {
  const items = store.get(VibeDict.EncryptedData, {});
  delete items[key];
  store.set(VibeDict.EncryptedData, items);
};

export const setUpdateBuildNumber = (buildNumber: string) => {
  store.set(VibeDict.UpdateBuildNumber, buildNumber);
};

export const getUpdateBuildNumber = () =>
  store.get(VibeDict.UpdateBuildNumber, '');

export const clearUpdateBuildNumber = () => {
  store.delete(VibeDict.UpdateBuildNumber);
};

// Additional utility functions for other store keys
export const getTheme = () => store.get(VibeDict.Theme, 'system');
export const setTheme = (theme: string) => store.set(VibeDict.Theme, theme);

export const getLanguage = () => store.get(VibeDict.Language, 'en');
export const setLanguage = (language: string) => store.set(VibeDict.Language, language);

export const getDevTools = () => store.get(VibeDict.DevTools, false);
export const setDevTools = (enabled: boolean) => store.set(VibeDict.DevTools, enabled);

export const getWinBounds = () => store.get(VibeDict.WinBounds);
export const setWinBounds = (bounds: Electron.Rectangle) => store.set(VibeDict.WinBounds, bounds);

export const getKeyboardShortcutsDisabled = () => 
  store.get(VibeDict.DisableKeyboardShortcuts, { disableAllShortcuts: false });
export const setKeyboardShortcutsDisabled = (disabled: { disableAllShortcuts: boolean }) => 
  store.set(VibeDict.DisableKeyboardShortcuts, disabled);

export const getASCFile = () => store.get(VibeDict.ASCFile, '');
export const setASCFile = (ascFile: string) => store.set(VibeDict.ASCFile, ascFile);

export const NewUserStore = async (reason: string = 'Securely Encrypt Local Data'): Promise<boolean> => {
  try {
    // Check if Touch ID is available
    if (!systemPreferences.canPromptTouchID()) {
      logger.warn('Touch ID is not available on this system');
      return false;
    }

    // Prompt for Touch ID authentication
    try {
      await systemPreferences.promptTouchID(reason);
      // If we reach here, authentication was successful
    } catch (authError) {
      logger.warn('Touch ID authentication failed or was cancelled:', authError);
      return false;
    }

    // Create a random password using system time and other randomness
    const timestamp = Date.now().toString();
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const randomHex = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    const randomPassword = `${timestamp}-${randomHex}-${Math.random().toString(36).substring(2)}`;

    // Store the password securely in our encrypted storage
    setSecureItem('master_password', randomPassword);

    // Also store a flag indicating Touch ID was used for initialization
    setSecureItem('touch_id_initialized', 'true');

    logger.info('New user store initialized successfully with Touch ID authentication');
    return true;

  } catch (error) {
    logger.error('Error in NewUserStore:', error);
    return false;
  }
}; 