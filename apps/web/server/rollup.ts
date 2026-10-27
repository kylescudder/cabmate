import { sql } from 'drizzle-orm';
import { connect } from './db';
const { db, client } = connect();
try {
  await db.transaction(async tx => {
    // Work on whole days, so a minute can never be partially aggregated and later discarded.
    await tx.execute(sql`select pg_advisory_xact_lock(64229001)`);
    await tx.execute(sql`
      insert into telemetry_rollup_minute (user_id, bucket, avg_speed_kph, max_speed_kph, distance_km, samples)
      select user_id, date_trunc('minute', time), avg(speed_kph), max(speed_kph), greatest(0,max(odometer_km)-min(odometer_km)), count(*)
      from telemetry where time < date_trunc('day', now() - interval '14 days') group by user_id, date_trunc('minute', time)
      on conflict (user_id,bucket) do update set
        avg_speed_kph=(telemetry_rollup_minute.avg_speed_kph*telemetry_rollup_minute.samples+excluded.avg_speed_kph*excluded.samples)/(telemetry_rollup_minute.samples+excluded.samples),
        max_speed_kph=greatest(telemetry_rollup_minute.max_speed_kph,excluded.max_speed_kph),
        distance_km=telemetry_rollup_minute.distance_km+excluded.distance_km,
        samples=telemetry_rollup_minute.samples+excluded.samples
    `);
    await tx.execute(sql`delete from telemetry where time < date_trunc('day', now() - interval '14 days')`);
  });
  console.log('Telemetry retention completed');
} finally { await client.end(); }
