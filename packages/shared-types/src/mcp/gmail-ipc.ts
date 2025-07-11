import type { GmailTokens } from "../gmail/index.js";

export interface GmailTokensRequestMessage {
  type: "gmail-tokens-request";
}

export interface GmailTokensResponseMessage {
  type: "gmail-tokens-response";
  tokens?: GmailTokens;
  error?: string;
}

export interface GmailTokensUpdateMessage {
  type: "gmail-tokens-update";
  tokens: GmailTokens;
}

export type GmailIPCMessage =
  | GmailTokensRequestMessage
  | GmailTokensResponseMessage
  | GmailTokensUpdateMessage;
