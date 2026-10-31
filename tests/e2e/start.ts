// Deliberate external-service boundary: only station state is a fixture. The
// browser exercises the built app, its real adapter, Clerk guards and API routes.
import { mkdirSync } from 'node:fs';
let mode = 'live';
const controlToken = crypto.randomUUID();
mkdirSync('.artifacts/companion-merge', { recursive: true });
await Bun.write('.artifacts/companion-merge/control-token', controlToken);
const upstream = Bun.serve({ hostname: '127.0.0.1', port: 8299, fetch(request) {
  const url = new URL(request.url);
  if (url.pathname === '/test-mode' && request.headers.get('authorization') === `Bearer ${controlToken}`) {
    mode = url.searchParams.get('mode') || 'live';
    return new Response('ok');
  }
  if (url.pathname !== '/api/state') return new Response(null, { status: 404 });
  if (mode === 'down') return new Response('offline', { status: 503 });
  return Response.json({ stations: mode === 'empty' ? [] : [{ id: 'main', name: 'RadioMax', genre: 'Gaming Music',
    trackTitle: 'max verstappen', trackIndex: 0, trackCount: 3, positionBytes: 4500, trackSizeBytes: 10000,
    listeners: 3, uptimeSec: 600, streamUrl: 'http://old.invalid', ets2Url: 'old' }] });
} });
const child = Bun.spawn([process.execPath, 'apps/web/server/index.ts'], { stdout: 'inherit', stderr: 'inherit', env: {
  ...process.env, PORT: '3199', HOST: '127.0.0.1', APP_ORIGIN: 'http://127.0.0.1:3199',
  RADIO_ORIGIN: 'http://127.0.0.1:8299', DATABASE_URL: process.env.TEST_DATABASE_URL,
  DATABASE_PASSWORD_FILE: '', CLERK_SECRET_KEY: '', CLERK_PUBLISHABLE_KEY: '', VITE_CLERK_PUBLISHABLE_KEY: '',
} });
const shutdown = () => { child.kill(); upstream.stop(true); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
process.exitCode = await child.exited;
upstream.stop(true);
