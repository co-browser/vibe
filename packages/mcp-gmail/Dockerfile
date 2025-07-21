FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /workspace

# Copy only necessary workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json ./
COPY packages/shared-types ./packages/shared-types
COPY packages/mcp-gmail ./packages/mcp-gmail

# Install without running scripts (avoids building electron)
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build only needed packages
RUN pnpm --filter @vibe/shared-types run build && \
    pnpm --filter @vibe/mcp-gmail run build

# Deploy mcp-gmail with all dependencies resolved
RUN pnpm deploy --filter @vibe/mcp-gmail --prod --legacy /prod/mcp-gmail

# Production stage
FROM node:20-alpine

# OCI annotations
LABEL org.opencontainers.image.source="https://github.com/co-browser/vibe"
LABEL org.opencontainers.image.description="Gmail MCP Server for Vibe"

# Install runtime dependencies
RUN apk add --no-cache libc6-compat

# Copy the deployed app
COPY --from=builder /prod/mcp-gmail /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app
USER nodejs

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]