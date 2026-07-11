FROM node:22-bookworm AS builder

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     fonts-noto-cjk \
     fontconfig \
     python3 \
     make \
     g++ \
     build-essential \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --only=production && npm cache clean --force

FROM node:22-bookworm-slim

ARG GIT_SHA
ARG GIT_TREE=unknown
ARG BUILD_DIRTY=false

ENV BUILD_GIT_SHA=$GIT_SHA
ENV BUILD_GIT_TREE=$GIT_TREE
ENV BUILD_DIRTY=$BUILD_DIRTY

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     fonts-noto-cjk \
     fontconfig \
  && fc-cache -fv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY . .

RUN node scripts/generate-build-manifest.js

RUN useradd -r -u 1001 -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8787/health/live', function(r) { process.exit(r.statusCode===200?0:1); }).on('error',function(){process.exit(1)})"

CMD ["node", "server.js"]
