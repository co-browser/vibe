import { TokenProvider } from './token-provider.js';
import { CloudTokenProvider } from './cloud-token-provider.js';

// Common interface for both providers
export interface ITokenProvider {
  getTokens(): Promise<TokenData>;
  updateTokens(tokens: Partial<TokenData>): Promise<void>;
  clearCache(): void;
}

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

/**
 * Factory to create the appropriate token provider based on environment
 */
export function createTokenProvider(): ITokenProvider {
  const useLocalServer = process.env.USE_LOCAL_GMAIL_SERVER === 'true';
  
  if (useLocalServer) {
    console.log('[TokenProviderFactory] Creating local token provider (IPC-based)');
    return new TokenProvider();
  } else {
    console.log('[TokenProviderFactory] Creating cloud token provider (header-based)');
    return new CloudTokenProvider();
  }
}

/**
 * Get the cloud token provider instance (for setting request context)
 */
export function getCloudTokenProvider(provider: ITokenProvider): CloudTokenProvider | null {
  if (provider instanceof CloudTokenProvider) {
    return provider;
  }
  return null;
}