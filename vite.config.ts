/// <reference types="node" />
import { mkdirSync, writeFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Dev server only: the Scene Lab posts canvas captures here; they land in docs/scene-v2/shots. */
function sceneShots(): Plugin {
  return {
    name: 'scene-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (req, res) => {
        const name = (new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'shot').replace(/[^\w.-]/g, '_');
        let body = '';
        req.on('data', (c) => { body += c; });
        req.on('end', () => {
          const dir = 'docs/scene-v2/shots';
          mkdirSync(dir, { recursive: true });
          writeFileSync(`${dir}/${name}.png`, Buffer.from(body.replace(/^data:image\/png;base64,/, ''), 'base64'));
          res.end('ok');
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sceneShots()],
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: { three: ['three'] },
      },
    },
  },
});
