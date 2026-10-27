import { defineConfig } from 'drizzle-kit';
import { databaseUrl } from './server/connection';

export default defineConfig({
  schema: './server/schema.ts', out: './drizzle', dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL ? databaseUrl() : 'postgres://localhost/ets2' },
});
