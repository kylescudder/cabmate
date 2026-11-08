import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

type RuntimeEnv = Record<string, string | undefined>;

const origin = z.url().refine(value => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
}).transform(value => new URL(value).origin);

// Read at runtime (not during Vite's secret-free build). Unknown variables (for
// example leftover AUTH_PROVIDER or CLERK_* settings) are ignored.
export function readAuthEnv(runtimeEnv: RuntimeEnv = process.env) {
  const env = createEnv({
    server: {
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: z.string().min(32),
      BREVO_API_KEY: z.string().min(1),
      AUTH_EMAIL_FROM: z.email(),
      AUTH_EMAIL_DAILY_LIMIT: z.coerce.number().int().min(1).max(300).default(40),
      AUTH_ALLOWED_EMAILS: z.string().default('')
        .transform(value => value.split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean))
        .pipe(z.array(z.email())),
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
    onValidationError(issues): never {
      // Setting names only; values (secrets, addresses) never reach the logs.
      throw new Error('Invalid environment variables: ' + issues.map(issue => issue.path?.map(p => typeof p === 'object' ? p.key : p).join('.')).join(', '));
    },
  });
  if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_URL.startsWith('https://')) throw new Error('Invalid environment variables: BETTER_AUTH_URL');
  return env;
}
