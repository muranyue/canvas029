import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const localTestLogPlugin = {
      name: 'local-test-log-plugin',
      configureServer(server: any) {
        server.middlewares.use('/__local_test_log', (req: any, res: any, next: any) => {
          if (req.method !== 'POST') {
            next();
            return;
          }

          let raw = '';
          req.on('data', (chunk: any) => {
            raw += String(chunk);
            if (raw.length > 1024 * 1024) {
              raw = raw.slice(0, 1024 * 1024);
            }
          });

          req.on('end', () => {
            let payload: any = {};
            try {
              payload = raw ? JSON.parse(raw) : {};
            } catch (_err) {
              payload = { parseError: true, raw };
            }

            const line = `[${new Date().toISOString()}] CLIENT_FAILURE ${JSON.stringify(payload)}`;
            console.error(line);

            res.statusCode = 204;
            res.end();
          });
        });
      }
    };

    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), localTestLogPlugin],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
