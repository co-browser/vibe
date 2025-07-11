# Multi-stage Dockerfile for Gmail MCP Server
# Stage 1: Builder
FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++ git

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Set working directory
WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/mcp-gmail ./packages/mcp-gmail

# Install dependencies without running scripts (to avoid building Electron)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build only the packages we need
RUN pnpm --filter @vibe/shared-types build
RUN pnpm --filter @vibe/mcp-gmail build

# Deploy the app with production dependencies only
RUN pnpm --filter @vibe/mcp-gmail deploy --prod --legacy /prod/mcp-gmail

# Stage 2: Production
FROM node:20-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S appuser && adduser -S appuser -u 1001

# Set working directory
WORKDIR /app

# Copy deployed app from builder
COPY --from=builder --chown=appuser:appuser /prod/mcp-gmail ./

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1))"

# Set production environment
ENV NODE_ENV=production

# Add OCI labels
LABEL org.opencontainers.image.title="Gmail MCP Server" \
      org.opencontainers.image.description="Model Context Protocol server for Gmail integration" \
      org.opencontainers.image.url="https://github.com/co-browser/vibe" \
      org.opencontainers.image.source="https://github.com/co-browser/vibe" \
      org.opencontainers.image.vendor="Vibe"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the server
CMD ["node", "dist/index.js"]