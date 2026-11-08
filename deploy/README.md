# Deploying to Herman

Cabmate integration and the approval-gated hostname rollout are documented in [CABMATE.md](CABMATE.md). Existing deployment identifiers remain unchanged.

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
| `deploy/compose.deploy-hook.yaml` | `/Users/kyle/platform/apps/ets2-data-dashboard/deploy/compose.deploy-hook.yaml` (queue-only webhook receiver) |

## One-time setup

1. **Database** on platform PostgreSQL — database `cabmate`, two roles:
   - `cabmate_owner` owns the database and `public` schema; used only by the
     `prepare` hook for migrations. Password in
     `/Users/kyle/platform/projects/cabmate/owner-password`.
   - `cabmate_runtime` is a plain login role; the migration grants it
     `select/insert/update/delete` on all tables (no DDL). Password in
     `/Users/kyle/platform/projects/cabmate/runtime-password`.

   ```sql
   -- Reference for a fresh environment only; never recreate production storage.
   create role cabmate_owner login password '…' connection limit 1;
   create role cabmate_runtime login password '…' connection limit 8;
   create database cabmate owner cabmate_owner;
   \c cabmate
   alter schema public owner to cabmate_owner;
   ```
2. **App directory** `/Users/kyle/platform/apps/ets2-data-dashboard/` (mode 0700)
   containing `compose.yaml` and a protected `app.env` (0600, loaded through
   `env_file: app.env`):

   ```dotenv
   APP_ORIGIN=https://ets2.kylescudder.co.uk
   BETTER_AUTH_URL=<same value as APP_ORIGIN, https in production>
   BETTER_AUTH_SECRET=<stable, cryptographically random, at least 32 characters>
   BREVO_API_KEY=<Cabmate transactional API key>
   AUTH_EMAIL_FROM=<sender on a Brevo-verified domain>
   AUTH_EMAIL_DAILY_LIMIT=40
   AUTH_ALLOWED_EMAILS=<comma-separated driver emails>
   ```

   The Better Auth settings are required: pages, `/api/auth/*` and the `/ws`
   handshake fail closed and `verify.ts` rejects the release while any is
   missing or malformed. Validation errors name settings, never values. Keep the
   secret stable across releases, and keep it and the Brevo key out of Git,
   image layers and CI. Variables the app does not use are ignored. Changing
   `app.env` takes effect when the `web` container is recreated.
3. **Routing**: point `ets2.kylescudder.co.uk` at the `ets2-data-dashboard`
   alias on `platform-web`, port 3000. Do not route the old Supabase host
   `api.ets2.kylescudder.co.uk`: it is a two-level subdomain, which Cloudflare's
   Universal SSL does not cover, so it cannot serve TLS. Already-installed
   agents must have `ingestUrl` changed to the main hostname (see below).
   Ingest paths must be reachable without Access/SSO because
   the Windows agent authenticates with its own bearer API key.
   The dashboard's live view uses a WebSocket at `/ws` on the main hostname, so
   the proxy must pass `Upgrade` through (keep it behind the same edge policy as
   the pages). If it doesn't, the dashboard still works by polling every 2s.
4. **deploy-core**: copy `hooks.py`, add the registry entry, run
   `deploy_service.py --config … validate`, then flip `enabled: true`.

## Hooks

- `prepare(candidate, current)` — `core.backup_database('cabmate')`, then runs
  `bun apps/web/server/migrate.ts` from the candidate image as `cabmate_owner`
  with `DATABASE_RUNTIME_ROLE=cabmate_runtime` so grants are re-applied.
- `health(image)` — `healthz` returns `{status:"ok"}` only when the database
  is reachable.
- `accept(image)` — `verify.ts` checks the served revision matches the image,
  the Better Auth settings are valid, `/auth/sign-in` renders, read APIs and
  ingest refuse anonymous requests, `/api/auth/get-session` answers while
  sign-up answers 404, and `APP_ORIGIN` is set.

## Authentication (Better Auth)

