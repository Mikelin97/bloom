import fs from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const httpsKey = env.HTTPS_KEY;
  const httpsCert = env.HTTPS_CERT;
  const httpsCa = env.HTTPS_CA;
  const https =
    httpsKey && httpsCert
      ? {
          key: fs.readFileSync(httpsKey),
          cert: fs.readFileSync(httpsCert),
          ...(httpsCa ? { ca: fs.readFileSync(httpsCa) } : {})
        }
      : undefined;
  const host = env.VITE_HOST || undefined;

  const apiProxyTarget =
    env.VITE_API_PROXY || (https ? 'https://localhost:8787' : 'http://localhost:8787');

  const server = {
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        secure: false
      }
    },
    ...(host ? { host } : {}),
    ...(https ? { https } : {})
  };

  return {
    plugins: [react()],
    server,
    preview: {
      ...(host ? { host } : {}),
      ...(https ? { https } : {})
    },
    test: {
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      globals: false,
      css: true
    }
  };
});
