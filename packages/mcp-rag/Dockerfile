FROM node:20-alpine AS builder

# Install build dependencies
RUN apk add --no-cache libc6-compat python3 make g++

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@10.12.1 --activate

WORKDIR /workspace

# Copy workspace files
COPY . .

# Install and build only what we need
RUN pnpm install --frozen-lockfile && \
    pnpm --filter @vibe/shared-types build && \
    pnpm --filter @vibe/tab-extraction-core build && \
    pnpm --filter @vibe/mcp-rag build

# Production stage
FROM node:20-alpine

# OCI annotations
LABEL org.opencontainers.image.source="https://github.com/co-browser/vibe"
LABEL org.opencontainers.image.description="RAG MCP Server for Vibe"

# Install runtime dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Copy built application
COPY --from=builder /workspace/packages/mcp-rag/dist ./dist
COPY --from=builder /workspace/packages/mcp-rag/package.json ./

# Copy local dependencies
COPY --from=builder /workspace/packages/shared-types/dist ./node_modules/@vibe/shared-types/dist
COPY --from=builder /workspace/packages/shared-types/package.json ./node_modules/@vibe/shared-types/
COPY --from=builder /workspace/packages/tab-extraction-core/dist ./node_modules/@vibe/tab-extraction-core/dist
COPY --from=builder /workspace/packages/tab-extraction-core/package.json ./node_modules/@vibe/tab-extraction-core/

# Remove workspace dependencies from package.json and install production deps
RUN sed -i '/"@vibe\/shared-types":/d; /"@vibe\/tab-extraction-core":/d' package.json && \
    npm install --omit=dev --legacy-peer-deps

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]