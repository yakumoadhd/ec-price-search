# ── Stage 1: フロントビルド ──────────────────────
FROM node:20-slim AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
# fseventsはmacOS専用・Linuxでは不要なので空ファイルで置換
RUN mkdir -p node_modules/fsevents && \
    echo 'module.exports = {}' > node_modules/fsevents/fsevents.js && \
    echo '{"name":"fsevents","version":"2.3.3","main":"fsevents.js"}' > node_modules/fsevents/package.json
COPY . .
RUN npx vite build

# ── Stage 2: サーバービルド ──────────────────────
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
COPY --from=frontend /app/dist ./dist
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --packages=external \
  --sourcemap \
  --outfile=dist/server.cjs

# ── Stage 3: 本番イメージ ────────────────────────
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
