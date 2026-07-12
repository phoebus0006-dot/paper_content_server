# Stage 1: build
FROM node:20-slim AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
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
# Build metadata
ARG BUILD_GIT_SHA=unknown
ARG BUILD_GIT_TREE=unknown
ARG BUILD_DIRTY=unknown
ENV BUILD_GIT_SHA=$BUILD_GIT_SHA
ENV BUILD_GIT_TREE=$BUILD_GIT_TREE
ENV BUILD_DIRTY=$BUILD_DIRTY
CMD ["node", "server.js"]
