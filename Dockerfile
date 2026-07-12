# ── Stage 1: ビルド ──────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# 依存インストール
COPY package*.json ./
RUN npm ci

# ソースコピー
COPY . .

# フロント（Vite）ビルド
RUN npx vite build

# サーバー（esbuild）ビルド
RUN npx esbuild server.ts \
  --bundle \
  --platform=node \
  --format=cjs \
  --packages=external \
  --sourcemap \
  --outfile=dist/server.cjs

# ── Stage 2: 本番イメージ ────────────────────────
FROM node:20-slim
WORKDIR /app

# 本番依存のみインストール
COPY package*.json ./
RUN npm ci --omit=dev

# ビルド成果物だけコピー
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "dist/server.cjs"]
