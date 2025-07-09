# Infrastructure Services

This directory contains standalone infrastructure services that are deployed independently from the main Vibe application.

## OAuth Proxy Server

A secure OAuth proxy server that handles Gmail authentication for Vibe users without requiring them to set up their own Google Cloud credentials.

**Key Features:**
- OAuth 2.0 with PKCE flow
- Secure session management
- Rate limiting
- CORS protection

**Build & Deploy:**
```bash
cd oauth-proxy-server
docker build -t ghcr.io/co-browser/vibe-oauth-server:latest .
docker push ghcr.io/co-browser/vibe-oauth-server:latest
```

**Production URL:** https://oauth.cobrowser.xyz

**Note:** This service is completely independent from the main monorepo build process. It has its own dependencies and Docker deployment.

## Important Notes

- Services in this directory are NOT part of the pnpm workspace
- They are NOT included in turbo builds
- Each service manages its own dependencies and build process
- Deploy these services separately from the main application