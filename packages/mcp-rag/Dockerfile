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

# Install and build
RUN pnpm install --frozen-lockfile && \
    pnpm --filter @vibe/shared-types build && \
    pnpm --filter @vibe/tab-extraction-core build && \
    pnpm --filter @vibe/mcp-rag build

# Setup app
WORKDIR /app

# Copy app files
RUN cp -r /workspace/packages/mcp-rag/dist ./dist && \
    cp /workspace/packages/mcp-rag/package.json ./

# Create node_modules structure for local packages
RUN mkdir -p node_modules/@vibe/shared-types && \
    cp -r /workspace/packages/shared-types/dist node_modules/@vibe/shared-types/ && \
    cp /workspace/packages/shared-types/package.json node_modules/@vibe/shared-types/ && \
    mkdir -p node_modules/@vibe/tab-extraction-core && \
    cp -r /workspace/packages/tab-extraction-core/dist node_modules/@vibe/tab-extraction-core/ && \
    cp /workspace/packages/tab-extraction-core/package.json node_modules/@vibe/tab-extraction-core/

# Remove workspace references from package.json
RUN sed -i '/"@vibe\/shared-types":/d' package.json && \
    sed -i '/"@vibe\/tab-extraction-core":/d' package.json && \
    npm install --omit=dev --legacy-peer-deps

# Create user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]