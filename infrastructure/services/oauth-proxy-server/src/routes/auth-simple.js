import express from 'express';
import crypto from 'crypto';
import { OAuthManager } from '../utils/oauth.js';

const router = express.Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'vibe-oauth-proxy',
    timestamp: new Date().toISOString()
  });
});
let oauthManager;

// Initialize OAuthManager lazily
function getOAuthManager() {
  if (!oauthManager) {
    oauthManager = new OAuthManager();
  }
  return oauthManager;
}

// Single endpoint that starts the OAuth flow
router.get('/gmail/authorize', async (req, res) => {
  try {
    const oauthManager = getOAuthManager();
    
    // Generate PKCE parameters
    const { verifier, challenge } = oauthManager.generatePKCE();
    const state = oauthManager.generateState();
    
    // Store in session (session will persist within the same browser context)
    req.session.oauthState = state;
    req.session.codeVerifier = verifier;
    
    // Generate auth URL
    const authUrl = oauthManager.getAuthUrl(state, challenge);
    
    // Redirect directly to Google OAuth
    res.redirect(authUrl);
  } catch (error) {
    console.error('OAuth authorize error:', error);
    res.status(500).send('Failed to start OAuth flow');
  }
});

// OAuth callback - handles the return from Google
router.get('/gmail/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Handle OAuth errors
    if (error) {
      return res.redirect(`/auth/gmail/error?error=${encodeURIComponent(error)}`);
    }
    
    // Validate state
    if (!req.session.oauthState || req.session.oauthState !== state) {
      return res.redirect('/auth/gmail/error?error=invalid_state');
    }
    
    // Exchange code for tokens
    const tokens = await getOAuthManager().exchangeCodeForTokens(
      code,
      req.session.codeVerifier
    );
    
    // Clear session
    req.session.destroy();
    
    // Store tokens temporarily in memory (will be sent via postMessage)
    const tokenId = crypto.randomBytes(16).toString('hex');
    globalThis.pendingTokens = globalThis.pendingTokens || new Map();
    globalThis.pendingTokens.set(tokenId, tokens);
    
    // Clean up after 30 seconds
    setTimeout(() => {
      globalThis.pendingTokens.delete(tokenId);
    }, 30000);
    
    // Redirect to success page with token ID only
    res.redirect(`/auth/gmail/success?tokenId=${tokenId}`);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect('/auth/gmail/error?error=token_exchange_failed');
  }
});

// API endpoint to retrieve tokens
router.post('/gmail/tokens', (req, res) => {
  const { tokenId } = req.body;
  
  if (!tokenId || !globalThis.pendingTokens || !globalThis.pendingTokens.has(tokenId)) {
    return res.status(404).json({ error: 'Token not found or expired' });
  }
  
  const tokens = globalThis.pendingTokens.get(tokenId);
  globalThis.pendingTokens.delete(tokenId);
  
  res.json({ tokens });
});

// Success page
router.get('/gmail/success', (req, res) => {
  const { tokenId } = req.query;
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gmail Authentication Success</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background-color: #ffffff;
          color: #09090b;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        .container {
          text-align: center;
          padding: 48px;
          max-width: 320px;
          width: 90%;
        }
        
        .checkmark {
          width: 40px;
          height: 40px;
          color: #a1a1aa;
          margin: 0 auto 24px;
        }
        
        h1 {
          font-size: 16px;
          font-weight: 500;
          color: #18181b;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        
        p {
          font-size: 14px;
          color: #71717a;
          line-height: 1.5;
        }
        
        @media (prefers-color-scheme: dark) {
          body {
            background-color: #09090b;
          }
          
          h1 {
            color: #fafafa;
          }
          
          p {
            color: #a1a1aa;
          }
          
          .checkmark {
            color: #71717a;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="checkmark" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <h1>Authentication successful</h1>
        <p>You can now close this window and return to Vibe.</p>
      </div>
      <script>
        // Send token ID to parent window or Electron
        const tokenId = '${tokenId}';
        
        // Try multiple methods to communicate back
        if (tokenId) {
          // Method 1: PostMessage to opener (for popup windows)
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth-success',
              tokenId: tokenId
            }, '*');
          }
          
          // Method 2: IPC for Electron WebContents
          if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('oauth-success', { tokenId });
          }
          
          // Method 3: Direct IPC (for some Electron configurations)
          if (typeof window.postMessage === 'function') {
            window.postMessage({
              type: 'oauth-success',
              tokenId: tokenId
            }, '*');
          }
        }
        
        // Try to close the window after 2 seconds
        setTimeout(() => {
          window.close();
        }, 2000);
      </script>
    </body>
    </html>
  `);
});

// Error page
router.get('/gmail/error', (req, res) => {
  const error = req.query.error || 'Unknown error';
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Gmail Authentication Failed</title>
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 100vh;
          background-color: #ffffff;
          color: #09090b;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }
        
        .container {
          text-align: center;
          padding: 48px;
          max-width: 320px;
          width: 90%;
        }
        
        .x-mark {
          width: 40px;
          height: 40px;
          color: #a1a1aa;
          margin: 0 auto 24px;
        }
        
        h1 {
          font-size: 16px;
          font-weight: 500;
          color: #18181b;
          margin-bottom: 8px;
          letter-spacing: -0.01em;
        }
        
        p {
          font-size: 14px;
          color: #71717a;
          line-height: 1.5;
          margin-bottom: 16px;
        }
        
        .error {
          font-size: 12px;
          color: #71717a;
          font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace;
        }
        
        @media (prefers-color-scheme: dark) {
          body {
            background-color: #09090b;
          }
          
          h1 {
            color: #fafafa;
          }
          
          p {
            color: #a1a1aa;
          }
          
          .x-mark {
            color: #71717a;
          }
          
          .error {
            color: #71717a;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <svg class="x-mark" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
        <h1>Authentication failed</h1>
        <p>There was an error during authentication.</p>
        <div class="error">${error}</div>
      </div>
    </body>
    </html>
  `);
});

export default router;