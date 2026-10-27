import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { createApi } from './api';
import { database, sqlClient } from './db';
import { authorizeSocket, liveSocket, startLive, type SocketData } from './live';
import { users } from './schema';

// The live module uses the app's DATABASE_URL connection, so this needs a migrated disposable DB there.
const db = database();
const ingest = createApi(() => db, async () => null);

class FakeSocket {
  data: SocketData = {};
  messages: { type: string; drivers: { name: string; status: string; latest: { odometerKm: number } | null }[] }[] = [];
  send(message: string) { this.messages.push(JSON.parse(message)); }
  close() {}
  next(count: number) {
    return new Promise<void>((resolve, reject) => {
      const deadline = Date.now() + 3000;
      const poll = () => this.messages.length >= count ? resolve() : Date.now() > deadline ? reject(new Error('No push received')) : setTimeout(poll, 20);
      poll();
    });
  }
}
const sessionId = randomUUID();
const start = Date.now() - 10_000;
function post(odometerKm: number, second: number) {
  return ingest(new Request('http://ets2.test/api/ingest', { method: 'POST', headers: { authorization: 'Bearer key-live', 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId, truck: { make: 'Volvo', model: 'FH16', fuelCapacityLitres: 900 }, job: null,
      samples: [{ recordedAt: new Date(start + second * 1000).toISOString(), speedKph: 70, rpm: 1300, gear: 11,
        fuelLitres: 500, odometerKm, truckDamage: 0, cargoDamage: 0, position: { x: 10, z: 20, heading: 1 } }] }) }));
}

beforeAll(async () => {
  await db.execute(sql`truncate users, vehicles, sessions, jobs, telemetry, telemetry_rollup_minute cascade`);
  await db.insert(users).values({ name: 'lena', displayName: 'Lena', apiKey: 'key-live' });
  await startLive();
});
afterAll(() => sqlClient().end());

describe('live driver socket', () => {
  test('a new socket gets current driver state, then a push for every ingested batch', async () => {
    const socket = new FakeSocket();
    liveSocket.open?.(socket as never);
    await socket.next(1);
    expect(socket.messages[0].drivers).toMatchObject([{ name: 'lena', status: 'offline' }]);

    await post(2000, 1);
    await socket.next(2);
    expect(socket.messages[1].drivers).toMatchObject([{ name: 'lena', status: 'online', latest: { odometerKm: 2000 } }]);

    await post(2000.4, 2);
    await socket.next(3);
    expect(socket.messages[2].drivers[0].latest?.odometerKm).toBe(2000.4);

    // A replayed batch stores nothing, so nothing is pushed.
    await post(2000.4, 2);
    await Bun.sleep(400);
    expect(socket.messages).toHaveLength(3);
    liveSocket.close?.(socket as never, 1000, '');
  });

  test('handshakes without a Clerk session or from another origin are refused', async () => {
    const saved = { key: process.env.CLERK_SECRET_KEY, origin: process.env.APP_ORIGIN };
    process.env.APP_ORIGIN = 'https://ets2.test';
    try {
      delete process.env.CLERK_SECRET_KEY;
      expect(await authorizeSocket(new Request('https://ets2.test/ws', { headers: { origin: 'https://ets2.test' } }))).toBe(false);
      process.env.CLERK_SECRET_KEY = 'sk_test_unused';
      expect(await authorizeSocket(new Request('https://ets2.test/ws', { headers: { origin: 'https://evil.example' } }))).toBe(false);
    } finally {
      if (saved.key === undefined) delete process.env.CLERK_SECRET_KEY; else process.env.CLERK_SECRET_KEY = saved.key;
      if (saved.origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = saved.origin;
    }
  });
});
