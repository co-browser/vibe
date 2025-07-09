export interface GmailTokensRequestMessage {
  type: "gmail-tokens-request";
}

export interface GmailTokensResponseMessage {
  type: "gmail-tokens-response";
  tokens?: any; // Replace `any` with concrete TokenData when shared
  error?: string;
}

export type GmailIPCMessage =
  | GmailTokensRequestMessage
  | GmailTokensResponseMessage;
