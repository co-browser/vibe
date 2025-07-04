# Vibe Browser Deployment Checklist

## Pre-Deployment Steps

### 1. Environment Configuration
- [ ] Copy `.env.example` to `.env`
- [ ] Set `OPENAI_API_KEY` (required)
- [ ] Set `TURBOPUFFER_API_KEY` (required for RAG)
- [ ] Configure `USE_LOCAL_RAG_SERVER` (true/false)
- [ ] Set `RAG_SERVER_URL` if using cloud RAG
- [ ] Set `SENTRY_DSN` for error tracking (optional)

### 2. Build Prerequisites
- [ ] Node.js >= 18.0.0
- [ ] pnpm >= 9.0.0
- [ ] Clean install: `pnpm install --frozen-lockfile`

### 3. Production Build Commands

#### macOS
```bash
pnpm build:mac
```

For signed/notarized builds, set:
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

#### Windows
```bash
pnpm build:win
```

#### Linux
```bash
pnpm build:linux
```

### 4. Build Output
- macOS: `apps/electron-app/dist/*.dmg`
- Windows: `apps/electron-app/dist/*.exe`
- Linux: `apps/electron-app/dist/*.AppImage`

## Security Features Enabled

✅ Content Security Policy (CSP)
✅ Sandbox mode for all windows
✅ Encrypted storage for sensitive data
✅ Permission restrictions (camera, microphone denied)
✅ Navigation protection
✅ Conditional remote debugging (DEBUG_CDP env var)

## Production Configuration

### Required Services
- OpenAI API for AI features
- Turbopuffer for vector storage (RAG)
- Gmail credentials JSON file (for Gmail MCP server)

### Optional Services
- Sentry for error tracking
- Custom RAG server endpoint

## Post-Build Verification

1. Test application launch
2. Verify AI chat functionality
3. Test tab extraction features
4. Verify Gmail integration (if configured)
5. Check memory/RAG features
6. Verify all security policies are active

## Distribution

### Code Signing
- macOS: Automatic with Apple Developer credentials
- Windows: Requires code signing certificate
- Linux: AppImage is self-contained

### Auto-Updates
Configure in `electron-builder.js`:
- Set proper `publish` configuration
- Update server endpoint for releases