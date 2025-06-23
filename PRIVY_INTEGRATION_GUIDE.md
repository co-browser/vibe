# Privy Authentication Integration Guide

## Overview

This guide documents the complete integration of Privy authentication into the Vibe Electron app to protect all agent interactions and tool calls. The implementation ensures that users must authenticate before accessing any AI agent capabilities.

## Architecture

### Authentication Flow

```
User opens app -> Privy Provider wraps app -> Chat panel opens -> AuthGuard checks authentication -> User logs in -> Main process receives auth state -> Agent calls are allowed
```

### Key Components

1. **Renderer Process (React)**
   - `PrivyAuthProvider`: Wraps the app with Privy authentication
   - `AuthGuard`: Protects chat interface with authentication requirement
   - `UserProfile`: Shows user info and logout functionality
   - `useAuthSync`: Synchronizes auth state with main process

2. **Main Process (Electron)**
   - `auth-verification.ts`: Authentication state management and verification
   - `auth-ipc.ts`: IPC handlers for authentication communication
   - Protected IPC handlers: All agent interactions require authentication

## Files Created/Modified

### New Files

```
apps/electron-app/.env.example
apps/electron-app/src/renderer/src/providers/PrivyAuthProvider.tsx
apps/electron-app/src/renderer/src/components/auth/AuthGuard.tsx
apps/electron-app/src/renderer/src/components/auth/AuthGuard.css
apps/electron-app/src/renderer/src/components/auth/UserProfile.tsx
apps/electron-app/src/renderer/src/components/auth/UserProfile.css
apps/electron-app/src/renderer/src/hooks/useAuthSync.ts
apps/electron-app/src/renderer/src/hooks/useDeepLinkAuth.ts
apps/electron-app/src/main/ipc/auth/auth-verification.ts
apps/electron-app/src/main/ipc/auth/auth-ipc.ts
apps/electron-app/src/main/services/deep-link-service.ts
WEB_DASHBOARD_EXAMPLE.md
```

### Modified Files

```
apps/electron-app/src/renderer/src/App.tsx
apps/electron-app/src/renderer/src/pages/chat/ChatPage.tsx
apps/electron-app/src/renderer/src/components/layout/NavigationBar.tsx
apps/electron-app/src/renderer/src/components/styles/NavigationBar.css
apps/electron-app/src/renderer/src/components/main/MainApp.tsx
apps/electron-app/src/main/ipc/chat/chat-messaging.ts
apps/electron-app/src/main/index.ts
apps/electron-app/electron-builder.js
```

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file from `.env.example`:

```bash
cp apps/electron-app/.env.example apps/electron-app/.env
```

Add your Privy App ID:

```env
VITE_PRIVY_APP_ID=your-privy-app-id-here
```

### 2. Privy Dashboard Setup

