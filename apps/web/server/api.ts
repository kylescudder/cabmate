import { randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import { MAX_MINUTE_KM, steps } from './distance';
import { ingest, newApiKey } from './ingest';
import { jobs, sessions, telemetry, users, vehicles } from './schema';

const profileInput = z.object({
  name: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/),
  display_name: z.string().trim().min(1).max(80),
});
const publicUser = { id: users.id, name: users.name, display_name: users.displayName, avatar_url: users.avatarUrl };

export async function profile(db: Database, clerkUserId: string) {
  const id = randomUUID();
  await db.insert(users).values({ id, clerkUserId, name: `driver-${id.slice(0, 24)}`, displayName: 'Driver', apiKey: newApiKey() })
    .onConflictDoNothing({ target: users.clerkUserId });
  return (await db.select({ ...publicUser, api_key: users.apiKey }).from(users).where(eq(users.clerkUserId, clerkUserId)))[0];
}

// Shared by GET /api/drivers and the /ws broadcaster, so both report the same online state.
export async function listDrivers(db: Database) {
  const rows = await db.select(publicUser).from(users).orderBy(users.displayName);
  const latest = await db.execute(sql`
    select distinct on (t.user_id) t.*, v.make, v.model, s.fuel_capacity_litres,
      j.cargo, j.source_city, j.destination_city, j.income
    from telemetry t join sessions s on s.id = t.session_id
    left join vehicles v on v.id = s.vehicle_id left join jobs j on j.id = t.job_id
    where t.time > now() - interval '30 seconds' order by t.user_id, t.time desc
  `);
  const byUser = new Map(latest.map(r => [r.user_id, r]));
  return rows.map(u => {
    const t = byUser.get(u.id);
    return { userId: u.id, name: u.name, displayName: u.display_name, avatarUrl: u.avatar_url,
      status: t ? 'online' : 'offline', truck: t?.make ? { make: t.make, model: t.model } : null,
      fuelCapacityLitres: t?.fuel_capacity_litres ?? null,
      latest: t ? { recordedAt: new Date(t.time as string).toISOString(), speedKph: t.speed_kph, rpm: t.rpm, gear: t.gear, fuelLitres: t.fuel_litres, odometerKm: t.odometer_km, truckDamage: t.truck_damage, cargoDamage: t.cargo_damage, position: { x: t.pos_x, z: t.pos_z, heading: t.heading } } : null,
      job: t?.cargo ? { cargo: t.cargo, sourceCity: t.source_city ?? '', destinationCity: t.destination_city ?? '', income: t.income ?? 0 } : null };
  });
}

// Raw telemetry covers roughly the last 14 days; rollup.ts folds anything older into
// per-minute rows and deletes it. All-time figures therefore add the two together.
export async function leaderboard(db: Database) {
  return db.execute(sql`
    with steps as (${steps()}), rolled as (
      select user_id, sum(distance_km) km from telemetry_rollup_minute where distance_km <= ${MAX_MINUTE_KM} group by user_id
    ) select u.id, u.name, u.display_name,
      coalesce((select sum(km) from steps where steps.user_id = u.id and time > now() - interval '14 days'), 0)::float8 as "totalKm",
      (coalesce((select sum(km) from steps where steps.user_id = u.id), 0)
        + coalesce((select km from rolled where rolled.user_id = u.id), 0))::float8 as "allTimeKm"
    from users u order by "totalKm" desc, "allTimeKm" desc, u.display_name
  `);
}

// One row per UTC day the driver drove, from the first rollup to the latest raw sample.
export async function driverDays(db: Database, userId: string) {
  return db.execute(sql`
    with steps as (${steps(sql`user_id = ${userId}`)}), days as (
      select date_trunc('day', bucket) bucket, sum(distance_km) filter (where distance_km <= ${MAX_MINUTE_KM}) km,
        sum(avg_speed_kph * samples) speed_sum, sum(samples) samples, max(max_speed_kph) top, count(*) minutes
      from telemetry_rollup_minute where user_id = ${userId} group by 1
      union all
      select date_trunc('day', time), sum(km), sum(speed_kph), count(*), max(speed_kph), count(distinct date_trunc('minute', time))
      from steps group by 1
    ) select bucket, coalesce(sum(km), 0)::float8 distance_km, (sum(speed_sum) / nullif(sum(samples), 0))::float8 avg_speed,
      max(top)::float8 top_speed_kph, sum(minutes)::int minutes
    from days group by bucket order by bucket
  `);
}

