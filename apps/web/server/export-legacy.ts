import postgres from 'postgres';
import { writeFile } from 'node:fs/promises';
import { databaseUrl } from './connection';
import { legacyTables } from './legacy';

const output = process.argv[2];
if (!output) throw new Error('Usage: bun server/export-legacy.ts /private/path/snapshot.json');
const client = postgres(databaseUrl(process.env.LEGACY_DATABASE_URL, process.env.LEGACY_DATABASE_PASSWORD_FILE), { max: 1 });
try {
  const tables = await client.begin('isolation level repeatable read read only', async tx => {
    const result: Record<string, unknown> = {};
    for (const table of legacyTables) result[table] = await tx`select * from public.${tx(table)}`;
    return result;
  });
  await writeFile(output, JSON.stringify({ version: 1, tables }), { mode: 0o600, flag: 'wx' });
  console.log('Legacy snapshot saved (contains private agent keys; keep protected)');
} finally { await client.end(); }
