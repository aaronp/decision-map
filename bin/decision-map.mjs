#!/usr/bin/env node
// decision-map <map.md>: serves the viewer and that map on localhost, then opens it in the browser.
// The map is re-read on every request, so reloading shows your latest edits; File → Save writes it back (PUT).
// A missing file is created as a new map, so a project can start from `decision-map docs/map/map.md`.
import { createServer } from 'node:http';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { basename, resolve } from 'node:path';

const file = process.argv[2];
if (!file || file === '-h' || file === '--help') {
  console.error('Usage: decision-map <map.md>   (PORT=8000 to pick the port, NO_OPEN=1 to skip opening a browser)');
  process.exit(file ? 0 : 1);
}
const path = resolve(file);
await readFile(path).catch(async (e) => {
  if (e.code !== 'ENOENT') { console.error(`decision-map: cannot read ${file}: ${e.message}`); process.exit(1); }
  await writeFile(path, '# root\n');
  console.log(`Created ${file}`);
});

const page = (p) => new URL(`..${p}`, import.meta.url);
const route = '/' + encodeURIComponent(basename(path));
// Only these routes, so nothing else on disk is reachable.
const routes = new Map([
  ['/', [page('/index.html'), 'text/html']],
  ['/support.js', [page('/support.js'), 'text/javascript']],
  ['/vendor/react.js', [page('/vendor/react.js'), 'text/javascript']],
  ['/vendor/react-dom.js', [page('/vendor/react-dom.js'), 'text/javascript']],
  [route, [path, 'text/markdown']],
]);
// Loopback names a browser may use for this server. Anything else in Host means DNS rebinding, so it is refused.
const hosts = (port) => new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`]);
const handler = async (req, res) => {
  if (!hosts(server.address().port).has(req.headers.host)) return res.writeHead(403).end('Forbidden host');
  const [target, type] = routes.get(new URL(req.url, 'http://x').pathname) ?? [];
  if (!target) return res.writeHead(404).end('Not found');
  if (req.method === 'PUT' && target === path) {
    // Cross-site pages cannot get here: a non-simple PUT needs a CORS preflight, which this server never answers.
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      if (!/^\s*(---|#)/.test(body.toString('utf8'))) return res.writeHead(400).end('Not a map'); // never replace the map with junk
      const tmp = `${path}.decision-map-tmp`;
      await writeFile(tmp, body);
      await rename(tmp, path); // whole file or nothing, never half-written
      return res.writeHead(204).end();
    } catch (e) {
      return res.writeHead(500).end(e.message);
    }
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end('Method not allowed');
  try {
    const body = await readFile(target);
    // x-decision-map-writable tells the page that Save can PUT the map back to this URL.
    res.writeHead(200, { 'content-type': `${type}; charset=utf-8`, 'cache-control': 'no-store', ...(target === path ? { 'x-decision-map-writable': '1' } : {}) }).end(body);
  } catch (e) {
    res.writeHead(e.code === 'ENOENT' ? 404 : 500).end(e.message);
  }
};
const server = createServer(handler);

server.listen(Number(process.env.PORT ?? 0), '127.0.0.1', () => {
  const { port } = server.address();
  // Also answer on ::1 so http://localhost:<port> works; skipped if IPv6 loopback is unavailable.
  createServer(handler).on('error', () => {}).listen(port, '::1');
  const url = `http://127.0.0.1:${port}/?src=${route}`;
  console.log(`Serving ${file} at ${url}  (Ctrl-C to stop)`);
  if (process.env.NO_OPEN) return;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
});