Better Auth handles sign-in for the server, the rendered client and the `/ws`
handshake. Its tables (`auth_user`, `auth_session`, `auth_account`,
`auth_verification`, `auth_passkey`, `auth_rate_limit`, `auth_email_limit`,
`user_profile`) come from the owner migrations. A driver row is linked to its
Better Auth account by the nullable, unique `users.auth_user_id`
(`ON DELETE SET NULL`); a signed-in user without a linked driver gets a new
driver row (placeholder profile and a fresh agent key) on first sign-in. The
runtime keeps its connection budget and restricted role; the grant step covers
the auth tables. Agents are unaffected by sign-in: ingest uses each driver's API
key.

### Access model

Cabmate is invite-only. `AUTH_ALLOWED_EMAILS` is the source of truth: accounts
can be created only for those addresses (by email code or magic link), sign-up is
disabled, and every API request, server-rendered guard and `/ws` handshake
requires a session whose email is verified and still on the list. Removing an
address revokes access on the next request, including existing sessions and open
sockets at their next reconnect (at most 15 minutes). Email codes, magic links
and reset links are sent only to listed addresses; anyone else gets the same
generic success response and no email.

Sign-in lives at `/auth/<view>` with four methods, each linking to the others:
password (`/auth/sign-in`), email code (`/auth/email-otp`), magic link
(`/auth/magic-link`) and passkey. Forgot/reset password use
`/auth/forgot-password` and `/auth/reset-password`; `/auth/sign-up` redirects to
sign-in and `/login` redirects to `/auth/sign-in`. Every method returns to
`/profile` ("Your cab", where new drivers set up the agent), or to the protected
page that sent them to sign in (a same-site `?redirectTo=`). A password is added
from Your cab ("Set password" sends a reset link), then changed there. Passwords
are 12–128 characters; a reset revokes existing sessions. Signed-in drivers get
an avatar menu (Better Auth UI `UserButton`) with Profile (Your cab) and Sign out; public
pages (`/radio`, sign-in) do not load it. Display name and username stay in
Cabmate's own profile form, which also updates the Better Auth account name.

Emails use a branded table layout (`apps/web/server/auth-email.ts`) with the PNG
logo at `/email-logo.png`, sent through Brevo's HTTP API with an 8-second
timeout. Provider responses, codes, links and keys are never logged. Codes are
six digits, valid once for ten minutes with five attempts, and stored as an HMAC
keyed by `BETTER_AUTH_SECRET`. Magic links (10 minutes, stored hashed) and reset
links (30 minutes) are single-use. Persistent limits in `auth_email_limit`: one
email per recipient per minute, five per recipient per hour, and an app-wide
`AUTH_EMAIL_DAILY_LIMIT` (default 40 per rolling 24 hours); failed deliveries
count. Per-IP auth limits are stored in `auth_rate_limit`, keyed on
`cf-connecting-ip` (only the Cloudflare tunnel reaches the app).

Redirect safety: `callbackURL`, `newUserCallbackURL`, `errorCallbackURL` and
`redirectTo` must resolve to this origin (control characters and backslashes are
refused, and paths starting with `//` are rejected); the client applies the same
rule (`safeAppPath`) to every navigation the auth UI makes. `/api/auth/*`
forwards only the endpoints Cabmate uses (session, sign-out, account name, email
code, password, magic link, password reset, change password, list accounts,
passkeys) and answers 404 for everything else. Passkeys use the exact hostname of `BETTER_AUTH_URL` as
RP ID, require user verification and a signed-in, allowlisted driver to enroll.

On phones, magic links open wherever the mail app opens links, so email codes
are the most reliable mobile method. The code form keeps only the pending email
and request time in tab-scoped storage for ten minutes, so a reload after
switching to the mail app returns to code entry without sending another email;
it never stores the code. Brevo's free plan adds a `List-Unsubscribe` header to
transactional mail; respect suppression state and keep email codes as recovery.

### Profile photo

