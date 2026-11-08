import { bigint, boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

// Better Auth tables, kept separate from drivers, vehicles and telemetry.
const time = (name: string) => timestamp(name, { withTimezone: true });
export const authUser = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
});
export const authSession = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: time('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
}, t => [index('auth_session_user_idx').on(t.userId)]);
export const authAccount = pgTable('auth_account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: time('access_token_expires_at'),
  refreshTokenExpiresAt: time('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [index('auth_account_user_idx').on(t.userId), uniqueIndex('auth_account_provider_idx').on(t.providerId, t.accountId)]);
export const authVerification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: time('expires_at').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
  updatedAt: time('updated_at').notNull().defaultNow(),
}, t => [index('auth_verification_identifier_idx').on(t.identifier)]);
export const authPasskey = pgTable('auth_passkey', {
  id: text('id').primaryKey(),
  name: text('name'),
  publicKey: text('public_key').notNull(),
  userId: text('user_id').notNull().references(() => authUser.id, { onDelete: 'cascade' }),
  credentialID: text('credential_id').notNull().unique(),
  counter: integer('counter').notNull(),
  deviceType: text('device_type').notNull(),
  backedUp: boolean('backed_up').notNull(),
  transports: text('transports'),
  createdAt: time('created_at'),
  aaguid: text('aaguid'),
}, t => [index('auth_passkey_user_idx').on(t.userId)]);
export const authRateLimit = pgTable('auth_rate_limit', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  count: integer('count').notNull(),
  lastRequest: bigint('last_request', { mode: 'number' }).notNull(),
});
export const authEmailLimit = pgTable('auth_email_limit', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  windowStartedAt: time('window_started_at').notNull(),
});
