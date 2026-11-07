import { expect, test } from 'bun:test';
import { readAuthEnv } from './env';

const betterAuth = {
  AUTH_PROVIDER: 'better-auth', BETTER_AUTH_URL: 'https://cabmate.example', BETTER_AUTH_SECRET: 'x'.repeat(32),
  BREVO_API_KEY: 'brevo-fixture', AUTH_EMAIL_FROM: 'cabmate@example.com', AUTH_ALLOWED_EMAILS: ' One@Example.com, two@example.com ,',
};

test('Clerk stays the default and needs no Better Auth settings', () => {
  expect(readAuthEnv({}).AUTH_PROVIDER).toBe('clerk');
  expect(readAuthEnv({ AUTH_PROVIDER: '' }).AUTH_PROVIDER).toBe('clerk');
  expect(() => readAuthEnv({ AUTH_PROVIDER: 'auth0' })).toThrow('AUTH_PROVIDER');
});

test('Better Auth settings are validated without echoing their values', () => {
  const env = readAuthEnv(betterAuth);
  expect(env.AUTH_ALLOWED_EMAILS).toEqual(['one@example.com', 'two@example.com']);
  expect(env.AUTH_EMAIL_DAILY_LIMIT).toBe(40);
  expect(() => readAuthEnv({ AUTH_PROVIDER: 'better-auth' })).toThrow('BETTER_AUTH_URL, BETTER_AUTH_SECRET, BREVO_API_KEY, AUTH_EMAIL_FROM');
  expect(() => readAuthEnv({ ...betterAuth, BETTER_AUTH_SECRET: 'too-short-secret' })).toThrow(/^Invalid environment variables: BETTER_AUTH_SECRET$/);
  expect(() => readAuthEnv({ ...betterAuth, AUTH_ALLOWED_EMAILS: 'not-an-email' })).toThrow(/^Invalid environment variables: AUTH_ALLOWED_EMAILS/);
  expect(() => readAuthEnv({ ...betterAuth, BETTER_AUTH_URL: 'https://cabmate.example/path' })).toThrow('BETTER_AUTH_URL');
  expect(() => readAuthEnv({ ...betterAuth, NODE_ENV: 'production', BETTER_AUTH_URL: 'http://cabmate.example' })).toThrow('BETTER_AUTH_URL');
});