export function createApi(getDb: () => Database, getIdentity: () => Promise<string | null>) {
  return async (request: Request): Promise<Response> => {
    const { pathname, origin } = new URL(request.url);
    try {
      if (request.method === 'POST' && (pathname === '/api/ingest' || pathname === '/functions/v1/ingest')) {
        if (Number(request.headers.get('content-length') ?? 0) > 512_000) return Response.json({ error: 'Payload too large' }, { status: 413 });
        return await ingest(getDb(), request);
      }
      const identity = await getIdentity();
      if (!identity) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'cache-control': 'no-store' } });
      // Every mutation uses same-origin JSON. Agent ingestion uses a separate bearer credential.
      if (request.method !== 'GET' && (request.headers.get('origin') !== (process.env.APP_ORIGIN || origin) || !request.headers.get('content-type')?.startsWith('application/json'))) {
        return Response.json({ error: 'Invalid request origin' }, { status: 403 });
      }
      const db = getDb();
      let result: unknown;
      if (pathname === '/api/profile' && request.method === 'GET') {
        const own = await profile(db, identity);
        const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(sessions).where(eq(sessions.userId, own.id));
        result = { ...own, sessionCount: count };
      } else if (pathname === '/api/profile' && request.method === 'PATCH') {
        const input = profileInput.safeParse(await request.json().catch(() => null));
        if (!input.success) return Response.json({ error: 'Enter a display name and a username of 2–32 lowercase letters, digits or hyphens.' }, { status: 400 });
        await profile(db, identity);
        await db.update(users).set({ name: input.data.name, displayName: input.data.display_name }).where(eq(users.clerkUserId, identity));
        result = { ok: true };
      } else if (pathname === '/api/profile/key' && request.method === 'POST') {
        await profile(db, identity);
        const [row] = await db.update(users).set({ apiKey: newApiKey() }).where(eq(users.clerkUserId, identity)).returning({ api_key: users.apiKey });
        result = row;
      } else if (pathname === '/api/drivers' && request.method === 'GET') {
        result = await listDrivers(db);
      } else if (pathname === '/api/leaderboard' && request.method === 'GET') {
        result = await leaderboard(db);
      } else if (pathname.startsWith('/api/drivers/') && request.method === 'GET') {
        const name = decodeURIComponent(pathname.slice('/api/drivers/'.length));
        const [user] = await db.select(publicUser).from(users).where(eq(users.name, name));
        if (!user) return Response.json({ error: 'Driver not found' }, { status: 404 });
        const history = await driverDays(db, user.id);
        const recent = await db.select({ time: telemetry.time, speed_kph: telemetry.speedKph, fuel_litres: telemetry.fuelLitres, odometer_km: telemetry.odometerKm, job_id: telemetry.jobId,
          jobs: { cargo: jobs.cargo, source_city: jobs.sourceCity, destination_city: jobs.destinationCity } })
          .from(telemetry).leftJoin(jobs, eq(jobs.id, telemetry.jobId)).where(eq(telemetry.userId, user.id)).orderBy(desc(telemetry.time)).limit(200);
        result = { user, history, recent };
      } else return Response.json({ error: 'Not found' }, { status: 404 });
      return Response.json(result, { headers: { 'cache-control': 'no-store' } });
    } catch (error) {
      const code = (error as { cause?: { code?: string }; code?: string }).cause?.code ?? (error as { code?: string }).code;
      if (code === '23505') return Response.json({ error: 'That username is taken' }, { status: 409 });
      console.error('API request failed', { path: pathname, code: code ?? 'internal' });
      return Response.json({ error: 'Request failed. Please try again.' }, { status: 500 });
    }
  };
}
