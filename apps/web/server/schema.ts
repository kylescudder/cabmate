import { pgTable, uuid, text, timestamp, real, doublePrecision, integer, primaryKey, uniqueIndex, index } from 'drizzle-orm/pg-core';

const time = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' });
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  clerkUserId: text('clerk_user_id').unique(),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  apiKey: text('api_key').notNull().unique(),
  createdAt: time('created_at').notNull().defaultNow(),
});
export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  make: text('make').notNull(), model: text('model').notNull(),
  createdAt: time('created_at').notNull().defaultNow(),
}, t => [uniqueIndex('vehicles_user_truck_idx').on(t.userId, t.make, t.model)]);
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  vehicleId: uuid('vehicle_id').references(() => vehicles.id),
  fuelCapacityLitres: real('fuel_capacity_litres'),
  startedAt: time('started_at').notNull().defaultNow(),
  endedAt: time('ended_at'),
});
export const jobs = pgTable('jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  cargo: text('cargo').notNull(), sourceCity: text('source_city'), destinationCity: text('destination_city'),
  income: doublePrecision('income'), startedAt: time('started_at').notNull().defaultNow(), completedAt: time('completed_at'),
}, t => [index('jobs_session_idx').on(t.sessionId)]);
export const telemetry = pgTable('telemetry', {
  time: time('time').notNull(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  jobId: uuid('job_id').references(() => jobs.id),
  speedKph: real('speed_kph').notNull(), rpm: real('rpm').notNull(), gear: integer('gear').notNull(),
  fuelLitres: real('fuel_litres').notNull(), odometerKm: doublePrecision('odometer_km').notNull(),
  truckDamage: real('truck_damage').notNull(), cargoDamage: real('cargo_damage').notNull(),
  posX: doublePrecision('pos_x').notNull(), posZ: doublePrecision('pos_z').notNull(), heading: real('heading').notNull(),
}, t => [primaryKey({ columns: [t.sessionId, t.time] }), index('telemetry_user_time_idx').on(t.userId, t.time), index('telemetry_time_idx').on(t.time)]);
export const rollups = pgTable('telemetry_rollup_minute', {
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  bucket: time('bucket').notNull(), avgSpeedKph: real('avg_speed_kph'), maxSpeedKph: real('max_speed_kph'),
  distanceKm: doublePrecision('distance_km'), samples: integer('samples'),
}, t => [primaryKey({ columns: [t.userId, t.bucket] })]);
