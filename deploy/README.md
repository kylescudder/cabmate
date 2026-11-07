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

1. **GitHub**: set the repository variable `VITE_CLERK_PUBLISHABLE_KEY` (the
   production Clerk publishable key; Vite embeds it at build time).
2. **Database** on platform PostgreSQL — database `cabmate`, two roles:
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
   alias on `platform-web`, port 3000. Do not route the old Supabase host
   `api.ets2.kylescudder.co.uk`: it is a two-level subdomain, which Cloudflare's
   Universal SSL does not cover, so it cannot serve TLS. Already-installed
   agents must have `ingestUrl` changed to the main hostname (see below).
   Ingest paths must be reachable without Access/SSO because
   the Windows agent authenticates with its own bearer API key.
   The dashboard's live view uses a WebSocket at `/ws` on the main hostname, so
   the proxy must pass `Upgrade` through (keep it behind the same edge policy as
   the pages). If it doesn't, the dashboard still works by polling every 2s.
5. **deploy-core**: copy `hooks.py`, add the registry entry, run
   `deploy_service.py --config … validate`, then flip `enabled: true`.

## Hooks

- `prepare(candidate, current)` — `core.backup_database('cabmate')`, then runs
  `bun apps/web/server/migrate.ts` from the candidate image as `cabmate_owner`
  with `DATABASE_RUNTIME_ROLE=cabmate_runtime` so grants are re-applied.
- `health(image)` — `healthz` returns `{status:"ok"}` only when the database
  is reachable.
- `accept(image)` — `verify.ts` checks the served revision matches the image,
  the sign-in page of the selected provider renders, read APIs and ingest refuse
  anonymous requests, and the provider's (Clerk or Better Auth) and origin
  configuration is present.

## Better Auth rollout and Clerk rollback

`AUTH_PROVIDER` selects exactly one authentication provider for the server, the
rendered client and the `/ws` handshake. It defaults to `clerk`, so this additive
release can be deployed before the production sign-in flow changes. The image is
the same for both providers (the provider is read at runtime); changing it
requires recreating the `web` container, not hot-swapping its environment.

The owner migration (`0001_better_auth`) adds `auth_user`, `auth_session`,
`auth_account`, `auth_verification`, `auth_passkey`, `auth_rate_limit` and
`auth_email_limit`, plus a nullable, unique `users.auth_user_id` that links a
driver to their Better Auth account (`ON DELETE SET NULL`). Nothing existing is
rewritten or dropped, and `users.clerk_user_id` stays in place for rollback. The
runtime keeps its connection budget and restricted role; the existing grant step
covers the new tables.

Add these to the protected `app.env`, keeping the Clerk keys:

```dotenv
AUTH_PROVIDER=clerk
BETTER_AUTH_URL=<same value as APP_ORIGIN, https in production>
BETTER_AUTH_SECRET=<stable, cryptographically random, at least 32 characters>
BREVO_API_KEY=<Cabmate transactional API key>
AUTH_EMAIL_FROM=<sender on a Brevo-verified domain>
AUTH_EMAIL_DAILY_LIMIT=40
AUTH_ALLOWED_EMAILS=<comma-separated driver emails>
```

Keep the secret stable across releases, and keep it and the Brevo key out of Git,
image layers and CI. These settings are validated at runtime even while Clerk is
selected (a malformed `AUTH_ALLOWED_EMAILS` fails page loads), so check them
before recreating the container. Validation errors name settings, never values.

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
passkeys) and answers 404 for everything else, and for everything while
`AUTH_PROVIDER=clerk`. Passkeys use the exact hostname of `BETTER_AUTH_URL` as
RP ID, require user verification and a signed-in, allowlisted driver to enroll.

On phones, magic links open wherever the mail app opens links, so email codes
are the most reliable mobile method. The code form keeps only the pending email
and request time in tab-scoped storage for ten minutes, so a reload after
switching to the mail app returns to code entry without sending another email;
it never stores the code. Brevo's free plan adds a `List-Unsubscribe` header to
transactional mail; respect suppression state and keep email codes as recovery.

### Linking existing drivers

Driver data is keyed by `users.id`, and each driver row carries its Clerk user
ID. Under Better Auth the driver is found through `users.auth_user_id` instead;
a Better Auth user without a link gets a new driver row on first sign-in (as
Clerk did). So link existing drivers **before** switching provider, or they
would start with an empty cab and a new agent key.

`apps/web/server/link-clerk-users.ts` lists Clerk users through the Clerk
Backend API, takes each user's **verified primary email**, finds or creates the
Better Auth user (`emailVerified: true`) and sets `users.auth_user_id`. It is a
dry run unless `--apply` is given, idempotent, prints counts only (never emails,
IDs or keys), and needs `CLERK_SECRET_KEY` and the runtime database URL (it uses
one connection, the budget's "one runtime CLI job"). Drivers without a verified
primary email, and any driver whose email already belongs to a different
linked driver, are counted as `noVerifiedEmail`/`conflicts` and left for manual
resolution. Linking never grants access by itself: the address must also be in
`AUTH_ALLOWED_EMAILS` (`notAllowlisted` counts those that are not).

### Cutover

1. Deploy the image as usual with `AUTH_PROVIDER=clerk`; the owner migration adds
   the tables. Existing acceptance checks must pass unchanged.
2. Add the settings above to `app.env` (still `clerk`), and recreate `web`.
3. Dry run, then apply, from the running container:
   `docker compose exec -T web bun apps/web/server/link-clerk-users.ts` then
   `… link-clerk-users.ts --apply`. Review the counts; rerunning is safe.
4. Set `AUTH_PROVIDER=better-auth` and recreate only `web` with the same image.
   `verify.ts` then checks `/auth/sign-in`, `/api/auth/get-session` and that
   sign-up answers 404.
5. Verify email-code sign-in lands on Your cab with the driver's existing
   profile and agent key, the live map socket, password set/reset, sign-out,
   and passkey enrollment/sign-in on a real device.

Rollback: set `AUTH_PROVIDER=clerk` and recreate `web` with the same image. Keep
the Clerk keys, production Clerk app and DNS until Better Auth has been stable.
Leave the additive auth tables and links in place; never restore an older
database to change providers, because that would discard newer telemetry.
Agents are unaffected by either switch: ingest uses each driver's API key.

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
rollup serialization, Clerk and RadioMax contracts remain intact.

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
transport bypasses auth only in the harness; production Clerk/origin guards are
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

Supabase auth users have to be mapped to Clerk users explicitly; nothing is
matched by email.

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
