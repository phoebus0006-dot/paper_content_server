# ---- Build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --ignore-scripts
COPY . .
ARG BUILD_GIT_SHA
ARG BUILD_GIT_TREE
ARG BUILD_DIRTY
ARG BUILD_MODE=release
RUN node scripts/generate-build-manifest.js

# ---- Test stage ----
FROM node:20-alpine AS test
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/package-lock.json* ./
# Install dev dependencies on top of the existing node_modules from build
RUN npm ci --ignore-scripts --include=dev
COPY --from=build /app .
RUN npm run check
RUN node --check server.js && node --check scripts/container-selftest.js

# ---- Production stage ----
FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache tini fonts-noto-cjk

# Re-declare ARGs (stage-scoped) and persist as ENV so docker inspect
# shows BUILD_GIT_SHA / BUILD_GIT_TREE / BUILD_DIRTY in the final image.
ARG BUILD_GIT_SHA
ARG BUILD_GIT_TREE
ARG BUILD_DIRTY
ENV BUILD_GIT_SHA=$BUILD_GIT_SHA BUILD_GIT_TREE=$BUILD_GIT_TREE BUILD_DIRTY=$BUILD_DIRTY
ARG BUILD_MODE
ENV BUILD_MODE=$BUILD_MODE
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=build /app/build-manifest.json ./
COPY --from=build /app/server.js ./
COPY --from=build /app/src ./src/
COPY --from=build /app/lib ./lib/
COPY --from=build /app/scripts ./scripts/
COPY --from=build /app/public ./public/
COPY --from=build /app/resources ./resources/
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    addgroup -S appgroup && adduser -S appuser -G appgroup && chown -R appuser:appgroup /app && \
    node -e "require('sharp'); require('mqtt'); var s = require('./server.js'); console.log('All production modules loaded')"
ENV DATA_DIR=/app/data
USER appuser
EXPOSE 8787
ENTRYPOINT ["/sbin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "server.js"]
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8787/api/health.json || exit 1
