# Dummy Dockerfile for testing kit tools
# This is not intended for production use - just for dogfooding kit functionality

FROM oven/bun:1 as base
WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the project
RUN bun run build

# Expose port for potential testing
EXPOSE 3000

# Default command
CMD ["echo", "This is a dummy container for testing kit tools"]