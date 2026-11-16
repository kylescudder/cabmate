import { readFileSync } from 'node:fs'

export function databaseUrl(
  url = process.env.DATABASE_URL,
  passwordFile = process.env.DATABASE_PASSWORD_FILE
) {
  if (!url) throw new Error('DATABASE_URL is required')
  const parsed = new URL(url)
  if (passwordFile)
    parsed.password = encodeURIComponent(
      readFileSync(passwordFile, 'utf8').trim()
    )
  return parsed.toString()
}

// Postgres.js v4 retries a connection the server refuses for too many
// connections (53300) until connect_timeout passes, instead of failing at once.
// Two seconds keeps that refusal to about three seconds, so requests fail
// quickly and do not pile up when the role's connection limit is reached.
export const CONNECT_TIMEOUT_SECONDS = 2
