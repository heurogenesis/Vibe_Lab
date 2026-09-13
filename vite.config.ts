import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { cp, stat } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
const WEBR_DIST = resolve('node_modules/webr/dist');
const MIME: Record<string, string> = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.so': 'application/octet-stream', '.data': 'application/octet-stream', '.json': 'application/json' };
// Self-hosts the R runtime at /webr/. Kept out of git: the files live in node_modules and are copied on build.
function webrAssets(): Plugin {
  return {
    name: 'webr-assets',
    configureServer(server) {
      server.middlewares.use('/webr', (req, res, next) => {
        const file = join(WEBR_DIST, decodeURIComponent((req.url || '/').split('?')[0]));
        if (!file.startsWith(WEBR_DIST)) return next();
        stat(file).then(info => {
          if (!info.isFile()) throw new Error('not a file');
          res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
          // A worker started from a cross-origin isolated page only loads if its own script response declares
          // the same embedder policy. Without this header the worker fails with an error event carrying no
          // message at all, which is a genuinely hard failure to read.
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
          createReadStream(file).pipe(res);
        }).catch(() => { res.statusCode = 404; res.end('webR asset not found'); });
      });
    },
    async closeBundle() { await cp(WEBR_DIST, resolve('dist/webr'), { recursive: true }); },
  };
}
export default defineConfig(({mode}) => ({ plugins: [react(), webrAssets()], server: { port: 5173, strictPort: true,
    // Cross-origin isolation for webR's SharedArrayBuffer channel. Express sets the same pair for production.
    headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' },
    proxy: { '/practice-sandbox.html': `http://127.0.0.1:${loadEnv(mode,process.cwd(),'').PORT || '3001'}`, '/api': `http://127.0.0.1:${loadEnv(mode,process.cwd(),'').PORT || '3001'}` } } }));
