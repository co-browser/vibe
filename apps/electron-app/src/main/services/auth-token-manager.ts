/**
 * AuthTokenManager - Singleton class for managing authentication tokens
 *
 * This class provides a centralized, secure way to manage authentication tokens
 * in the Electron application. It ensures that only one instance exists throughout
 * the application lifecycle and provides methods to safely store, retrieve, and
 * clear authentication tokens.
 */
export class AuthTokenManager {
  private static instance: AuthTokenManager;
  private authToken: string | null = null;

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
}
