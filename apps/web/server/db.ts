import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';
import { databaseUrl } from './connection';

export function connect(url = databaseUrl()) {
  const client = postgres(url, { max: 4, idle_timeout: 20, connect_timeout: 10 });
  return { db: drizzle(client, { schema }), client };
}
export type Database = ReturnType<typeof connect>['db'];
let connection: ReturnType<typeof connect> | undefined;
export function database() { return (connection ??= connect()).db; }
export function sqlClient() { return (connection ??= connect()).client; }
