import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN, tracesSampleRate: 1.0 });

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

const log = (level: string, msg: string, extra?: object) => {
  const ts = new Date().toISOString();
  console.log(JSON.stringify({ ts, level, msg, ...extra }));
};

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '8080', 10);

  app.use(express.json());

  // バックエンドAPI（FastAPI on Cloud Run）のURL
  const BACKEND_URL =
    process.env.BACKEND_URL ||
    'https://ec-search-api-ox25rkjjvq-an.a.run.app';

  // ──────────────────────────────────────────────
  // 共通: バックエンドへのフェッチ + Content-Typeガード
  // ──────────────────────────────────────────────
  async function fetchBackend(url: string, timeoutMs = 30000): Promise<any> {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) {
      throw new Error(`Backend error: ${response.status}`);
    }
    const ct = response.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      const preview = (await response.text()).slice(0, 120);
      log('ERROR', 'Backend returned non-JSON', { status: response.status, ct, preview });
      throw new Error(`バックエンドが不正な応答を返しました (${response.status})`);
    }
    return response.json();
  }

  // ──────────────────────────────────────────────
  // /api/search → FastAPI /search にリバースプロキシ
  // ──────────────────────────────────────────────
  app.get('/api/search', async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'q required' });

    log('INFO', 'EC検索API リクエスト受信', { q });
    try {
      const data = await fetchBackend(`${BACKEND_URL}/search?q=${encodeURIComponent(q)}`);
      log('INFO', 'EC検索API 成功', { q });
      res.json(data);
    } catch (e: any) {
      log('ERROR', 'EC検索API 失敗', { q, error: e.message });
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────
  // /api/searxng → FastAPI /searxng にリバースプロキシ（CORSなし）
  // ──────────────────────────────────────────────
  app.get('/api/searxng', async (req, res) => {
    const q = req.query.q as string;
    if (!q) return res.status(400).json({ error: 'q required' });

    log('INFO', 'SearXNG プロキシ リクエスト受信', { q });
    try {
      const data = await fetchBackend(
        `${BACKEND_URL}/searxng?q=${encodeURIComponent(q)}`,
        15000
      );
      res.json(data);
    } catch (e: any) {
      log('ERROR', 'SearXNG プロキシ 失敗', { q, error: e.message });
      res.status(503).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────
  // /api/health
  // ──────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    try {
      const data = await fetchBackend(`${BACKEND_URL}/health`, 5000);
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────
  // Vite（開発）/ 静的ファイル配信（本番）
  // ──────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Sentry error handler
  app.use(Sentry.expressErrorHandler());

  app.listen(PORT, '0.0.0.0', () => {
    log('INFO', `Server running on http://localhost:${PORT}`, { BACKEND_URL });
  });
}

startServer();
