# Web Dashboard Deep-Link Integration

This document provides example code for integrating deep-link auto-login from your web dashboard to the Vibe Electron app.

## Overview

The deep-link integration allows users who are logged into your web dashboard to automatically authenticate in the Electron app by clicking a button. The flow works as follows:

1. User is authenticated in your web dashboard
2. User clicks "Open Desktop App" button
3. Web dashboard generates a deep-link with authentication token
4. Electron app opens and automatically logs the user in
5. User can immediately access agent features

## Implementation Examples

### React Web Dashboard Example

```tsx
// components/DesktopAppLauncher.tsx
import React, { useState } from 'react';
import { useAuth } from './hooks/useAuth'; // Your auth hook

interface DesktopAppLauncherProps {
  className?: string;
}

export function DesktopAppLauncher({ className }: DesktopAppLauncherProps) {
  const { user, isAuthenticated, getAccessToken } = useAuth();
  const [isLaunching, setIsLaunching] = useState(false);

  const launchDesktopApp = async () => {
    if (!isAuthenticated || !user) {
      console.error('User not authenticated');
      return;
    }

    try {
      setIsLaunching(true);

      // Get current user's access token
      const accessToken = await getAccessToken();
      
      if (!accessToken) {
        throw new Error('Failed to get access token');
      }

      // Generate deep-link URL
      const deepLinkUrl = generateAuthDeepLink({
        userId: user.id,
        email: user.email,
        accessToken: accessToken,
      });

      console.log('🚀 Launching desktop app with deep-link:', deepLinkUrl);

      // Open the deep-link
      window.location.href = deepLinkUrl;

      // Optional: Show success message
      showSuccessMessage('Desktop app launched! Check your taskbar.');

    } catch (error) {
      console.error('Failed to launch desktop app:', error);
      showErrorMessage('Failed to launch desktop app. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  // Check if desktop app is likely installed
  const checkDesktopAppInstalled = () => {
    // This is a best-effort check - not 100% reliable
    return navigator.userAgent.includes('Windows') || 
           navigator.userAgent.includes('Mac') || 
           navigator.userAgent.includes('Linux');
  };

  if (!isAuthenticated) {
    return null; // Don't show if user not logged in
  }

  return (
    <div className={className}>
      <button
        onClick={launchDesktopApp}
        disabled={isLaunching}
        className="desktop-app-launcher-btn"
      >
        {isLaunching ? (
          <>
            <span className="spinner" />
            Launching...
          </>
        ) : (
          <>
            <DesktopIcon />
            Open Desktop App
          </>
        )}
      </button>
      
      {checkDesktopAppInstalled() && (
        <p className="help-text">
          Don't have the desktop app? 
          <a href="/download" target="_blank">Download here</a>
        </p>
      )}
    </div>
  );
}

// Utility functions
function generateAuthDeepLink({ userId, email, accessToken }: {
  userId: string;
  email?: string;
  accessToken: string;
}): string {
  const params = new URLSearchParams({
    token: accessToken,
    userId: userId,
  });

  if (email) {
    params.set('email', email);
  }

  return `vibe://auth?${params.toString()}`;
}

function showSuccessMessage(message: string) {
  // Implement your notification system
  console.log('✅', message);
}

function showErrorMessage(message: string) {
  // Implement your notification system
  console.error('❌', message);
}

function DesktopIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7l-2 3v1h8v-1l-2-3h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 12H3V4h18v10z"/>
    </svg>
  );
}
```

### Next.js API Route Example

```typescript
// pages/api/desktop-app/auth-link.ts
import { NextApiRequest, NextApiResponse } from 'next';
import jwt from 'jsonwebtoken';
import { verifyAuthToken } from '../../../lib/auth';

interface AuthLinkRequest {
  action?: 'auth' | 'open';
  page?: string;
  tabId?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Verify user authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.substring(7);
    const user = await verifyAuthToken(token);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { action = 'auth', page, tabId }: AuthLinkRequest = req.body;

    let deepLinkUrl: string;

    if (action === 'auth') {
      // Generate authentication deep-link
      const authToken = jwt.sign(
        {
          userId: user.id,
          email: user.email,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
        },
        process.env.JWT_SECRET!
      );

      const params = new URLSearchParams({
        token: authToken,
        userId: user.id,
      });

      if (user.email) {
        params.set('email', user.email);
      }

      deepLinkUrl = `vibe://auth?${params.toString()}`;
      
    } else if (action === 'open') {
      // Generate navigation deep-link
      const params = new URLSearchParams();
      
      if (page) params.set('page', page);
      if (tabId) params.set('tabId', tabId);

      const query = params.toString();
      deepLinkUrl = `vibe://open${query ? `?${query}` : ''}`;
      
    } else {
      return res.status(400).json({ error: 'Invalid action' });
    }

