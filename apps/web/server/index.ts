import { join, normalize } from 'node:path';
import { database } from './db';
import { sql } from 'drizzle-orm';
import { authorizeSocket, liveSocket, startLive, type SocketData } from './live';

const revision = process.env.ETS2_REVISION || 'development';
const directory = join(import.meta.dir, '../dist/client');
const entry = '../dist/server/server.js';
const { default: app } = await import(entry) as { default: { fetch(request: Request): Promise<Response> } };
await database().execute(sql`select id from users limit 0`);
await startLive();

const server = Bun.serve<SocketData>({
  port: Number(process.env.PORT || 3000),
  hostname: process.env.HOST || '0.0.0.0',
  maxRequestBodySize: 512_000,
  websocket: liveSocket,
  async fetch(request, server) {
    const { pathname } = new URL(request.url);
    let response: Response | undefined;
    if (pathname === '/ws') {
      if (!await authorizeSocket(request).catch(() => false)) response = new Response('Unauthorized', { status: 401 });
      else if (server.upgrade(request, { data: {} })) return;
      else response = new Response('WebSocket upgrade required', { status: 426 });
    } else if (pathname === '/healthz') {
      try {
        await database().execute(sql`select id from users limit 0`);
        response = Response.json({ status: 'ok', revision }, { headers: { 'cache-control': 'no-store' } });
      } catch { response = Response.json({ status: 'unavailable' }, { status: 503 }); }
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      try {
        const path = normalize(join(directory, decodeURIComponent(pathname)));
        if (path.startsWith(directory + '/') && await Bun.file(path).exists()) response = new Response(request.method === 'HEAD' ? null : Bun.file(path), {
          headers: { 'cache-control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' },
        });
      } catch { response = new Response('Bad request', { status: 400 }); }
    }
    response ??= await app.fetch(request);
    response.headers.set('X-ETS2-Revision', revision);
    return response;
  },
});
console.log(`ETS2 ${revision} listening on ${server.port}`);
