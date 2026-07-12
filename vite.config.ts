import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Fire HD10 (Silk browser) 対応
      target: 'es2020',
      rollupOptions: {
        // Node.js専用モジュールをフロントビルドから完全除外
        external: [
          'fsevents',
          'express',
          'path',
          'fs',
          'os',
          'url',
          'crypto',
          'http',
          'https',
          'stream',
          'zlib',
          'buffer',
          'util',
          'net',
          'tty',
          'child_process',
          'worker_threads',
          /^node:/,
        ],
        input: 'index.html',
      },
    },
    optimizeDeps: {
      // server.ts関連をViteの依存最適化から除外
      exclude: ['express', 'vite'],
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