1. Visit [Privy Dashboard](https://dashboard.privy.io)
2. Create a new application
3. Configure authentication methods (email, Google, Discord, etc.)
4. Copy your App ID to the `.env` file
5. Configure allowed origins if needed

### 3. Build and Run

```bash
# Install dependencies (already done)
pnpm install

# Development
pnpm dev

# Production build
pnpm build
```

## Features

### Authentication Methods

The integration supports multiple authentication methods:

- Email with OTP
- Google OAuth
- Discord OAuth  
- GitHub OAuth
- Apple OAuth
- Crypto wallets (MetaMask, etc.)
- **Deep-Link Auto-Login**: Automatic authentication from web dashboard

### Deep-Link Auto-Login

Users can be automatically logged into the Electron app from your web dashboard:

1. User is authenticated in web dashboard
2. User clicks "Open Desktop App" button
3. Web dashboard generates deep-link: `vibe://auth?token=jwt&userId=123`
4. Electron app opens and automatically authenticates user
5. User immediately has access to agent features

**Protocol**: `vibe://`
**Auth URL Format**: `vibe://auth?token=<jwt>&userId=<id>&email=<email>`
**Navigation Format**: `vibe://open?page=chat&tabId=abc123`

### Security Features

1. **Main Process Protection**: All agent interactions are verified at the IPC level
2. **Session Management**: Authentication state is tracked per window with 24-hour expiration
3. **Automatic Cleanup**: Auth states are cleaned up when windows close
4. **Error Handling**: Graceful fallback when authentication fails

### User Experience

1. **Beautiful Login UI**: Custom-designed login interface with feature highlights
2. **User Profile**: Displays user info and authentication method in navigation bar
3. **Seamless Integration**: Authentication is transparent once logged in
4. **Responsive Design**: Works across all window sizes

## API Reference

### Main Process Authentication API

```typescript
// Check if a window is authenticated
requireAuth(webContentsId: number): boolean

// Update authentication state
updateAuthState(webContentsId: number, authState: AuthState): void

// Clear authentication
clearAuthState(webContentsId: number): void
```

### IPC Channels

```typescript
AUTH_CHANNELS = {
  UPDATE_AUTH_STATE: "auth:update-state",
  GET_AUTH_STATE: "auth:get-state", 
  LOGOUT: "auth:logout",
  CHECK_AUTH: "auth:check",
}
```

### React Hooks

```typescript
// Sync authentication with main process
useAuthSync(): { ready: boolean, authenticated: boolean, user: User | null }

// Privy hooks (from @privy-io/react-auth)
usePrivy(): { ready: boolean, authenticated: boolean, user: User | null }
useLogin(): { login: () => void }
useLogout(): { logout: () => void }
```

## Configuration Options

### Privy Provider Configuration

```typescript
// In PrivyAuthProvider.tsx
config={{
  appearance: {
    theme: 'dark',
    accentColor: '#6366f1',
  },
  loginMethods: ['email', 'wallet', 'google', 'apple', 'discord', 'github'],
  embeddedWallets: {
    createOnLogin: 'users-without-wallets',
    requireUserPasswordOnCreate: false,
    showWalletUIs: false,
  },
}}
```

### Authentication Timeout

```typescript
// In auth-verification.ts
const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000; // 24 hour session timeout
```

## Error Handling

### Common Error Scenarios

1. **Missing Privy App ID**: Clear error message with configuration instructions
2. **Authentication Timeout**: Automatic cleanup and re-authentication prompt
3. **IPC Communication Failure**: Graceful fallback with error logging
4. **Network Issues**: Privy handles authentication failures automatically

### Debugging

Enable debug logging in development:

```typescript
// Check browser console for authentication events
// Check main process logs for IPC authentication events
```

## Testing

### Manual Testing Checklist

- [ ] App starts with login prompt when chat panel opens
- [ ] Email authentication works
- [ ] Social logins work (Google, Discord, etc.)
- [ ] User profile shows in navigation bar after login
- [ ] Agent interactions work after authentication
- [ ] Agent interactions are blocked without authentication
- [ ] Logout clears authentication and blocks agent access
- [ ] Authentication persists across app restarts (for 24 hours)
- [ ] Multiple windows handle authentication independently

### Security Testing

- [ ] Direct IPC calls to agent are blocked without authentication
- [ ] Authentication state cannot be spoofed from renderer
- [ ] Session timeout works correctly
- [ ] Window closure cleans up authentication state

## Troubleshooting

### Common Issues

1. **"Configuration Error" message**
   - Ensure `VITE_PRIVY_APP_ID` is set in `.env` file
   - Verify App ID is correct

2. **Login modal doesn't appear**
   - Check Privy dashboard configuration
   - Verify allowed origins
   - Check browser console for errors

3. **Agent calls still blocked after login**
   - Check main process logs for authentication state
   - Verify `useAuthSync` hook is running
   - Check IPC communication

4. **Authentication doesn't persist**
   - Verify session storage is working
   - Check for authentication timeout (24 hours)

### Log Locations

- Renderer process: Browser DevTools Console
- Main process: Terminal/Console where app was started
- Look for logs with `[auth-verification]` and `[auth-ipc]` prefixes

## Future Enhancements

### Potential Improvements

1. **Role-Based Access**: Different authentication levels for different features
2. **Audit Logging**: Track all authenticated actions for security
3. **Multi-Factor Authentication**: Additional security layer for sensitive operations
4. **Session Sharing**: Share authentication across multiple app instances
5. **Offline Mode**: Cache authentication for offline usage

### Integration Opportunities

1. **Backend Integration**: Connect to your own user management system
2. **Analytics**: Track authentication events and user behavior
3. **Team Management**: Support for team accounts and shared access
4. **API Access**: Extend authentication to API calls and external services

## Security Considerations

### Best Practices Implemented

1. **Separation of Concerns**: Authentication verification happens in main process
2. **Minimal Trust**: Renderer can't bypass authentication checks
3. **Session Management**: Automatic timeout and cleanup
4. **Error Handling**: No sensitive information leaked in errors

### Recommendations

1. **Regular Updates**: Keep Privy SDK updated for security patches
2. **Monitoring**: Monitor authentication logs for suspicious activity
3. **Configuration**: Regularly review Privy dashboard settings
4. **Testing**: Include authentication in automated testing

## Support

### Resources

- [Privy Documentation](https://docs.privy.io)
- [Privy React SDK](https://docs.privy.io/guide/react)
- [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)

### Community

- Privy Discord: Official support channel
- GitHub Issues: Report bugs and request features
- Documentation: This integration guide

---

**Note**: This integration provides a secure foundation for protecting agent interactions. Customize the authentication flow and UI to match your specific requirements and branding.