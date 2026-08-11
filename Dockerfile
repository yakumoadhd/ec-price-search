FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_SENTRY_DSN
ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN
RUN npm run build
ENV NODE_ENV=production
ENV PORT=8080
CMD ["node", "dist/server.cjs"]
