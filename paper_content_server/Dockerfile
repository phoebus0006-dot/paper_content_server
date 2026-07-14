# Stage 1: build — clean install from official node:20-slim
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
# Clean install: no host node_modules copied, no audit, no fund
# Fail fast: verify sharp loads and server.js parses in the same layer
RUN npm ci --omit=dev --no-audit --no-fund && \
    node -e "require('sharp'); console.log('sharp_loaded')" && \
    node -e "console.log(JSON.stringify(require('sharp').versions))" && \
    node --check server.js
COPY . .

# Stage 2: runtime
FROM node:20-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends fonts-noto-cjk && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /app /app
RUN mkdir -p /app/images && \
    groupadd -r appuser && useradd -r -g appuser appuser && \
    chown -R appuser:appuser /app
USER appuser
EXPOSE 8787
# Build metadata — SHA verified via `docker inspect`, not /api/build
ARG BUILD_GIT_SHA=unknown
ARG BUILD_GIT_TREE=unknown
ARG BUILD_DIRTY=unknown
ENV BUILD_GIT_SHA=$BUILD_GIT_SHA
ENV BUILD_GIT_TREE=$BUILD_GIT_TREE
ENV BUILD_DIRTY=$BUILD_DIRTY
CMD ["node", "server.js"]
