# Cabmate: merged web app rollout

Kyle chose Cabmate on 31 October 2026. RadioMax remains the station name.
This is the implementation plan for an approved future rollout, not a record of
production changes. The canonical proposed hostname is
`cabmate.kylescudder.co.uk`; it has not been registered or configured by this PR.

## Independent services

The ETS2 repository supplies the Cabmate TanStack web app, existing Windows
companion and existing Drizzle/Postgres schema. Keep its internal image, service,
release/download and deploy-core names during this rollout. No schema migration
is introduced. Preserve the `ets2` database, users/API keys, Clerk user mappings,
and the daily 03:30 `com.herman.ets2-rollup` task.

RadioMax remains a separate broadcaster process/container and independent release.
A web release does not invoke RadioMax's deploy hook or Compose project. Keep its
non-root user, read-only filesystem, no host ports, 256 MiB memory limit, dropped
capabilities, no-new-privileges, listener quotas, trusted relay identity and
origin token. Do not copy its relay token into Cabmate.

Cabmate reads only `GET /api/state` from the private `RADIO_ORIGIN` (default
`http://radio-max:8080`, existing platform-web network alias). Confirm that alias
against the actual host configuration before deployment. The browser reads
Cabmate's public `GET /api/radio/state`: a validated, bounded snapshot cached for
two seconds per process, polled every five seconds while the page is active.
Timeout, malformed/oversized response and upstream failure return a friendly 503.
The app's database health is independent of station availability. Public `/radio`
requires no account; existing driving/profile routes keep Clerk authorization.
No arbitrary upstream URL, audio proxy, new state WebSocket or relay credential
is exposed by this integration.

## Compatibility contracts

- Keep `http://radio-max-audio.kylescudder.co.uk/radio/main` on plain HTTP without
  redirects, authentication or rebranding. Preserve ICY headers, metadata framing,
  bitrate/sample-rate, pacing and disconnect cleanup. Cabmate advertises that
  exact address in its copied six-field ETS2 station entry. It has no browser
  audio player; adding one requires verifying an HTTPS stream separately.
- Keep `POST https://ets2.kylescudder.co.uk/api/ingest` and
  `POST https://ets2.kylescudder.co.uk/functions/v1/ingest` directly served/proxied
  to the web container, with bodies and bearer credentials preserved. Do not
  redirect machine POSTs to another hostname. Keep the shared payload schema,
  `.ets2-tracker/config.json`, existing API keys and `ets2-tracker.exe` download.
- Existing browser routes remain `/`, `/drivers`, `/u/:name`, `/leaderboard`,
  `/profile`, `/login`; changed labels do not rename paths. `/ws` retains its
  Clerk and origin checks. Existing RadioMax `/api/state` and `/api/ws` remain
  served by the broadcaster; do not break already-open station pages at cutover.

## Approval and cutover checklist

Before any host work, read `~/.claude/CLAUDE.md`, the actual platform runbook
(ETS2 deployment around line 1244 and RadioMax around lines 480–530), and the
herman-deploy/herman-ops skills. Use herman-op for credentials, never print secrets
or resolved token-bearing config. Those files/tools were unavailable on Forge
during implementation. The RadioMax source deployment guide describes a retired
Linux edge and an obsolete two-level API hostname; do not reinstall that setup,
Hetzner or Netlify. Establish the current Herman relay configuration first.

Merging `main` triggers production CD. Obtain Kyle's explicit production approval
before merging this PR, changing DNS/Clerk, running a production migration,
archiving either repository, or retiring a hostname. A name selection is not
production approval.

For the approved rollout:

1. Save current authoritative DNS records to platform
   `verification/cabmate-dns-before.json` (and separate records for any other
   affected hostname). Save current routing/release references and a tested
   rollback plan. Inspect sender configurations/logs without retaining bearer
   keys or personal payloads. Confirm the current database backup and rollup task.
2. Inspect the current secondary Clerk application/domain configuration and plan
   the supported new-domain configuration with existing identities intact. Get
   approval before applying it. Set `APP_ORIGIN` and the public/server Clerk keys
   consistently for the new app origin. Do not allow wildcard socket origins.
3. Prepare the platform's supported hostname/tunnel/Caddy changes for the new
   one-level hostname. Keep old dashboard hosts as browser redirects only after
   the new auth and destination work. Retain the old ETS2 machine paths and old
   station API/socket paths as explicit route exceptions. Existing old-origin
   sockets must reconnect to an endpoint that still supports their origin until
   old pages have transitioned. Preserve relevant `/healthz` revision checks on
   the legacy ETS2 base URL until deploy-core/CD acceptance is deliberately updated.
4. Use the existing attested immutable-image deploy-core workflow; do not replace
   host state with a source checkout. No new migration is needed for this change.
   Deploy the web service independently. Keep the RadioMax container/image and
   relay configuration unchanged.
5. Verify new-origin Clerk sign-in/sign-out and driving/profile actions, existing
   installed senders on both POST paths, telemetry socket reconnects, the daily
   rollup, public `/radio`, copied station entry and station-failure behavior.
   Maintain an active listener while deploying the web app and confirm its stream
   remains open. Verify public plain HTTP/ICY, actual decoded audio, token rejection
   from another container, and current relay hardening. Game playback still needs
   an ETS2 machine; protocol checks alone do not prove it.
6. Update the platform runbook and `verification/` with exact approved records,
   revisions/digests, checks, screenshots and rollback results. Keep the old
   hostnames and both repositories available. Archive/remove only on separate
   explicit approval.

Rollback uses deploy-core's previous verified web image and saved approved
routing/auth configuration. Do not roll back the database or restart/redeploy the
broadcaster for a web-only failure. If radio integration fails, its unavailable
state leaves the existing public audio contract and driving pages independent.

## Approved hostname and database transition (31 October 2026)

Kyle approved the DNS/Clerk plan and requested PostgreSQL and Drizzle naming updates.
The production database becomes `cabmate`, with `cabmate_owner` and
`cabmate_runtime`; credential references move to `projects/cabmate/`. Rename
existing objects in place after draining connections; do not recreate users/data.
The installed deploy-core hook must use the same database and role names before
resuming automatic deployment. Keep service/image/repository names unchanged.

`deploy/compose.legacy.yaml` supplies a separate, unprivileged redirect proxy.
Register both old dashboard routes against `cabmate-legacy:8080` after Cabmate
sign-in and the deployment revision pass. The proxy preserves both old ingest
POST paths, `/healthz`, `/ws`, assets and RadioMax station APIs. It does not
restart or reconfigure the broadcaster. The audio hostname remains separate.
Set `LEGACY_APP_ORIGIN=https://ets2.kylescudder.co.uk` during the transition to
retain exact origin checks for open pages; remove it once that window is over.
Clerk's domain move invalidates previous sessions regardless of this allowance.

Set runtime `APP_ORIGIN` to `https://cabmate.kylescudder.co.uk`, match the new
Clerk publishable key in the build and runtime, and update `ETS2_BASE_URL` only
after new-host acceptance succeeds. Drizzle's existing saved connection should
be renamed to `Cabmate` using `cabmate_runtime` against `cabmate`, preserving
its saved ID and the other connections.
