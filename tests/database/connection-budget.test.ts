import { afterAll, beforeAll, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { connectOneShot, database, healthClient, sqlClient } from '../../apps/web/server/db';
import { liveSocket, startLive, type SocketData } from '../../apps/web/server/live';
import { healthResponse } from '../../apps/web/server/health';
import { createApi } from '../../apps/web/server/api';
import { users } from '../../apps/web/server/schema';

// Explicit opt-in only: never use DATABASE_URL (the ordinary suite truncates it).
const adminUrl = process.env.BUDGET_TEST_ADMIN_URL;
if (!adminUrl || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(adminUrl).hostname)) {
  throw new Error('BUDGET_TEST_ADMIN_URL must name a disposable loopback PostgreSQL server');
}
const admin = postgres(adminUrl, { max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
const name = `cabmate_budget_${randomUUID().replaceAll('-', '')}`;
const owner = `${name}_owner`;
const runtime = `${name}_runtime`;
function roleUrl(role: string) {
  const url = new URL(adminUrl!);
  url.username = role;
  url.password = 'disposable';
  url.pathname = `/${name}`;
  return url.toString();
}
const savedEnv = { ...process.env };
let created = false;
let server: ReturnType<typeof Bun.serve<SocketData>>;
let observer: postgres.Sql;

async function eventually(check: () => boolean | Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error('Database/socket condition was not reached');
    await Bun.sleep(20);
  }
}

function command(file: string, env: Record<string, string | undefined> = {}) {
  const child = Bun.spawn([process.execPath, `apps/web/server/${file}`], {
    env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe',
  });
  const result = Promise.all([
    child.exited, new Response(child.stdout).text(), new Response(child.stderr).text(),
  ]).then(([code, stdout, stderr]) => ({ code, stdout, stderr }));
  return { child, result };
}

beforeAll(async () => {
  await admin`create role ${admin(owner)} login password 'disposable' connection limit 1`;
  await admin`create role ${admin(runtime)} login password 'disposable' connection limit 8`;
  await admin`create database ${admin(name)} owner ${admin(owner)}`;
  created = true;
  const observerUrl = new URL(adminUrl!);
  observerUrl.pathname = `/${name}`;
  observer = postgres(observerUrl.toString(), { max: 1 });
  delete process.env.DATABASE_PASSWORD_FILE;
  process.env.DATABASE_URL = roleUrl(runtime);
  expect(await command('migrate.ts', { DATABASE_URL: roleUrl(owner), DATABASE_RUNTIME_ROLE: runtime }).result)
    .toMatchObject({ code: 0, stderr: '' });
  await startLive();
  const api = createApi(database, async () => null);
  // Test transport only; production /ws keeps its Clerk/origin checks in index.ts.
  server = Bun.serve<SocketData>({ hostname: '127.0.0.1', port: 0, websocket: liveSocket,
    fetch(request, server) {
      const { pathname } = new URL(request.url);
      if (pathname === '/healthz') return healthResponse('budget-test');
      if (pathname === '/ws' && server.upgrade(request, { data: {} })) return;
      return api(request);
    },
  });
}, 20_000);

afterAll(async () => {
  await server?.stop(true);
  await sqlClient().end({ timeout: 1 });
  await healthClient().end({ timeout: 1 });
  await observer?.end({ timeout: 1 });
  process.env = savedEnv;
  if (created) await admin`drop database ${admin(name)} with (force)`;
  await admin`drop role if exists ${admin(runtime)}`;
  await admin`drop role if exists ${admin(owner)}`;
  await admin.end();
});

test('three busy query slots plus the real listener fit the four-slot application allowance', async () => {
  // Reserve the real singleton, not a synthetic pool configured to match it.
  const held = await Promise.all(Array.from({ length: 3 }, () => sqlClient().reserve()));
  let completed = false;
  const queued = database().execute('select 1').then(() => { completed = true; });
  try {
    await Bun.sleep(250);
    expect(completed).toBe(false);
    const [{ count }] = await admin`select count(*)::int count from pg_stat_activity where usename = ${runtime}`;
    expect(count).toBe(4);
  } finally {
    held.forEach(client => client.release());
    await queued;
  }
});

test('health remains responsive while every application query slot is busy', async () => {
  const held = await Promise.all(Array.from({ length: 3 }, () => sqlClient().reserve()));
  try {
    const response = await fetch(new URL('/healthz', server.url), { signal: AbortSignal.timeout(1000) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ status: 'ok', revision: 'budget-test' });
    const [{ count }] = await admin`select count(*)::int count from pg_stat_activity where usename = ${runtime}`;
    expect(count).toBe(5);
  } finally {
    held.forEach(client => client.release());
  }
});

test('the real rollup and health CLI leave two operator slots; a ninth runtime connection is rejected', async () => {
  const held = await Promise.all(Array.from({ length: 3 }, () => sqlClient().reserve()));
  const operators = Array.from({ length: 2 }, () => postgres(roleUrl(runtime), { max: 1, connect_timeout: 2 }));
  const excess = postgres(roleUrl(runtime), { max: 1, connect_timeout: 2 });
  // Keep the real one-shot process open at its existing serialization lock.
  await observer`select pg_advisory_lock(64229001)`;
  const rollup = command('rollup.ts');
  try {
    await eventually(async () => (await admin`
      select pid from pg_stat_activity where usename = ${runtime}
        and wait_event_type = 'Lock' and query like '%pg_advisory_xact_lock(64229001)%'
    `).length === 1);
    const response = await fetch(new URL('/healthz', server.url), { signal: AbortSignal.timeout(1000) });
    expect(response.status).toBe(200);
    const [{ count: services }] = await admin`select count(*)::int count from pg_stat_activity where usename = ${runtime}`;
    expect(services).toBe(6);
    for (const operator of operators) await operator`select 1`;
    const [{ count: total }] = await admin`select count(*)::int count from pg_stat_activity where usename = ${runtime}`;
    expect(total).toBe(8);
    await expect(excess`select 1`).rejects.toMatchObject({ code: '53300' });
    // Health checks are HTTP clients; overlapping probes must reuse that same slot.
    const probes = await Promise.all(Array.from({ length: 12 }, () => command('healthcheck.ts', { PORT: String(server.port) }).result));
    expect(probes.every(result => result.code === 0)).toBe(true);
    // The deployment prepare uses the separate owner role, not a ninth runtime slot.
    expect(await command('migrate.ts', { DATABASE_URL: roleUrl(owner), DATABASE_RUNTIME_ROLE: runtime }).result)
      .toMatchObject({ code: 0, stderr: '' });
    console.log('Runtime budget observed: queries 3 + LISTEN 1 + health 1 + rollup 1 = 6; operators 2 = 8; ninth rejected (53300)');
  } finally {
    await observer`select pg_advisory_unlock(64229001)`;
    held.forEach(client => client.release());
    await Promise.all([...operators, excess].map(client => client.end({ timeout: 1 })));
    // Kill only this test's child if a failure prevented it from finishing.
    const timer = setTimeout(() => rollup.child.kill(), 3000);
    try { expect(await rollup.result).toMatchObject({ code: 0, stderr: '' }); }
    finally { clearTimeout(timer); }
  }
}, 15_000);

test('owner/runtime limits and private migration metadata remain enforced', async () => {
  const roles = await admin`select rolname, rolconnlimit, rolsuper, rolcreatedb, rolcreaterole from pg_roles
    where rolname in (${owner}, ${runtime}) order by rolname`;
  expect([...roles]).toEqual([
    { rolname: owner, rolconnlimit: 1, rolsuper: false, rolcreatedb: false, rolcreaterole: false },
    { rolname: runtime, rolconnlimit: 8, rolsuper: false, rolcreatedb: false, rolcreaterole: false },
  ]);
  await expect(sqlClient()`select * from drizzle.__drizzle_migrations`).rejects.toMatchObject({ code: '42501' });
  await expect(sqlClient()`create table budget_forbidden (id int)`).rejects.toMatchObject({ code: '42501' });
  const ownerClient = postgres(roleUrl(owner), { max: 1 });
  const excessOwner = postgres(roleUrl(owner), { max: 1 });
  try {
    await ownerClient`select 1`;
    await expect(excessOwner`select 1`).rejects.toMatchObject({ code: '53300' });
  } finally {
    await Promise.all([ownerClient.end(), excessOwner.end()]);
  }
});

test('health returns 503 when runtime table access is unavailable, then recovers', async () => {
  const ownerClient = postgres(roleUrl(owner), { max: 1 });
  try {
    await ownerClient`revoke select on users from ${ownerClient(runtime)}`;
    const response = await fetch(new URL('/healthz', server.url));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: 'unavailable' });
  } finally {
    await ownerClient`grant select on users to ${ownerClient(runtime)}`;
    await ownerClient.end();
  }
  expect((await fetch(new URL('/healthz', server.url))).status).toBe(200);
});

