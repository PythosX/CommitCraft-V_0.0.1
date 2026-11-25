// Local dev: serves ./frontend and proxies /api/* to `wrangler dev` (default :8787), so cookies stay same-origin
// exactly like the Vercel rewrite in production.   Usage: node dev-server.mjs
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const API = process.env.API_ORIGIN || 'http://127.0.0.1:8787';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const up = await fetch(API + url.pathname + url.search, {
        method: req.method, redirect: 'manual',
        headers: { ...req.headers, host: new URL(API).host, origin: `http://localhost:${PORT}` },
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req, duplex: 'half',
      });
      const headers = {}; up.headers.forEach((v, k) => { if (!['content-encoding', 'content-length', 'transfer-encoding', 'set-cookie'].includes(k)) headers[k] = v; });
      headers['set-cookie'] = up.headers.getSetCookie();
      res.writeHead(up.status, headers);
      if (up.body) for await (const chunk of up.body) res.write(chunk);
      return res.end();
    }
    let path = normalize(url.pathname).replace(/^(\.\.[/\\])+/, '');
    if (path === '/' || path === '\\') path = '/index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 502); res.end(e.code === 'ENOENT' ? 'Not found' : 'Dev proxy error: is `wrangler dev` running?');
  }
}).listen(PORT, () => console.log(`CommitCraft frontend: http://localhost:${PORT}  (API proxied to ${API})`));
