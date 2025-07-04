/**
 * AuthTokenManager - Singleton class for managing authentication tokens
 *
 * This class provides a centralized, secure way to manage authentication tokens
 * in the Electron application. It ensures that only one instance exists throughout
 * the application lifecycle and provides methods to safely store, retrieve, and
 * clear authentication tokens.
 */
import { createLogger } from "@vibe/shared-types";
import { getSecureStorage } from "./secure-storage";

interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expiry_date?: number;
}

export class AuthTokenManager {
  private static instance: AuthTokenManager;
  private authToken: string | null = null;
  private secureStorage = getSecureStorage();
  private logger = createLogger("AuthTokenManager");

  /**
   * Private constructor to prevent direct instantiation
   * Use AuthTokenManager.getInstance() instead
   */
  private constructor() {}

  /**
   * Gets the singleton instance of AuthTokenManager
   * @returns {AuthTokenManager} The singleton instance
   */
  public static getInstance(): AuthTokenManager {
    if (!AuthTokenManager.instance) {
      AuthTokenManager.instance = new AuthTokenManager();
    }
    return AuthTokenManager.instance;
  }

  /**
   * Sets the authentication token
   * @param {string} token - The authentication token to store
   */
  public setToken(token: string): void {
    this.authToken = token;
  }

  /**
   * Retrieves the stored authentication token
   * @returns {string | null} The stored token or null if not set
   */
  public getToken(): string | null {
    return this.authToken;
  }

  /**
   * Clears the stored authentication token
   * This should be called when the user logs out or the token expires
   */
  public clearToken(): void {
    this.authToken = null;
  }

  /**
   * Checks if an authentication token is currently stored
   * @returns {boolean} True if a token exists, false otherwise
   */
  public hasToken(): boolean {
    return this.authToken !== null;
  }



  async getOpenAIKey(): Promise<string | null> {
    return await this.secureStorage.get("openai_api_key");
  }

  async setOpenAIKey(apiKey: string): Promise<void> {
    await this.secureStorage.set("openai_api_key", apiKey);
    this.logger.info("OpenAI API key stored securely");
  }

  async clearOpenAIKey(): Promise<void> {
    await this.secureStorage.delete("openai_api_key");
    this.logger.info("OpenAI API key cleared");
  }

  async getGmailTokens(): Promise<GmailTokens | null> {
    const tokensStr = await this.secureStorage.get("gmail_tokens");
    if (tokensStr) {
      try {
        return JSON.parse(tokensStr) as GmailTokens;
      } catch (error) {
        this.logger.error("Failed to parse Gmail tokens", { error });
        return null;
      }
    }
    return null;
  }

  async setGmailTokens(tokens: GmailTokens): Promise<void> {
    await this.secureStorage.set("gmail_tokens", JSON.stringify(tokens));
    this.logger.info("Gmail tokens stored securely");
  }

  async clearGmailTokens(): Promise<void> {
    await this.secureStorage.delete("gmail_tokens");
    this.logger.info("Gmail tokens cleared");
  }

  async clearAllTokens(): Promise<void> {
    await this.clearOpenAIKey();
    await this.clearGmailTokens();
    this.logger.info("All tokens cleared");
  }
}
