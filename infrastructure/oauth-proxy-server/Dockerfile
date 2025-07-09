FROM node:18-alpine

# Set PORT environment variable
ENV PORT=3000

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Expose port using environment variable
EXPOSE ${PORT}

# Start application
CMD ["node", "src/index.js"]