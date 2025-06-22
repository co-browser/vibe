/**
 * Gmail OAuth types and interfaces
 * Local to electron app - these types are only used within this app
 */

/** Gmail OAuth authentication status */
export interface GmailAuthStatus {
  authenticated: boolean;
  hasOAuthKeys: boolean;
  hasCredentials: boolean;
  error?: string;
}

/** Gmail OAuth authentication result */
export interface GmailAuthResult {
  success: boolean;
  authUrl?: string;
  error?: string;
}

/** Gmail OAuth clear authentication result */
export interface GmailClearResult {
  success: boolean;
  error?: string;
}

/** Gmail OAuth keys structure (from Google Cloud Console) */
export interface GmailOAuthKeys {
  client_id: string;
  client_secret: string;
  redirect_uris: string[];
  auth_uri?: string;
  token_uri?: string;
  auth_provider_x509_cert_url?: string;
}

/** Gmail OAuth credentials file structure */
export interface GmailOAuthCredentials {
  installed?: GmailOAuthKeys;
  web?: GmailOAuthKeys;
}

/** Gmail OAuth tokens from Google */
export interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

/** Gmail API scopes */
export enum GmailScope {
  READONLY = "https://www.googleapis.com/auth/gmail.readonly",
  MODIFY = "https://www.googleapis.com/auth/gmail.modify",
  SEND = "https://www.googleapis.com/auth/gmail.send",
  COMPOSE = "https://www.googleapis.com/auth/gmail.compose",
  FULL_ACCESS = "https://mail.google.com/",
}

/** Gmail OAuth error types */
export enum GmailOAuthError {
  KEYS_NOT_FOUND = "KEYS_NOT_FOUND",
  CREDENTIALS_NOT_FOUND = "CREDENTIALS_NOT_FOUND",
  INVALID_KEYS_FORMAT = "INVALID_KEYS_FORMAT",
  TOKEN_EXCHANGE_FAILED = "TOKEN_EXCHANGE_FAILED",
  VIEWMANAGER_NOT_AVAILABLE = "VIEWMANAGER_NOT_AVAILABLE",
  PORT_IN_USE = "PORT_IN_USE",
  AUTH_TIMEOUT = "AUTH_TIMEOUT",
  REVOCATION_FAILED = "REVOCATION_FAILED",
}