import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '8080', 10);

  app.use(express.json());

  // バックエンドAPI（FastAPI on Cloud Run）のURL
  const BACKEND_URL =
    process.env.BACKEND_URL ||
    'https://ec-search-api-826846133648.asia-northeast1.run.app';

  // ──────────────────────────────────────────────
  // /search → FastAPI にリバースプロキシ
  // ──────────────────────────────────────────────
  app.get('/api/search', async (req, res) => {
    try {
      const q = req.query.q as string;
      if (!q) return res.status(400).json({ error: 'q required' });

      const response = await fetch(`${BACKEND_URL}/search?q=${encodeURIComponent(q)}`, {
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`Backend error: ${response.status}`);
      const data = await response.json();
      res.json(data);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // ──────────────────────────────────────────────
  // /health
  // ──────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    try {
      const response = await fetch(`${BACKEND_URL}/health`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await response.json();
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