    res.status(200).json({
      success: true,
      deepLinkUrl,
      user: {
        id: user.id,
        email: user.email,
      }
    });

  } catch (error) {
    console.error('Desktop app auth link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}
```

### Vanilla JavaScript Example

```html
<!-- For non-React applications -->
<!DOCTYPE html>
<html>
<head>
    <title>Web Dashboard</title>
</head>
<body>
    <div id="dashboard">
        <h1>Welcome to Vibe Dashboard</h1>
        
        <div id="desktop-launcher" style="display: none;">
            <button id="launch-desktop-btn" class="btn-primary">
                🖥️ Open Desktop App
            </button>
            <p class="help-text">
                Launch the desktop app with your current session
            </p>
        </div>
    </div>

    <script>
        class DesktopAppLauncher {
            constructor() {
                this.launchBtn = document.getElementById('launch-desktop-btn');
                this.container = document.getElementById('desktop-launcher');
                
                this.init();
            }

            init() {
                // Check if user is authenticated
                if (this.isUserAuthenticated()) {
                    this.container.style.display = 'block';
                    this.launchBtn.addEventListener('click', this.handleLaunch.bind(this));
                }
            }

            isUserAuthenticated() {
                // Check your authentication state
                const token = localStorage.getItem('authToken');
                return token && !this.isTokenExpired(token);
            }

            isTokenExpired(token) {
                try {
                    const payload = JSON.parse(atob(token.split('.')[1]));
                    return payload.exp * 1000 < Date.now();
                } catch {
                    return true;
                }
            }

            async handleLaunch() {
                try {
                    this.launchBtn.disabled = true;
                    this.launchBtn.textContent = '🚀 Launching...';

                    const response = await fetch('/api/desktop-app/auth-link', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                        },
                        body: JSON.stringify({ action: 'auth' })
                    });

                    const data = await response.json();

                    if (data.success) {
                        window.location.href = data.deepLinkUrl;
                        this.showMessage('Desktop app launched!', 'success');
                    } else {
                        throw new Error(data.error || 'Failed to launch');
                    }

                } catch (error) {
                    console.error('Launch failed:', error);
                    this.showMessage('Failed to launch desktop app', 'error');
                } finally {
                    this.launchBtn.disabled = false;
                    this.launchBtn.textContent = '🖥️ Open Desktop App';
                }
            }

            showMessage(message, type) {
                const messageEl = document.createElement('div');
                messageEl.className = `message ${type}`;
                messageEl.textContent = message;
                document.body.appendChild(messageEl);

                setTimeout(() => {
                    messageEl.remove();
                }, 3000);
            }
        }

        // Initialize when DOM is ready
        document.addEventListener('DOMContentLoaded', () => {
            new DesktopAppLauncher();
        });
    </script>

    <style>
        .btn-primary {
            background: #6366f1;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .btn-primary:hover {
            background: #5855eb;
        }

        .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .help-text {
            color: #666;
            font-size: 14px;
            margin-top: 8px;
        }

        .message {
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            font-weight: 500;
            z-index: 1000;
        }

        .message.success {
            background: #10b981;
            color: white;
        }

        .message.error {
            background: #ef4444;
            color: white;
        }
    </style>
</body>
</html>
```

## Security Considerations

### Token Security

1. **Short-lived tokens**: Use tokens with short expiration times (recommended: 1-24 hours)
2. **Token validation**: Always validate tokens on the server side
3. **HTTPS only**: Only generate deep-links over HTTPS connections
4. **Rate limiting**: Implement rate limiting for token generation

### Example Token Validation

```typescript
// lib/auth/tokenValidation.ts
import jwt from 'jsonwebtoken';

interface TokenPayload {
  userId: string;
  email?: string;
  iat: number;
  exp: number;
}

export function createAuthToken(user: { id: string; email?: string }): string {
  const payload: Omit<TokenPayload, 'iat' | 'exp'> = {
    userId: user.id,
    email: user.email,
  };

  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: '24h',
    issuer: 'vibe-dashboard',
    audience: 'vibe-desktop',
  });
}

export function validateAuthToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: 'vibe-dashboard',
      audience: 'vibe-desktop',
    }) as TokenPayload;

    return decoded;
  } catch (error) {
    console.error('Token validation failed:', error);
    return null;
  }
}
```

## Testing the Integration

### Testing Checklist

1. **User Authentication**
   - ✅ User is logged into web dashboard
   - ✅ Valid access token is available
   - ✅ Token has not expired

2. **Deep-Link Generation**
   - ✅ Deep-link URL is properly formatted
   - ✅ All required parameters are included
   - ✅ URL encoding is correct

3. **Desktop App Response**
   - ✅ Desktop app opens when deep-link is clicked
   - ✅ Authentication is processed correctly
   - ✅ User is logged in automatically
   - ✅ Agent features are accessible

### Manual Testing

```bash
# Test the deep-link manually
open "vibe://auth?token=your_jwt_token&userId=user_123&email=user@example.com"

# Test navigation deep-link
open "vibe://open?page=chat"
```

## Troubleshooting

### Common Issues

1. **Deep-link not opening app**
   - Ensure app is installed and registered
   - Check protocol registration in electron-builder config
   - Verify app is not running as different user

2. **Authentication fails**
   - Verify token is valid and not expired
   - Check token format (should be valid JWT)
   - Ensure user ID matches expected format

3. **App opens but doesn't authenticate**
   - Check main process logs for authentication errors
   - Verify IPC communication is working
   - Check for authentication state sync issues

### Debug Commands

```bash
# Check if protocol is registered (Windows)
reg query "HKEY_CLASSES_ROOT\vibe"

# Check if protocol is registered (macOS)
/System/Library/Frameworks/CoreServices.framework/Versions/A/Frameworks/LaunchServices.framework/Versions/A/Support/lsregister -dump | grep vibe

# Test protocol handling
node -e "console.log(process.argv)" vibe://auth?token=test
```

---

This integration provides a seamless authentication experience between your web dashboard and Electron app, allowing users to transition from web to desktop without re-entering credentials.