Your cab's profile form also uploads and removes a profile
photo, which the header avatar menu shows. The browser crops JPEG/PNG/WebP files
(up to 10 MB) to a 512-pixel square JPEG; `PUT /api/profile/avatar` then caps the
body at 512 KB and 4 megapixels, checks the file signature, decodes and
re-encodes it with `sharp` to a 256-pixel JPEG without metadata, and stores it as
`bytea` in the `user_profile` table (migration `0002_profile`, one row per
`auth_user`, deleted with it). `auth_user.image` is set to
`/api/profile/avatar?v=<random version>`, which changes on every upload. `GET`,
`PUT` and `DELETE` serve only the signed-in driver's own photo, need a verified
email still in `AUTH_ALLOWED_EMAILS`, require the app Origin for changes, and
answer `no-store`, `nosniff`, same-origin CORP. `update-user` still accepts only the account name, so
`user.image` can never point elsewhere. The photo is private: driver cards, the
map and the leaderboard do not show it. It is covered by the existing encrypted
database backups, and the owner migration's runtime grant (`all tables in schema
public`) already includes the new table, so no extra volume, service or secret is
needed. `sharp` ships prebuilt
libvips for linux-x64/arm64 glibc, so the `oven/bun` runtime image needs no extra
packages.

## Connection budget

Postgres.js + `drizzle-orm/postgres-js` remain the driver/adapter. The web process
reuses one lazy application client for Drizzle/raw queries. Postgres.js 3.4.9
creates a **separate** max-1 connection for `sqlClient().listen(...)`, outside the
query pool. Its reconnect/resubscribe behavior is unchanged; its idle timeout and
maximum lifetime are intentionally disabled by the driver so LISTEN stays open.

For **one web process**, the eight-slot `cabmate_runtime` role allowance is:

| Consumer | Maximum connections |
|---|---:|
| Application queries (shared singleton) | 3 |
| LISTEN (owned by that same Postgres.js client) | 1 |
| `/healthz` (separate lazy singleton) | 1 |
| One runtime CLI job: rollup **or** legacy import | 1 |
| Operator headroom | 2 |
| Total | 8 |

The application allowance is four **including** LISTEN. Query concurrency drops
from four to three; excess work queues. This is the smallest change that allows
isolated health plus a one-shot job while retaining two spare slots. Keeping four
query slots with LISTEN, health and a job would use seven and leave only one spare. No measured
production throughput guarantee is claimed; monitor ingest latency and query
queueing after an approved rollout. Batch ingestion, transactions, live sockets,
rollup serialization, auth and RadioMax contracts remain intact.

Query, health, one-shot and owner-migration clients use `idle_timeout: 20` and
`connect_timeout: 10` (seconds). CLI clients close in `finally`. Owner migrations
are max 1 on the separate `cabmate_owner` role; they do not consume runtime slots.
The runtime role gets public-table DML only, with no migration-schema access or
DDL. `healthcheck.ts` and deployment acceptance use HTTP and open no additional
database pools. Health retains the `users` accessibility check, revision JSON,
no-store success header and 503 failure response; it can run while query slots
are occupied. An isolated probe does not measure application queue latency.

This budget requires one running web process and at most one concurrent runtime
job. Two web processes can use ten slots before CLI/operator work; stop the old
process before starting the replacement, and serialize import/rollup/manual jobs.
Do not treat rolling overlap or replicas as covered by this budget. Operator
sessions and transient PostgreSQL cancellation sockets consume the spare slots;
two spares are available capacity, not permanently reserved connections. Keep the
platform-wide PostgreSQL budget for other apps and the separate owner role intact.

Before an authorized deployment, verify actual role limits (runtime 8, owner 1),
replica/overlap policy, running CLI jobs, and total platform connections. Do not
raise role limits to fit an overlapping rollout. These source settings and tests
do not establish the installed host's current state. No host hook change is
required for this connection patch: the CLI paths and invocation contract stay
the same. The authoritative packaged hook is
`deploy-core/app_hooks/ets2-data-dashboard/hooks.py`; `deploy/hooks.py` here is a
reference, and editing it alone never updates the installed deploy service.

### Disposable PostgreSQL verification

Use a unique container name and unused loopback port (55447 is only a suggestion).
Never point this test or the ordinary truncating suite at production storage.

```bash
docker run -d --name cabmate-budget-YOUR_UNIQUE_SUFFIX \
  -e POSTGRES_USER=cabmate_test_admin -e POSTGRES_PASSWORD=disposable \
  -e POSTGRES_DB=cabmate_test -p 127.0.0.1:55447:5432 postgres:17-alpine
