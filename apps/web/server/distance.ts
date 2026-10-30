import { sql, type SQL } from 'drizzle-orm';

// Driving in ETS2 moves the odometer at most ~0.7 km between one-second samples. Bigger jumps
// are a truck or profile switch, or a ferry/train, so they are not counted as distance.
export const MAX_STEP_KM = 5;
// Rollups imported from Supabase used max-min odometer per minute, so a jump can sit inside one.
// A real minute peaks around 50 km; anything over this is a jump and is left out.
export const MAX_MINUTE_KM = 60;

// Raw telemetry rows with `km`: the odometer change since the session's previous sample.
export function steps(where: SQL = sql`true`) {
  return sql`select user_id, session_id, time, speed_kph,
    case when d between 0 and ${MAX_STEP_KM} then d else 0 end km
    from (select *, odometer_km - lag(odometer_km) over (partition by session_id order by time) d from telemetry where ${where}) s`;
}
