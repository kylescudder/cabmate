import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { connect } from './db';
import { createApi } from './api';
import { users } from './schema';

// Runs against a migrated, disposable database (CI service container or `bun run db:up`).
const { db, client } = connect(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const anonymous = createApi(() => db, async () => null);
const signedIn = createApi(() => db, async () => 'user_reader');

function sample(second: number, odometerKm: number) {
  return { recordedAt: new Date(Date.now() - 60_000 + second * 1000).toISOString(), speedKph: 80, rpm: 1400, gear: 10,
    fuelLitres: 600, odometerKm, truckDamage: 0, cargoDamage: 0, position: { x: 1300, z: -200, heading: 0 } };
}
function post(apiKey: string, body: unknown, path = '/api/ingest') {
  return anonymous(new Request(`http://ets2.test${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body),
  }));
}
const payload = (sessionId: string, samples = [sample(0, 1000), sample(1, 1000.5)]) => ({
  sessionId, truck: { make: 'Scania', model: 'S 730', fuelCapacityLitres: 800 },
  job: { cargo: 'Pallets', sourceCity: 'Berlin', destinationCity: 'Paris', income: 1500 }, samples,
});

beforeEach(async () => {
  await db.execute(sql`truncate users, vehicles, sessions, jobs, telemetry, telemetry_rollup_minute cascade`);
  await db.insert(users).values([
    { name: 'mike', displayName: 'Mike', apiKey: 'key-mike' },
    { name: 'sarah', displayName: 'Sarah', apiKey: 'key-sarah' },
  ]);
});
afterAll(() => client.end());

describe('telemetry ingest', () => {
  test('rejects an unknown agent key', async () => {
    expect((await post('not-a-key', payload(randomUUID()))).status).toBe(401);
  });

  test('rejects a malformed payload', async () => {
    expect((await post('key-mike', { sessionId: 'nope' })).status).toBe(400);
  });

  test('stores a batch and ignores replayed samples', async () => {
    const body = payload(randomUUID());
    expect(await (await post('key-mike', body)).json()).toEqual({ ok: true, inserted: 2 });
    expect(await (await post('key-mike', body)).json()).toEqual({ ok: true, inserted: 0 });
  });

  test('accepts the legacy Supabase function path used by installed agents', async () => {
    expect(await (await post('key-mike', payload(randomUUID()), '/functions/v1/ingest')).json()).toEqual({ ok: true, inserted: 2 });
  });

  test('refuses samples for a session owned by another driver', async () => {
    const sessionId = randomUUID();
    await post('key-mike', payload(sessionId));
    expect((await post('key-sarah', payload(sessionId, [sample(5, 1001)]))).status).toBe(403);
  });

  test('ingested driving shows up live and on the leaderboard', async () => {
    await post('key-mike', payload(randomUUID(), [sample(58, 1000), sample(59, 1000.5)]));
    const get = (path: string) => signedIn(new Request(`http://ets2.test${path}`)).then(r => r.json());
    const drivers = await get('/api/drivers') as { name: string; status: string }[];
    expect(drivers.find(d => d.name === 'mike')?.status).toBe('online');
    expect(drivers.find(d => d.name === 'sarah')?.status).toBe('offline');
    const board = await get('/api/leaderboard') as { name: string; totalKm: number }[];
    expect(board[0]).toMatchObject({ name: 'mike', totalKm: 0.5 });
  });

  test('read endpoints require a signed-in user', async () => {
    expect((await anonymous(new Request('http://ets2.test/api/drivers'))).status).toBe(401);
  });
});
