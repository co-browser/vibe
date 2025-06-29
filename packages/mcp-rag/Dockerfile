FROM node:20-alpine

# OCI annotations
LABEL org.opencontainers.image.source="https://github.com/co-browser/vibe"
LABEL org.opencontainers.image.description="RAG MCP Server for Vibe"

# Install dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /workspace

# Copy workspace files
COPY . .

# Install and build - let pnpm handle everything
RUN pnpm install --frozen-lockfile --ignore-scripts && \
    pnpm --filter @vibe/mcp-rag... run build

# Setup runtime
WORKDIR /app

# Copy everything we need from the built workspace
RUN cp -r /workspace/packages/mcp-rag/* . && \
    rm -rf node_modules && \
    cp -r /workspace/node_modules .

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]