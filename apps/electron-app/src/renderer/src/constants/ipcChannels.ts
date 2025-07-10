export const IPC_CHANNELS = {
  CHAT_STREAM_RESPONSE_SETUP: "chat-stream-response-setup",
  CHAT_STREAM_REQUEST: "chat-stream-request",
  AGENT_PROGRESS_UPDATE: "agent-progress-update",
  ZESTUND_SET_STATE: "zustand-setState",
  TAB_UPDATE: "tab-update",
  TAB_SWITCH: "tab-switch",
  GET_ACTIVE_TAB: "get-active-tab",
  // Gmail OAuth channels
  GMAIL_CHECK_AUTH: "gmail-check-auth",
  GMAIL_START_AUTH: "gmail-start-auth",
  GMAIL_CLEAR_AUTH: "gmail-clear-auth",
  GMAIL_AUTH_SUCCESS: "gmail-auth-success",
  // Tray control channels
  TRAY_CREATE: "tray:create",
  TRAY_DESTROY: "tray:destroy",
  TRAY_IS_VISIBLE: "tray:is-visible",
  // Password paste channels
  PASSWORD_PASTE_FOR_ACTIVE_TAB: "password:paste-for-active-tab",
  PASSWORD_PASTE_FOR_DOMAIN: "password:paste-for-domain",
  // Hotkey control channels
  HOTKEYS_GET_PASSWORD_PASTE: "hotkeys:get-password-paste",
  HOTKEYS_SET_PASSWORD_PASTE: "hotkeys:set-password-paste",
  HOTKEYS_GET_REGISTERED: "hotkeys:get-registered",
  // Add other IPC channel constants here
};
