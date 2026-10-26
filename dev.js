// Dev server: serves this folder, and proxies /typesafe/* to api.typesafe.ai, which doesn't allow browser (CORS) calls.
const port = Number(process.env.PORT ?? 8000);
const s = Bun.serve({
  port,
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.startsWith('/typesafe/')) {
      const r = await fetch('https://api.typesafe.ai' + u.pathname.slice('/typesafe'.length) + u.search, {
        method: req.method,
        headers: { authorization: req.headers.get('authorization') ?? '', 'content-type': req.headers.get('content-type') ?? 'application/json' },
        body: req.method === 'GET' ? undefined : await req.arrayBuffer(),
      });
      /* Body re-wrapped: fetch has already decompressed it, so the upstream content-encoding must not be passed on. */
      return new Response(await r.arrayBuffer(), { status: r.status, headers: { 'content-type': r.headers.get('content-type') ?? 'application/json' } });
    }
    const f = Bun.file('.' + (u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname));
    return (await f.exists()) ? new Response(f) : new Response('Not found', { status: 404 });
  },
});
console.log('Serving on ' + s.url.href + ' (Ctrl-C to stop)');
