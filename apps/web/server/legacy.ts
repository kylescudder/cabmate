import { sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from './db';
import * as schema from './schema';

const snapshotSchema = z.object({ version: z.literal(1), tables: z.object({
  users: z.array(z.record(z.unknown())), vehicles: z.array(z.record(z.unknown())),
  sessions: z.array(z.record(z.unknown())), jobs: z.array(z.record(z.unknown())),
  telemetry: z.array(z.record(z.unknown())), telemetry_rollup_minute: z.array(z.record(z.unknown())),
}) });
const identityMapSchema = z.record(z.string().regex(/^user_[a-zA-Z0-9]+$/));
export const legacyTables = ['users', 'vehicles', 'sessions', 'jobs', 'telemetry', 'telemetry_rollup_minute'] as const;

export async function importLegacy(db: Database, input: unknown, identities: unknown) {
  const snapshot = snapshotSchema.parse(input);
  const identityMap = identityMapSchema.parse(identities);
  const mapped = snapshot.tables.users.map(u => {
    const key = u.auth_user_id as string | null;
    if (key && !identityMap[key]) throw new Error('Every legacy auth user needs an explicit Clerk identity mapping');
    return { ...u, clerk_user_id: key ? identityMap[key] : null };
  });
  const clerkIds = mapped.flatMap(u => u.clerk_user_id ? [u.clerk_user_id] : []);
  if (new Set(clerkIds).size !== clerkIds.length) throw new Error('Duplicate Clerk identity mapping');
  await db.transaction(async tx => {
    await tx.execute(sql`lock table users, vehicles, sessions, jobs, telemetry, telemetry_rollup_minute in access exclusive mode`);
    const [{ count }] = await tx.execute(sql`select count(*)::int as count from users`);
    if (count !== 0) throw new Error('Legacy import requires an empty destination');
    for (const name of legacyTables) {
      const table = name === 'telemetry_rollup_minute' ? schema.rollups : schema[name];
      // Copy only columns defined in the new Drizzle schema, preserving UUIDs and agent keys.
      const { getTableColumns } = await import('drizzle-orm');
      const columns = getTableColumns(table);
      const source = name === 'users' ? mapped : snapshot.tables[name];
      for (let offset = 0; offset < source.length; offset += 200) {
        const rows = source.slice(offset, offset + 200).map(row => Object.fromEntries(Object.entries(columns)
          .filter(([, col]) => Object.hasOwn(row, col.name)).map(([key, col]) => [key, (row as Record<string, unknown>)[col.name]])));
        // The boundary is a validated legacy snapshot; SQL constraints validate column values and relationships.
        await tx.insert(table).values(rows as never);
      }
    }
  });
  return Object.fromEntries(legacyTables.map(name => [name, snapshot.tables[name].length]));
}
