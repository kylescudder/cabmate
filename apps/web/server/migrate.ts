import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { databaseUrl } from './connection';

// Herman runs this as the owner role; the app itself connects as a runtime role with data access only.
const runtimeRole = process.env.DATABASE_RUNTIME_ROLE;
if (runtimeRole && !/^[a-z_][a-z0-9_]*$/.test(runtimeRole)) throw new Error('Invalid DATABASE_RUNTIME_ROLE');
const client = postgres(databaseUrl(), { max: 1, idle_timeout: 20, connect_timeout: 10, onnotice: () => {} });
try {
  await migrate(drizzle(client), { migrationsFolder: new URL('../drizzle', import.meta.url).pathname, migrationsSchema: 'drizzle' });
  if (runtimeRole) {
    await client.begin(async tx => {
      await tx`grant usage on schema public to ${tx(runtimeRole)}`;
      await tx`grant select, insert, update, delete on all tables in schema public to ${tx(runtimeRole)}`;
    });
    console.log('Runtime role grants applied');
  }
  console.log('ETS2 schema is ready');
} finally { await client.end(); }
