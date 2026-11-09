# Cabmate

Your ETS2 companion: friends on the map, your drives, and RadioMax along for the ride.

Public radio lives at `/radio`; driving and profile pages use invite-only Better Auth sign-in. The broadcaster remains independently deployed. Installed agents and ETS2 station entries depend on the ingest path `/api/ingest` and the plain-HTTP stream `http://radio-max-audio.kylescudder.co.uk/radio/main`; don't move, redirect or put authentication in front of them.

Connect your gaming PC to see where your friends are driving, what they’re hauling,
and how your journeys add up. Tune into RadioMax from the same app.

## Architecture

```
apps/client     telemetry agent (Windows, or Linux + Proton), reads scs-sdk-plugin shared memory
apps/web        TanStack Start app (Better Auth, Drizzle + Postgres) — companion UI
                and the JSON API, served by one Bun process (server/index.ts)
services/radio-max  RadioMax broadcaster, relay, legacy dashboard and deployment tests
packages/shared Zod schemas / TS types for the ingest wire format
```

```
agent ─► POST /api/ingest (Bearer <driver api key>) ─► Postgres
                                                        └─ NOTIFY ─► WS /ws ─► browser (auth session)
```

`scripts/simulate.ts` posts synthetic samples to the same ingest endpoint, so
the dashboard can be developed without the game running.

## Quick start

```bash
cp .env.example .env          # fill in the Better Auth settings
bun install
bun run db:up                 # disposable Postgres on 127.0.0.1:5439
bun run db:migrate
bun run dev                   # http://localhost:3000
# sign in, open /profile, copy your agent key, then:
AGENT_API_KEY=<key> bun run simulate
```

Checks: `bun run test` (needs a migrated database — uses `TEST_DATABASE_URL`
or `DATABASE_URL`, and **truncates it**), `bun run typecheck`, `bun run build`.
`bun run dev` has no `/ws`, so the dashboard polls instead; use `bun run build`
and `bun run start` to exercise the live socket.

`bun run test:db-budget` separately verifies the real query pool, LISTEN/reconnect,
isolated health, one-shot work and the eight-slot runtime-role limit against
disposable PostgreSQL. It requires an explicit `BUDGET_TEST_ADMIN_URL` and creates
and removes its own uniquely named test database/roles. See
[the connection budget and test setup](deploy/README.md#connection-budget).

## Identity

Dashboard users sign in with Better Auth: password, emailed code, magic link or
passkey, for addresses in `AUTH_ALLOWED_EMAILS` only (no sign-up). Settings and
the access model are in [deploy/README.md](deploy/README.md#authentication-better-auth).
On first visit each signed-in user gets a
`users` row with a generated agent `api_key`; the profile page lets them pick
a username and rotate the key. The agent sends that key as
`Authorization: Bearer <key>` with every batch.

## Data model

Drizzle schema in `apps/web/server/schema.ts`, migrations in `apps/web/drizzle/`
(`bun run db:generate` after schema changes).

- `users`, `vehicles`, `sessions`, `jobs`
- `telemetry` — raw ~1 Hz samples, keyed by `(session_id, time)` so replayed
  batches are ignored
- `telemetry_rollup_minute` — per-minute rollups of telemetry older than 14
  days (`apps/web/server/rollup.ts`)

## Real client (Windows)

`apps/client` reads the `Local\SCSTelemetry` shared memory block exposed by
[scs-sdk-plugin](https://github.com/RenCloud/scs-sdk-plugin). For Linux with
Proton, see [the next section](#real-client-linux--proton).

1. Install scs-sdk-plugin into the ETS2/ATS `bin/win_x64/plugins/` folder.
2. Sign in, open `/profile`, and copy the **config.json snippet** from the
   _Agent setup_ panel into `%USERPROFILE%\.cabmate\config.json`:
   ```json
   {
     "ingestUrl": "https://cabmate.kylescudder.co.uk/api/ingest",
     "apiKey": "<48 hex chars from your profile>"
   }
   ```
3. Start the game, then `bun dev:client`. The agent samples at 1 Hz, batches
   every second, and persists failed batches under
   `%USERPROFILE%\.cabmate\pending\` for replay.

## Real client (Linux + Proton)

Under Proton the game is the Windows build, so the plugin's shared memory only
exists inside Wine. A bridge such as
[winecarte](https://github.com/srounce/winecarte) mirrors it to `/dev/shm`, and
the Linux agent (`cabmate-agent`, from the same release) reads it from there.

1. In Steam, _Properties → Compatibility → Select compatibility tool_: pick
   Proton Experimental or a numbered Proton (ETS2 also ships a native Linux
   build, which this path does not cover).
2. Install scs-sdk-plugin into `bin/win_x64/plugins/` exactly as on Windows.
3. Install winecarte into `~/.local/bin/`.
4. Put `cabmate-agent` and `config.json` (same snippet as above) in
   `~/.cabmate/`, then `chmod +x ~/.cabmate/cabmate-agent`.
5. Set the launch options to:
   ```
   ~/.cabmate/cabmate-agent ~/.local/bin/winecarte-run %command% -developer -console
   ```
   The agent starts the game through winecarte and exits when it does. Keep the
   full path: Steam started from the desktop often lacks the `PATH` your terminal
   has, so `which winecarte-run` working does not mean Steam can find it.

The agent looks for `/dev/shm/SCSTelemetry`, `/dev/shm/SHSCSTelemetry` and
`/dev/shm/Local\SCSTelemetry`. If your bridge writes somewhere else, add
`"shmPath": "/path/to/file"` to `config.json`. A file that stops changing for
5 seconds counts as stale, so a mirror left behind after the game quits is
never uploaded.

Known gap: `winecarte-run` mirrors `Local\SHSCSTelemetry` for ETS2/ATS, but
RenCloud's scs-sdk-plugin creates `Local\SCSTelemetry`, so that plugin's telemetry
does not reach `/dev/shm` through a stock winecarte. Until winecarte supports it,
change both ETS2/ATS `from_wine_args` in `crates/winecarte-core/src/games.rs` to
`Local\SCSTelemetry|SCSTelemetry` and build your own `winecarte-run`.

## Broadcaster development

All active source lives in this repository. RadioMax remains a separate runtime
service with its own Bun workspace and lockfile under `services/radio-max`.

```bash
bun run radio:install
bun run radio:dev
bun run radio:test
bun run radio:typecheck
bun run radio:build
```

`ci-radio.yml` checks the broadcaster and `release-radio.yml` publishes
`ghcr.io/kylescudder/radio-max` and deploys it through the separate
`radio-production` environment, gated by the `RADIO_RELEASE_ENABLED` and
`RADIO_DEPLOY_ENABLED` repository variables. It never uses the web app's deploy
credentials.

## Deployment

Runs on Herman via `deploy-core`; see [deploy/README.md](deploy/README.md).
