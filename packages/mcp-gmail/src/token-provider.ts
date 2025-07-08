import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

export class TokenProvider {
  private tokenCache: TokenData | null = null;
  private cacheExpiry: number = 0;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // File paths for fallback
  private readonly CONFIG_DIR = path.join(os.homedir(), '.gmail-mcp');
  private readonly CREDENTIALS_PATH = path.join(this.CONFIG_DIR, 'credentials.json');

  async getTokens(): Promise<TokenData> {
    // Check cache first
    if (this.tokenCache && Date.now() < this.cacheExpiry) {
      return this.tokenCache;
    }

    try {
      // Try 1: Get from StorageService via IPC (cloud OAuth)
      const cloudTokens = await this.getFromStorage();
      if (cloudTokens) {
        this.tokenCache = cloudTokens;
        this.cacheExpiry = Date.now() + this.CACHE_TTL;
        return cloudTokens;
      }
    } catch (error) {
      console.log('Failed to get tokens from storage, trying local file:', error.message);
    }

    // Try 2: Get from local file system (existing method)
    const localTokens = await this.getFromFile();
    if (localTokens) {
      this.tokenCache = localTokens;
      this.cacheExpiry = Date.now() + this.CACHE_TTL;
      return localTokens;
    }

    throw new Error('No Gmail tokens found. Please authenticate first.');
  }

  private async getFromStorage(): Promise<TokenData | null> {
    try {
      // We're running in a child process, communicate via process messaging
      return await this.getFromStorageViaParent();
    } catch (error) {
      console.error('Error getting tokens from storage:', error);
      return null;
    }
  }

  private async getFromStorageViaParent(): Promise<TokenData | null> {
    try {
      // When running as a child process, communicate via process messaging
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Timeout getting tokens from parent process'));
        }, 5000);

        const handler = (message: any) => {
          clearTimeout(timeout);
          process.removeListener('gmail-tokens-response' as any, handler);
          
          if (message.error) {
            reject(new Error(message.error));
          } else if (message.tokens && this.isValidTokenData(message.tokens)) {
            resolve(message.tokens);
          } else {
            resolve(null);
          }
        };

        // Listen for the custom event instead of standard message
        process.on('gmail-tokens-response' as any, handler);
        
        // Send request to parent
        if (process.send) {
          console.log('[TokenProvider] Sending gmail-tokens-request to parent process');
          process.send({ type: 'gmail-tokens-request' });
        } else {
          console.error('[TokenProvider] No IPC channel available (process.send is undefined)');
          reject(new Error('No IPC channel available'));
        }
      });
    } catch (error) {
      console.error('Error communicating with parent process:', error);
      return null;
    }
  }

  private async getFromFile(): Promise<TokenData | null> {
    try {
      // Check if credentials file exists
      if (!fs.existsSync(this.CREDENTIALS_PATH)) {
        return null;
      }

      // Read and parse credentials
      const credentialsContent = fs.readFileSync(this.CREDENTIALS_PATH, 'utf8');
      const credentials = JSON.parse(credentialsContent);

      if (this.isValidTokenData(credentials)) {
        return credentials;
      }
      
      return null;
    } catch (error) {
      console.error('Error reading local credentials:', error);
      return null;
    }
  }

  private isValidTokenData(data: any): data is TokenData {
    return (
      data &&
      typeof data.access_token === 'string' &&
      typeof data.refresh_token === 'string' &&
      typeof data.expiry_date === 'number' &&
      typeof data.token_type === 'string'
    );
  }

  // Update tokens (called when tokens are refreshed)
  async updateTokens(tokens: Partial<TokenData>): Promise<void> {
    // Get current tokens
    const currentTokens = await this.getTokens();
    
    // Merge with new tokens
    const updatedTokens: TokenData = {
      ...currentTokens,
      ...tokens,
      expiry_date: tokens.expiry_date || currentTokens.expiry_date
    };

    // Update cache
    this.tokenCache = updatedTokens;
    this.cacheExpiry = Date.now() + this.CACHE_TTL;

    try {
      // Send to parent process
      process.send?.({
        type: 'gmail-tokens-update',
        tokens: updatedTokens
      });
    } catch (error) {
      console.error('Failed to update tokens in storage:', error);
      // Fall back to file update if we have local credentials
      if (fs.existsSync(this.CREDENTIALS_PATH)) {
        fs.writeFileSync(this.CREDENTIALS_PATH, JSON.stringify(updatedTokens, null, 2));
      }
    }
  }

  // Clear token cache (useful for testing or forced refresh)
  clearCache(): void {
    this.tokenCache = null;
    this.cacheExpiry = 0;
  }
}