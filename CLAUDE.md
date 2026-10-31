# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common commands

This is a Bun workspace (`apps/*`, `packages/*`). Run from the repo root:

```bash
bun install               # install all workspaces
bun run db:up             # disposable local Postgres on 127.0.0.1:5439 (docker-compose.yml)
bun run db:down           # stop it
bun run db:migrate        # apply Drizzle migrations (apps/web/drizzle)
bun run db:generate       # generate a migration after editing apps/web/server/schema.ts
bun run dev               # TanStack Start dev server on :3000
bun run build             # Vite production build (apps/web/dist)
bun run start             # production server: apps/web/server/index.ts
bun run test              # bun test apps/web/server — needs a migrated DB, TRUNCATES it
bun run typecheck         # tsc across all workspaces
AGENT_API_KEY=… bun run simulate   # synthetic driver posting to /api/ingest
```

Use bun (never pnpm or npm). Package names: `@ets2/web`, `@ets2/client`, `@ets2/shared`.

Env vars: see `.env.example` (`DATABASE_URL`, `DATABASE_PASSWORD_FILE`, `APP_ORIGIN`,
`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`).

## Architecture

```
agent / simulator ─► POST /api/ingest ─► apps/web server ─► Postgres
                                    └─ pg_notify('ets2_telemetry') ─► LISTEN ─► WS /ws ─► browser
```

**`packages/shared`** is the wire-format source of truth (`IngestPayload`, `TelemetrySample`).
Change the on-the-wire shape there, not in each app.

**`apps/web`** is TanStack Start + Clerk + Drizzle (postgres-js), matching the house stack.
- `server/index.ts` is the production Bun server: `/healthz`, static `dist/client`, then the Start handler.
- `server/api.ts` (`createApi`) implements every `/api/*` route; mounted via `src/routes/api.$.ts`.
  Ingest also answers the legacy Supabase path `/functions/v1/ingest` so installed agents keep working.
- Auth: ingest uses `Authorization: Bearer <users.api_key>`. Everything else requires a Clerk
  session (`server/auth.ts`); non-GET requests must be same-origin JSON (`APP_ORIGIN`).
- `server/ingest.ts` writes each batch in one transaction with a per-session advisory lock and a single
  multi-row telemetry `INSERT ... ON CONFLICT DO NOTHING` — keep the batch insert; per-row inserts won't keep up.
- Live updates: ingest calls `pg_notify` inside its transaction (delivered only on commit, only when rows were
  inserted). `server/live.ts` LISTENs, recomputes `listDrivers` (debounced, plus a 5s sweep for drivers going
  offline) and pushes the full driver list to `/ws` sockets when it changes. Because fan-out goes through
  Postgres, multiple app containers work. `/ws` checks Origin and the Clerk session cookie via `@clerk/backend`;
  sockets are closed after 15 minutes so the session is checked again on reconnect.
- `src/lib/useLiveDrivers.ts` holds one socket per tab, writes pushes into the `['drivers']` query cache,
  invalidates `['driver', name]` for drivers with new samples, and polls every 2s only while disconnected.
  `bun run dev` (Vite) has no `/ws`, so dev runs on that fallback poll; use `build` + `start` to exercise the socket.
- Plain Postgres only (no Timescale). Retention is `server/rollup.ts` (14 days raw, then per-minute rollups).
  Leaderboard and driver pages add the two for all-time stats; distance rules (odometer jumps ignored) live in `server/distance.ts`.

**`apps/client`** is the Windows agent reading scs-sdk-plugin shared memory and POSTing batches.

## Deployment

Herman via `deploy-core` — CI-built, attested images deployed by digest. See `deploy/README.md`.
`compose.yaml` is the host compose file; `docker-compose.yml` is local dev Postgres only.
Migrations run as the owner role in the `prepare` hook and grant the runtime role data access
(`DATABASE_RUNTIME_ROLE`); the app container never runs DDL.

## RadioMax broadcaster

All RadioMax source now lives in `services/radio-max`, an independent Bun 1.4.4
workspace/lockfile. Use root `radio:install`, `radio:dev`, `radio:test`,
`radio:typecheck` and `radio:build` scripts, or work from that directory.
CI/release workflows live at the repository root (`ci-radio.yml`,
`release-radio.yml`). Preserve the separate broadcaster runtime and audio URLs;
see `deploy/REPOSITORY-CONSOLIDATION.md` for deployment trust and credential setup.
