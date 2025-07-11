import type { Request } from 'express';

interface TokenData {
  access_token: string;
  refresh_token: string;
  expiry_date: number;
  token_type: string;
  scope?: string;
}

/**
 * Token provider for cloud-deployed Gmail MCP server.
 * Reads Gmail OAuth tokens from HTTP headers instead of IPC.
 */
export class CloudTokenProvider {
  private req: Request | null = null;
  
  /**
   * Set the current request to read tokens from
   */
  setRequest(req: Request): void {
    this.req = req;
  }
  
  async getTokens(): Promise<TokenData> {
    if (!this.req) {
      throw new Error('No request context available for cloud token provider');
    }
    
    // Read tokens from custom headers
    const accessToken = this.req.headers['x-gmail-access-token'] as string;
    const refreshToken = this.req.headers['x-gmail-refresh-token'] as string;
    const expiryDate = this.req.headers['x-gmail-token-expiry'] as string;
    const tokenType = this.req.headers['x-gmail-token-type'] as string;
    
    if (!accessToken || !refreshToken || !expiryDate || !tokenType) {
      throw new Error('Gmail OAuth tokens not provided in request headers');
    }
    
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expiry_date: parseInt(expiryDate, 10),
      token_type: tokenType,
    };
  }
  
  /**
   * Update tokens - in cloud mode, we don't persist tokens
   * The client is responsible for updating stored tokens
   */
  async updateTokens(_tokens: Partial<TokenData>): Promise<void> {
    // In cloud mode, we could potentially return updated tokens in response headers
    // For now, just log that tokens were updated
    console.log('[CloudTokenProvider] Token update requested, client should handle persistence');
  }
  
  /**
   * Clear cache - no-op in cloud mode since we don't cache
   */
  clearCache(): void {
    // No caching in cloud mode
  }
}