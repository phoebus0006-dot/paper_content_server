# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production && npm ci --only=dev && npm cache clean --force

# ---- Test stage ----
FROM node:20-alpine AS test
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY . .
RUN npm run check
RUN npm run test:unit
RUN node -e "require('./src/admin/admin-state-service'); require('./src/news/news-title-service'); require('./src/files/safe-image-path'); require('./src/images/image-rasterizer-v2'); require('./src/images/image-recipe-service'); require('./src/publication/publication-history-adapter'); console.log('All modules loaded successfully')"

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache tini
COPY --from=build /app/node_modules ./node_modules
COPY src/ ./src/
COPY scripts/generate-build-info.js ./scripts/
COPY public/ ./public/
COPY server.js package.json ./
COPY data/ ./data/
RUN addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app
USER appuser
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/health.json || exit 1
