FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy TypeScript config and source
COPY tsconfig.json ./
COPY src ./src

# Build the application 
RUN npm run build

# Copy EVSE config files (supports includes)
COPY evse-config.json ./
COPY evse-config ./evse-config

# Remove dev dependencies and source files to reduce image size
RUN rm -rf src tsconfig.json node_modules && \
    npm ci --only=production && \
    npm cache clean --force

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S charger -u 1001 -G nodejs

# Change ownership of the app directory
RUN chown -R charger:nodejs /app
USER charger

# Expose port (can be overridden by environment variable)
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => process.exit(res.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the service
CMD ["npm", "start"]
