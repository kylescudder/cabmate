const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
async function check(path: string, status: number, init?: RequestInit) {
  const response = await fetch(base + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(10000) });
  if (response.status !== status) throw new Error(`Acceptance failed for ${path}: ${response.status}`);
  return response;
}
const health = await check('/healthz', 200);
if ((await health.json()).revision !== (process.env.ETS2_REVISION || 'development')) throw new Error('Revision mismatch');
if (!(await (await check('/login', 200)).text()).includes('Euro Truck Simulator 2')) throw new Error('Login page missing');
await check('/api/profile', 401);
await check('/api/drivers', 401);
await check('/ws', 401, { headers: { upgrade: 'websocket', connection: 'Upgrade', origin: process.env.APP_ORIGIN ?? '' } });
await check('/api/ingest', 401, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
if (!process.env.CLERK_SECRET_KEY || !process.env.APP_ORIGIN) throw new Error('Production authentication configuration is missing');
console.log('ETS2 acceptance checks passed');
export {};
