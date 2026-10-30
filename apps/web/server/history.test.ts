import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { sql } from 'drizzle-orm';
import { connect } from './db';
import { createApi } from './api';
import { users } from './schema';

// Runs against a migrated, disposable database (CI service container or `bun run db:up`).
const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const { db, client } = connect(databaseUrl);
const anonymous = createApi(() => db, async () => null);
const signedIn = createApi(() => db, async () => 'user_reader');
const DAY_MS = 86_400_000;

// One sample per second from `start`, moving the odometer `stepKm` each second, posted in agent-sized batches.
async function drive(apiKey: string, start: number, odometerKm: number, seconds: number, speedKph = 72, stepKm = 0.02) {
  const sessionId = randomUUID();
  const samples = Array.from({ length: seconds + 1 }, (_, i) => ({
    recordedAt: new Date(start + i * 1000).toISOString(), speedKph, rpm: 1300, gear: 11,
    fuelLitres: 500, odometerKm: odometerKm + i * stepKm, truckDamage: 0, cargoDamage: 0, position: { x: 0, z: 0, heading: 0 },
  }));
  for (let i = 0; i < samples.length; i += 200) {
    const response = await anonymous(new Request('http://ets2.test/api/ingest', {
      method: 'POST', headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, truck: { make: 'Volvo', model: 'FH16', fuelCapacityLitres: 900 }, job: null, samples: samples.slice(i, i + 200) }),
    }));
    if (response.status !== 200) return response.status;
  }
  return 200;
}
const get = async <T>(path: string) => (await signedIn(new Request(`http://ets2.test${path}`))).json() as Promise<T>;

beforeAll(async () => {
  await db.execute(sql`truncate users, vehicles, sessions, jobs, telemetry, telemetry_rollup_minute cascade`);
  await db.insert(users).values([
    { name: 'mike', displayName: 'Mike', apiKey: 'key-mike' },
    { name: 'sarah', displayName: 'Sarah', apiKey: 'key-sarah' },
  ]);
  // Mike: 10 km a month ago at a faster speed, then 2 km today. Sarah: 4 km today only.
  const monthAgo = new Date(Date.now() - 30 * DAY_MS).setUTCHours(12, 0, 0, 0);
  expect(await drive('key-mike', monthAgo, 1000, 500, 90)).toBe(200);
  expect(await drive('key-mike', Date.now() - 200_000, 2000, 100)).toBe(200);
  expect(await drive('key-sarah', Date.now() - 300_000, 5000, 200)).toBe(200);
  // Switching truck or profile mid-session jumps the odometer at a standstill; neither old nor new jumps count.
  expect(await drive('key-mike', monthAgo + 600_000, 700_000, 1, 0, 1000)).toBe(200);
  expect(await drive('key-sarah', Date.now() - 50_000, 900_000, 1, 0, 1000)).toBe(200);
  const rollup = Bun.spawnSync(['bun', join(import.meta.dir, 'rollup.ts')], { env: { ...process.env, DATABASE_URL: databaseUrl } });
  expect(rollup.exitCode).toBe(0);
});
afterAll(() => client.end());

describe('historical stats', () => {
  test('the nightly rollup moves old raw telemetry into per-minute rows', async () => {
    const [{ raw, rolled }] = await db.execute<{ raw: number; rolled: number }>(sql`
      select (select count(*)::int from telemetry where time < now() - interval '14 days') raw,
        (select count(*)::int from telemetry_rollup_minute) rolled`);
    expect(raw).toBe(0);
    expect(rolled).toBeGreaterThan(0);
  });

  test('the leaderboard ranks on the last 14 days and adds rolled-up history to the all-time total', async () => {
    const rows = await get<{ name: string; totalKm: number; allTimeKm: number }[]>('/api/leaderboard');
    expect(rows.map(r => r.name)).toEqual(['sarah', 'mike']);
    expect(rows[0].totalKm).toBeCloseTo(4, 3);
    expect(rows[0].allTimeKm).toBeCloseTo(4, 3);
    expect(rows[1].totalKm).toBeCloseTo(2, 3);
    // Per-minute rollups drop the one-second hop between minutes, so allow a little under 12 km.
    expect(rows[1].allTimeKm).toBeGreaterThan(11.8);
    expect(rows[1].allTimeKm).toBeLessThanOrEqual(12.0001);
  });

  test('a driver page has one history row per day, including rolled-up days', async () => {
    const { history } = await get<{ history: { bucket: string; distance_km: number; top_speed_kph: number; minutes: number; avg_speed: number }[] }>('/api/drivers/mike');
    expect(history).toHaveLength(2);
    const [old, today] = history;
    expect(new Date(old.bucket).getTime()).toBeLessThan(Date.now() - 14 * DAY_MS);
    expect(old.distance_km).toBeGreaterThan(9.8);
    expect(old.top_speed_kph).toBe(90);
    expect(old.avg_speed).toBeCloseTo((501 * 90) / 503, 3); // the standstill jump session adds two samples at 0 km/h
    expect(old.minutes).toBe(10);
    expect(today.distance_km).toBeCloseTo(2, 3);
    expect(today.top_speed_kph).toBe(72);
  });
});