test('real WebSocket notifications resume after PostgreSQL terminates the LISTEN backend', async () => {
  await database().insert(users).values({ name: 'budget-driver', displayName: 'Budget Driver', apiKey: 'key-budget' });
  const url = new URL('/ws', server.url);
  url.protocol = 'ws:';
  const socket = new WebSocket(url);
  const messages: { drivers: { name: string; latest: { odometerKm: number } | null }[] }[] = [];
  socket.onmessage = event => messages.push(JSON.parse(String(event.data)));
  const sessionId = randomUUID();
  const ingest = async (odometerKm: number) => {
    const response = await fetch(new URL('/api/ingest', server.url), { method: 'POST',
      headers: { authorization: 'Bearer key-budget', 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, truck: { make: 'Volvo', model: 'FH16', fuelCapacityLitres: 900 }, job: null,
        samples: [{ recordedAt: new Date().toISOString(), speedKph: 70, rpm: 1300, gear: 11,
          fuelLitres: 500, odometerKm, truckDamage: 0, cargoDamage: 0, position: { x: 10, z: 20, heading: 1 } }] }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, inserted: 1 });
  };
  const pushed = (km: number) => messages.some(message => message.drivers.some(driver => driver.latest?.odometerKm === km));
  try {
    await eventually(() => messages.length > 0);
    await ingest(2000);
    await eventually(() => pushed(2000), 2000);
    const [listener] = await admin`select pid from pg_stat_activity where usename = ${runtime} and query like 'listen %'`;
    expect(listener).toBeDefined();
    await admin`select pg_terminate_backend(${listener!.pid})`;
    await eventually(async () => (await admin`select pid from pg_stat_activity
      where usename = ${runtime} and query like 'listen %' and pid <> ${listener!.pid}`).length === 1);
    await ingest(2000.4);
    await eventually(() => pushed(2000.4), 2000);
    expect(socket.readyState).toBe(WebSocket.OPEN);
  } finally {
    socket.close();
    await eventually(() => socket.readyState === WebSocket.CLOSED);
  }
}, 15_000);

test('one-shot clients queue concurrent work on one connection', async () => {
  const { client } = connectOneShot();
  const held = await client.reserve();
  let completed = false;
  const queued = client`select 1`.then(() => { completed = true; });
  try {
    await Bun.sleep(250);
    expect(completed).toBe(false);
  } finally {
    held.release();
    await queued;
    await client.end();
  }
});
