# ── Stage 1: フロントビルド ──────────────────────
FROM node:22 AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npx vite build

# ── Stage 2: サーバービルド ──────────────────────
FROM node:22 AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
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
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
