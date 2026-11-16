import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'
import { databaseUrl } from './connection'

function createConnection(url: string, max: 1 | 3) {
  const client = postgres(url, { max, idle_timeout: 20, connect_timeout: 10 })
  return { db: drizzle(client, { schema }), client }
}
// Postgres.js LISTEN opens its own max-1 client outside this query pool.
// App allowance: 3 queries + 1 listener; see deploy/README.md for the role budget.
export function connect(url = databaseUrl()) {
  return createConnection(url, 3)
}
export type Database = ReturnType<typeof connect>['db']
let connection: ReturnType<typeof connect> | undefined
export function database() {
  return (connection ??= connect()).db
}
export function sqlClient() {
  return (connection ??= connect()).client
}
// Ends the process-wide pool and clears it, so the next database() or sqlClient()
// call opens a fresh one. Ending sqlClient() directly would break every later
// caller in the same process (bun test runs many files in one process).
export async function closeSharedConnection() {
  const current = connection
  connection = undefined
  await current?.client.end({ timeout: 1 })
}

export function connectOneShot(url = databaseUrl()) {
  return createConnection(url, 1)
}

let probe: ReturnType<typeof postgres> | undefined
export function healthClient() {
  return (probe ??= postgres(databaseUrl(), {
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10
  }))
}
