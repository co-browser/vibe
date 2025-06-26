# Use Node.js 20 Alpine image for smaller size
FROM node:20-alpine

# Install dependencies
RUN apk add --no-cache libc6-compat

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy pre-built application files
COPY --chown=nodejs:nodejs packages/mcp-rag/dist ./dist
COPY --chown=nodejs:nodejs packages/mcp-rag/package.json ./

# Copy pre-built workspace dependencies
COPY --chown=nodejs:nodejs packages/shared-types/dist /workspace/shared-types/dist
COPY --chown=nodejs:nodejs packages/shared-types/package.json /workspace/shared-types/
COPY --chown=nodejs:nodejs packages/tab-extraction-core/dist /workspace/tab-extraction-core/dist
COPY --chown=nodejs:nodejs packages/tab-extraction-core/package.json /workspace/tab-extraction-core/

# Replace workspace dependencies with file references for production
RUN sed -i 's|"@vibe/shared-types": "workspace:\*"|"@vibe/shared-types": "file:/workspace/shared-types"|g' package.json && \
    sed -i 's|"@vibe/tab-extraction-core": "workspace:\*"|"@vibe/tab-extraction-core": "file:/workspace/tab-extraction-core"|g' package.json

# Install only production dependencies
RUN npm install --omit=dev --legacy-peer-deps

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Health check using wget (more reliable in Alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Start the server
CMD node dist/index.js