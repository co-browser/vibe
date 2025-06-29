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

# Install without running postinstall scripts
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build only what we need
RUN cd packages/shared-types && pnpm run build && \
    cd ../tab-extraction-core && pnpm run build && \
    cd ../mcp-rag && pnpm run build

# Setup app
WORKDIR /app

RUN cp -r /workspace/packages/mcp-rag/dist ./dist && \
    cp /workspace/packages/mcp-rag/package.json ./ && \
    mkdir -p /workspace && \
    cp -r /workspace/packages/shared-types/dist /workspace/shared-types/ && \
    cp /workspace/packages/shared-types/package.json /workspace/shared-types/ && \
    cp -r /workspace/packages/tab-extraction-core/dist /workspace/tab-extraction-core/ && \
    cp /workspace/packages/tab-extraction-core/package.json /workspace/tab-extraction-core/

# Fix workspace dependencies
RUN sed -i 's|"@vibe/shared-types": "workspace:\*"|"@vibe/shared-types": "file:/workspace/shared-types"|g' package.json && \
    sed -i 's|"@vibe/tab-extraction-core": "workspace:\*"|"@vibe/tab-extraction-core": "file:/workspace/tab-extraction-core"|g' package.json && \
    npm install --omit=dev --legacy-peer-deps

# Create user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
USER nodejs

EXPOSE 3000
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

CMD ["node", "dist/index.js"]