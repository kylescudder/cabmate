import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { IngestPayload } from '@ets2/shared';
import type { Database } from './db';
import { jobs, sessions, telemetry, users, vehicles } from './schema';

// Delivered on commit; every app instance LISTENs and pushes fresh driver state to its sockets.
export const LIVE_CHANNEL = 'ets2_telemetry';
export function newApiKey() { return randomBytes(24).toString('hex'); }
export async function ingest(db: Database, request: Request) {
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1];
  if (!token) return Response.json({ error: 'Missing bearer token' }, { status: 401 });
  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.apiKey, token));
  if (!user) return Response.json({ error: 'Unknown API key' }, { status: 401 });
  const parsed = IngestPayload.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid telemetry payload' }, { status: 400 });
  const { sessionId, truck, job, samples } = parsed.data;
  return db.transaction(async tx => {
    // Serialize batches for the same session, including first-session races.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${sessionId}, 0))`);
    const [existing] = await tx.select().from(sessions).where(eq(sessions.id, sessionId));
    if (existing && existing.userId !== user.id) return Response.json({ error: 'Session belongs to another driver' }, { status: 403 });
    const [vehicle] = await tx.insert(vehicles).values({ userId: user.id, make: truck.make, model: truck.model })
      .onConflictDoUpdate({ target: [vehicles.userId, vehicles.make, vehicles.model], set: { model: truck.model } }).returning();
    await tx.insert(sessions).values({ id: sessionId, userId: user.id, vehicleId: vehicle.id, fuelCapacityLitres: truck.fuelCapacityLitres })
      .onConflictDoNothing();
    let jobId: string | undefined;
    if (job) {
      const [found] = await tx.select().from(jobs).where(and(eq(jobs.sessionId, sessionId), eq(jobs.cargo, job.cargo), eq(jobs.sourceCity, job.sourceCity), eq(jobs.destinationCity, job.destinationCity), eq(jobs.income, job.income)));
      jobId = found?.id ?? (await tx.insert(jobs).values({ sessionId, ...job }).returning())[0].id;
    }
    const inserted = await tx.insert(telemetry).values(samples.map(s => ({
      time: s.recordedAt, sessionId, userId: user.id, jobId,
      speedKph: s.speedKph, rpm: s.rpm, gear: s.gear, fuelLitres: s.fuelLitres, odometerKm: s.odometerKm,
      truckDamage: s.truckDamage, cargoDamage: s.cargoDamage, posX: s.position.x, posZ: s.position.z, heading: s.position.heading,
    }))).onConflictDoNothing().returning({ time: telemetry.time });
    if (inserted.length) await tx.execute(sql`select pg_notify(${LIVE_CHANNEL}, ${user.id})`);
    return Response.json({ ok: true, inserted: inserted.length });
  });
}
