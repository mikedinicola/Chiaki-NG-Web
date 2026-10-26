import http from 'node:http';
import { readFile } from 'node:fs/promises';

// Browser-side pixel assertions exercise real WebGL and the 2D fallback.
const root = new URL('../', import.meta.url);
const routes = new Map([
  ['/', ['wasm/tests/video-renderer.html', 'text/html; charset=utf-8']],
  ['/video-renderer.js', ['wasm/www/video-renderer.js', 'text/javascript; charset=utf-8']],
]);
const server = http.createServer(async (req, res) => {
  const route = routes.get(new URL(req.url, 'http://localhost').pathname);
  if (!route) { res.writeHead(404).end(); return; }
  try {
    const body = await readFile(new URL(route[0], root));
    res.writeHead(200, {'Content-Type': route[1], 'Cache-Control': 'no-store'}).end(body);
  } catch { res.writeHead(500).end('Unable to read renderer test files.'); }
});
server.listen(Number(process.argv[2]) || 8092, '127.0.0.1', () => {
  const port = server.address().port;
  console.log(`GPU pixel checks: http://127.0.0.1:${port}/`);
  console.log(`2D fallback checks: http://127.0.0.1:${port}/?fallback`);
  console.log('Both pages must report PASS. Ctrl+C stops this test server.');
});
