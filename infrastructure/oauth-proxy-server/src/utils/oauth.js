import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

export class OAuthManager {
  constructor() {
    // Validate required environment variables
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID environment variable is required');
    }
    if (!process.env.GOOGLE_CLIENT_SECRET) {
      throw new Error('GOOGLE_CLIENT_SECRET environment variable is required');
    }
    if (!process.env.GOOGLE_REDIRECT_URI) {
      throw new Error('GOOGLE_REDIRECT_URI environment variable is required');
    }

    // OAuth2Client initialized successfully

    this.oauth2Client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );
    
    this.scopes = [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.compose',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.modify'
    ];
  }

  generatePKCE() {
    const verifier = crypto.randomBytes(64).toString('base64url');
    const challenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');
    
    return { verifier, challenge };
  }

  generateState() {
    return crypto.randomBytes(32).toString('base64url');
  }

  getAuthUrl(state, codeChallenge) {
    const authUrlParams = {
      access_type: 'offline',
      scope: this.scopes,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'consent'
    };
    
    // Generate auth URL with PKCE parameters
    
    const authUrl = this.oauth2Client.generateAuthUrl(authUrlParams);
    
    // Auth URL generated successfully
    
    return authUrl;
  }

  async exchangeCodeForTokens(code, codeVerifier) {
    try {
      const { tokens } = await this.oauth2Client.getToken({
        code,
        codeVerifier
      });
      
      return {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        scope: tokens.scope,
        token_type: tokens.token_type
      };
    } catch (error) {
      throw new Error(`Token exchange failed: ${error.message}`);
    }
  }

  validateState(sessionState, receivedState) {
    if (!sessionState || !receivedState) {
      return false;
    }
    return sessionState === receivedState;
  }
}