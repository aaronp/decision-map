// Dev server: serves this folder.
const port = Number(process.env.PORT ?? 8000);
const s = Bun.serve({
  port,
  async fetch(req) {
    const u = new URL(req.url);
    const f = Bun.file('.' + (u.pathname.endsWith('/') ? u.pathname + 'index.html' : u.pathname));
    return (await f.exists()) ? new Response(f) : new Response('Not found', { status: 404 });
  },
});
console.log('Serving on ' + s.url.href + ' (Ctrl-C to stop)');
