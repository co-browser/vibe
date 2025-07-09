export interface GmailTokensRequestMessage {
  type: "gmail-tokens-request";
}

export interface GmailTokensResponseMessage {
  type: "gmail-tokens-response";
  tokens?: any; // Replace `any` with concrete TokenData when shared
  error?: string;
}

export interface GmailTokensUpdateMessage {
  type: "gmail-tokens-update";
  tokens: any; // Replace with TokenData when shared
}

export type GmailIPCMessage =
  | GmailTokensRequestMessage
  | GmailTokensResponseMessage
  | GmailTokensUpdateMessage;