# Wait for pg_isready in this container, then use the repo's Bun 1.4.4:
bun install --frozen-lockfile
BUDGET_TEST_ADMIN_URL=postgres://cabmate_test_admin:disposable@127.0.0.1:55447/cabmate_test \
  bun run test:db-budget
docker rm -f cabmate-budget-YOUR_UNIQUE_SUFFIX
```

The opt-in test requires a loopback admin URL and creates a UUID-named database,
owner (limit 1) and non-superuser runtime role (limit 8). It runs real migrations,
saturates the actual `sqlClient()` singleton, calls `startLive()`, checks HTTP
health during saturation, runs the actual rollup behind its advisory lock,
admits two operator sessions, and proves the ninth login fails with `53300`.
It also runs concurrent healthcheck CLIs and owner migration, verifies private
migration metadata/DDL denial, health failure/recovery, one-shot queuing, and real
WebSocket pushes before/after forced LISTEN-backend reconnection. The test socket
transport bypasses auth only in the harness; production session/origin guards are
unchanged. Database observation connections are test-admin connections, counted
separately from the runtime budget. Cleanup removes only this test's UUID-named
database and roles; the caller owns the disposable container lifecycle. CI runs
this suite separately against its disposable PostgreSQL 17 service.

## Automatic deploys

Every push to `main` builds the image, then the `deploy` job in `release.yml` posts an HMAC-signed
request for that digest to `https://deploy-ets2.kylescudder.co.uk/hooks/ets2-data-dashboard`, behind a
Cloudflare Access service-token policy. The queue-only receiver (`deploy-receivers`, no Docker socket, no
database) writes it to `deploy-spool/requests`; deploy-core then verifies the attestation, runs the hooks above and
publishes `state/public/deployment.json`, which the workflow polls until the host reports that exact image and
the site serves the commit in `X-ETS2-Revision`. The job runs in the main-only `production` environment
(`CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `DEPLOY_WEBHOOK_SECRET`) and only when the repository variable
`DEPLOY_ENABLED` is `true`. `ETS2_BASE_URL` is `https://ets2.kylescudder.co.uk`.

A deploy can also be driven manually:

```sh
python3 -B /Users/kyle/platform/deploy-core/current/deploy_service.py \
  --config /Users/kyle/platform/deploy-core/apps.json worker ets2-data-dashboard sha256:<digest>
```

## Moving data off the old Supabase stack

This import predates Better Auth and is kept for reference only: production was
moved in place and never needs it. Its identity map still targets the old Clerk
user IDs (stored in the now-unused `users.clerk_user_id`), so imported drivers
are not linked to a Better Auth account; each would need `users.auth_user_id`
set by hand before first sign-in, or the driver gets a new, empty cab.

1. Export a consistent read-only snapshot (contains agent API keys — keep it private):
   `LEGACY_DATABASE_URL=postgres://… bun apps/web/server/export-legacy.ts /private/ets2-snapshot.json`
2. Write `identity-map.json`: `{ "<supabase auth user uuid>": "user_<clerk id>", … }`.
3. For a fresh environment only, import into the **empty** `cabmate` database as the owner:
   `DATABASE_URL=postgres://cabmate_owner@…/cabmate bun run db:import /private/ets2-snapshot.json identity-map.json`
   Existing production data is renamed in place per [CABMATE.md](CABMATE.md), never re-imported.

UUIDs and agent API keys are preserved, so friends' installed agents keep
working once their `ingestUrl` in `%USERPROFILE%\.ets2-tracker\config.json` is
changed from the old `https://api.ets2.kylescudder.co.uk/functions/v1/ingest` to
`https://ets2.kylescudder.co.uk/api/ingest` (the path shown in the profile
page's *Agent setup* snippet). The old `/functions/v1/ingest` path is still
served on the main hostname, so only the host has to change if you prefer.

## Retention

`bun apps/web/server/rollup.ts` folds raw telemetry older than 14 days into
`telemetry_rollup_minute` and deletes it. Run it daily from the platform
scheduler, e.g. `docker compose exec -T web bun apps/web/server/rollup.ts`.
