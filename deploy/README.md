# Deploying to Herman

ETS2 follows the house deployment model in `deploy-core`: GitHub Actions builds
and attests a multi-arch image for every commit on `main`, and Herman's
deploy service pulls the release **by digest**, runs the app hooks, and swaps
the container. There is no build on the host, no published host port, and the
database is the shared platform PostgreSQL.

```
push to main ─► CI (migrate + tests + build + typecheck)
             ─► release.yml: amd64/arm64 images ─► manifest ─► provenance attestation
             ─► ghcr.io/kylescudder/ets2-data-dashboard@sha256:…
Herman deploy-core worker ─► prepare (pg dump + owner migration + runtime grants)
                          ─► compose up (read-only, cap_drop ALL, platform-web/platform-db)
                          ─► health (healthcheck.ts) ─► accept (verify.ts) ─► or roll back
```

## Files in this repo

| File | Goes to |
|---|---|
| `compose.yaml` | `/Users/kyle/platform/apps/ets2-data-dashboard/compose.yaml` |
| `deploy/hooks.py` | `deploy-core/app_hooks/ets2-data-dashboard/hooks.py` (tested service release) |
| `deploy/registry-entry.json` | entry in `deploy-core/config/herman.json` and the installed `apps.json` (starts `enabled: false`) |

## One-time setup

1. **GitHub**: set the repository variable `VITE_CLERK_PUBLISHABLE_KEY` (the
   production Clerk publishable key; Vite embeds it at build time).
2. **Database** on platform PostgreSQL — database `ets2`, two roles:
   - `ets2_owner` owns the database and `public` schema; used only by the
     `prepare` hook for migrations. Password in
     `/Users/kyle/platform/projects/ets2/owner-password`.
   - `ets2_runtime` is a plain login role; the migration grants it
     `select/insert/update/delete` on all tables (no DDL). Password in
     `/Users/kyle/platform/projects/ets2/runtime-password`.

   ```sql
   create role ets2_owner login password '…';
   create role ets2_runtime login password '…';
   create database ets2 owner ets2_owner;
   \c ets2
   alter schema public owner to ets2_owner;
   ```
3. **App directory** `/Users/kyle/platform/apps/ets2-data-dashboard/` (mode 0700)
   containing `compose.yaml` and a protected `app.env` (0600):

   ```
   APP_ORIGIN=https://ets2.kylescudder.co.uk
   CLERK_PUBLISHABLE_KEY=pk_live_…
   CLERK_SECRET_KEY=sk_live_…
   CLERK_SIGN_IN_URL=/login
   CLERK_SIGN_UP_URL=/login
   ```

   `CLERK_PUBLISHABLE_KEY` is needed at runtime as well as build time — without
   it Clerk's server middleware fails every page render with a 500.
4. **Routing**: point `ets2.kylescudder.co.uk` at the `ets2-data-dashboard`
   alias on `platform-web`, port 3000. Also route the old Supabase host
   `api.ets2.kylescudder.co.uk` to the same service — already-installed agents
   post to `https://api.ets2.kylescudder.co.uk/functions/v1/ingest`, which the
   app still serves. Ingest paths must be reachable without Access/SSO because
   the Windows agent authenticates with its own bearer API key.
   The dashboard's live view uses a WebSocket at `/ws` on the main hostname, so
   the proxy must pass `Upgrade` through (keep it behind the same edge policy as
   the pages). If it doesn't, the dashboard still works by polling every 2s.
5. **deploy-core**: copy `hooks.py`, add the registry entry, run
   `deploy_service.py --config … validate`, then flip `enabled: true`.

## Hooks

- `prepare(candidate, current)` — `core.backup_database('ets2')`, then runs
  `bun apps/web/server/migrate.ts` from the candidate image as `ets2_owner`
  with `DATABASE_RUNTIME_ROLE=ets2_runtime` so grants are re-applied.
- `health(image)` — `healthz` returns `{status:"ok"}` only when the database
  is reachable.
- `accept(image)` — `verify.ts` checks the served revision matches the image,
  the login page renders, read APIs and ingest refuse anonymous requests, and
  Clerk/origin configuration is present.

A first deploy can be driven manually:

```sh
python3 -B /Users/kyle/platform/deploy-core/current/deploy_service.py \
  --config /Users/kyle/platform/deploy-core/apps.json worker ets2-data-dashboard sha256:<digest>
```

## Moving data off the old Supabase stack

Supabase auth users have to be mapped to Clerk users explicitly; nothing is
matched by email.

1. Export a consistent read-only snapshot (contains agent API keys — keep it private):
   `LEGACY_DATABASE_URL=postgres://… bun apps/web/server/export-legacy.ts /private/ets2-snapshot.json`
2. Write `identity-map.json`: `{ "<supabase auth user uuid>": "user_<clerk id>", … }`.
3. After the first migration, import into the **empty** `ets2` database as the owner:
   `DATABASE_URL=postgres://ets2_owner@… bun run db:import /private/ets2-snapshot.json identity-map.json`

UUIDs and agent API keys are preserved, so friends' installed agents keep
working once their configured `ingestUrl` host points at Herman (the old
`/functions/v1/ingest` path is still served).

## Retention

`bun apps/web/server/rollup.ts` folds raw telemetry older than 14 days into
`telemetry_rollup_minute` and deletes it. Run it daily from the platform
scheduler, e.g. `docker compose exec -T web bun apps/web/server/rollup.ts`.
