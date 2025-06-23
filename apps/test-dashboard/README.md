# Vibe Test Dashboard

A comprehensive test dashboard for Vibe desktop app authentication and deep-link functionality. This dashboard implements all production-ready features including JWT authentication, rate limiting, token expiration, and cross-platform testing.

## Features

- **🔐 JWT Authentication**: Secure token-based authentication with configurable expiration
- **🛡️ Rate Limiting**: Protection against abuse with configurable limits
- **🔗 Deep-Link Generation**: Generate secure deep-links for desktop app authentication
- **⏰ Token Expiration**: Configurable token expiration (1-24 hours)
- **🌍 Cross-Platform Testing**: Test deep-links on Windows, macOS, and Linux
- **📊 Session Management**: Automatic session cleanup and tracking
- **🎨 Modern UI**: Clean, responsive interface built with Tailwind CSS

## Production Features Implemented

✅ **JWT Secret Configuration**: Secure token signing with configurable secrets  
✅ **Token Expiration**: 1-hour deep-link tokens, 24-hour session tokens  
✅ **Rate Limiting**: 10 tokens/minute, 5 auth attempts/15 minutes  
✅ **Cross-Platform Testing**: Ready for Windows, macOS, Linux testing  
✅ **Secure Headers**: Proper CORS, security headers, and cookie settings  
✅ **Error Handling**: Comprehensive error handling and logging  
✅ **Session Management**: Automatic cleanup and expiration handling  

## Quick Start

### 1. Install Dependencies

```bash
cd apps/test-dashboard
npm install
```

### 2. Environment Setup

Create `.env.local` file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your settings:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Rate Limiting Configuration
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Application Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3001
NEXT_PUBLIC_DESKTOP_PROTOCOL=vibe

# Development Configuration
NODE_ENV=development
```

### 3. Start the Dashboard

```bash
npm run dev
```

The dashboard will be available at: http://localhost:3001

### 4. Start the Electron App

In a separate terminal:

```bash
cd apps/electron-app
npm run dev
```

## Usage

### Login to Dashboard

Use one of the test accounts:
- **test@example.com** / password123
- **admin@example.com** / admin123  
- **demo@vibe.com** / demo123

### Generate Deep-Links

1. Login to the dashboard
2. Fill out the deep-link form (page, tabId, URL are optional)
3. Click "Generate Deep-Link"
4. Use the "🚀 Open Desktop App" button to test

### Test Authentication Flow

1. Generate a deep-link in the dashboard
2. Click "Open Desktop App" - this should launch your Electron app
3. The app should automatically authenticate and navigate to the specified page
4. Verify that agent access is granted without manual login

## API Endpoints

### Authentication

- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout  
- `GET /api/auth/status` - Check authentication status

### Token Generation

- `POST /api/auth/generate-token` - Generate deep-link token

### Request/Response Examples

#### Login Request
```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

#### Generate Token Request
```bash
curl -X POST http://localhost:3001/api/auth/generate-token \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{"page":"chat","tabId":"abc123"}'
```

## Security Configuration

### JWT Settings

- **Secret**: Use a strong, random secret in production
- **Expiration**: 1 hour for deep-link tokens, 24 hours for sessions
- **Issuer/Audience**: Validates token origin and destination

### Rate Limiting

- **Auth Endpoints**: 5 attempts per 15 minutes
- **Token Generation**: 10 requests per minute
- **General Endpoints**: 100 requests per 15 minutes

### Cookie Security

- **HttpOnly**: Prevents XSS attacks
- **Secure**: HTTPS only in production
- **SameSite**: CSRF protection

## Testing Checklist

### ✅ Basic Functionality
- [ ] Login with test accounts
- [ ] Generate deep-link tokens
- [ ] Copy/paste deep-link URLs
- [ ] Test token expiration
- [ ] Test rate limiting

### ✅ Desktop App Integration
- [ ] Deep-link opens Electron app
- [ ] Auto-authentication works
- [ ] Navigation parameters work
- [ ] Agent access granted
- [ ] Session persistence

### ✅ Cross-Platform Testing
- [ ] Windows protocol registration
- [ ] macOS protocol handling
- [ ] Linux desktop integration
- [ ] Browser fallback behavior

### ✅ Security Testing
- [ ] Invalid token rejection
- [ ] Expired token handling
- [ ] Rate limit enforcement
- [ ] Session cleanup
- [ ] Secure cookie settings

## Troubleshooting

### Common Issues

1. **"Module not found" errors**: Run `npm install` in the dashboard directory
2. **Port conflicts**: Change port in package.json if 3001 is in use
3. **Protocol not registered**: Ensure Electron app is built/installed
4. **Token validation fails**: Check JWT_SECRET matches between apps
5. **Rate limiting too strict**: Adjust limits in .env file

### Debug Mode

Enable debug logging:

```env
NODE_ENV=development
DEBUG=vibe:*
```

### Reset Development Data

The dashboard uses in-memory storage. Simply restart the server to reset all users and sessions.

## Development

### File Structure

```
apps/test-dashboard/
├── pages/
│   ├── api/auth/          # Authentication endpoints
│   ├── _app.tsx           # Next.js app configuration
│   └── index.tsx          # Main dashboard page
├── src/
│   ├── lib/               # Utility functions
│   │   ├── jwt.ts         # JWT handling
│   │   ├── rate-limit.ts  # Rate limiting
│   │   └── mock-users.ts  # User management
│   └── styles/
│       └── globals.css    # Global styles
├── .env.example           # Environment template
└── package.json          # Dependencies and scripts
```

### Adding New Features

1. **New API Endpoint**: Add to `pages/api/`
2. **Rate Limiting**: Use `createRateLimit()` middleware
3. **Authentication**: Use `validateAuthToken()` helper
4. **UI Components**: Add to dashboard index page

## Production Deployment

### Environment Variables

Set these in your production environment:

```env
JWT_SECRET=your-production-secret-key-min-32-chars
JWT_EXPIRES_IN=1h
NODE_ENV=production
NEXT_PUBLIC_APP_URL=https://your-dashboard.com
```

### Security Recommendations

1. **Strong JWT Secret**: Use at least 32 random characters
2. **HTTPS Only**: Enable SSL/TLS certificates
3. **Database**: Replace in-memory storage with persistent database
4. **Monitoring**: Add logging and monitoring for security events
5. **Backup**: Regular backup of user data and sessions

## License

This test dashboard is part of the Vibe project and follows the same license terms.