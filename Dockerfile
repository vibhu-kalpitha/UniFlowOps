# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Production runner stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package*.json ./
# Install production dependencies (including mysql2, express, etc.)
RUN npm ci --omit=dev

# Copy compiled frontend and backend assets
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server/src/db/migrations ./dist-server/db/migrations
COPY --from=builder /app/server/src/db/migrations ./server/src/db/migrations

EXPOSE 4000

# Docker Healthcheck targeting http://localhost:4000/api/health
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/health || exit 1

# Run database migrations prior to starting production server
CMD ["sh", "-c", "node dist-server/db/migrate.js && node dist-server/index.js"]
