import { readFileSync } from 'node:fs';

export function databaseUrl(url = process.env.DATABASE_URL, passwordFile = process.env.DATABASE_PASSWORD_FILE) {
  if (!url) throw new Error('DATABASE_URL is required');
  const parsed = new URL(url);
  if (passwordFile) parsed.password = encodeURIComponent(readFileSync(passwordFile, 'utf8').trim());
  return parsed.toString();
}
