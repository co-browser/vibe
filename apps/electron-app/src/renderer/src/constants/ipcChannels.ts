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
  // Password import channels
  PASSWORD_IMPORT_START: "password-import-start",
  PASSWORD_IMPORT_PROGRESS: "password-import-progress",
  PASSWORD_IMPORT_COMPLETE: "password-import-complete",
  PASSWORD_IMPORT_ERROR: "password-import-error",
  // Add other IPC channel constants here
};
