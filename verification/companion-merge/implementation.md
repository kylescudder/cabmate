# Cabmate implementation evidence

31 October 2026. Kyle selected **Cabmate**; **RadioMax** remains the station name.
Implementation revision: `cc9d81c9eb973c76a30afbcf54102dd597d42d1d`.
The evidence commit changes documentation only. Application files match the
verified implementation tree. See `results.json` for screenshot hashes,
environment, image identity and machine-readable observations.

## Delivered

- Cabmate title, navigation, login, setup copy and install manifest; existing
  technical service/package names, Windows client config/download and API paths
  preserved. Navigation labels are friendlier without changing existing routes.
- Public `/radio` page in the existing React/TanStack app, including station/track,
  listeners, progress, exact plain HTTP ETS2 entry, copy success/denial, empty state,
  outage and recovery. Existing driving routes remain Clerk-protected.
- Fixed-private-origin, GET-only station adapter with a 2.5-second fetch/body
  timeout, 64 KB response limit, shape validation, stripped unknown fields,
  no redirects/forwarded browser credentials, and two-second coalesced cache
  (including failures). Browser polls every five seconds. No audio proxy.
- Broadcaster source, token, Compose/hardening, relay and deployment lifecycle
  unchanged. App source shared definitions are in the existing shared package so
  they are present in the production image. Local reference checkout is excluded
  from the web Docker context.
- Playwright journeys and screenshot/report CI artifacts added. Bun is 1.4.4 in
  package metadata, `.bun-version`, CI, Docker and Windows release workflow.
- Reviewable host checklist and rollback in `deploy/CABMATE.md`. The actual
  platform runbook remains unavailable and has not been edited.

## Commands and observed results

All final local commands used Bun 1.4.4 explicitly on PATH. Postgres 17 was a
separate disposable container on loopback port 55439, never production.

| Command/check | Result |
| --- | --- |
| `bun install --frozen-lockfile` | Pass |
| `bun run db:migrate` against disposable Postgres | Pass |
| `bun run build` | Pass |
| `bun run typecheck` | All three workspaces pass |
| `bun run test` | 15 pass, 0 fail, 104 assertions |
| `bun run test:e2e` | 8 pass, 0 fail; desktop and mobile Chromium |
| `docker build --progress plain -t cabmate-verification:e31f2c52 .` | Pass |
| Actual image with non-root UID 501, read-only root, dropped capabilities, no-new-privileges, 384 MiB limit | Healthy; `/healthz` and `/radio` 200; private driving API and both ingest paths reject missing credentials with 401; missing station gives isolated 503 |
| Active ICY HTTP stream across web process stop/start | Pass; same response grew from 3200 to 12800 bytes, same one listener retained |
| `git diff --check` | Pass |

Server tests include legacy/current bearer ingest, replay protection, session
ownership, driving history/rollup, socket origin/session rejection and bounded
radio adapter failures. Browser tests exercise the real production build and
server adapter against an explicit station-state fixture, not an intercepted
browser API. They cover signed-out protection, clipboard success/denial,
outage/recovery/empty state and no horizontal overflow at both viewport sizes.
The audio-continuity check starts the unmodified RadioMax repository server with
its packaged MP3, opens one local ICY stream, starts/stops/restarts the actual
built web server, and asserts more bytes on the same response and one retained
listener. It is a process-level proof, not a production deploy or relay test.

## Saved and inspected artifacts

Task directory: `.artifacts/companion-merge/` (ignored). Build, install,
typecheck, migration, server-test, e2e and Docker logs; Playwright HTML report;
container acceptance/health and independent-audio JSON; continuity check script;
Chromium version; and real screenshot PNGs are saved there.

Inspected screenshots from the delivered app: `desktop-radio.png` (1440×1000
viewport, full page), `mobile-radio.png` (390×844 viewport, full page),
`desktop-radio-unavailable.png`, and `mobile-login.png`. They show the copied
station entry, responsive navigation, station outage and the honest unconfigured
sign-in state. No before image is claimed for the new route.

The T3 preview tools were not used to verify our own edit, following the runtime's
restriction; verification and captures use the repository's automated Playwright
CLI. This is Chromium responsive-layout coverage, not Safari or physical-device
coverage. No mockup or generated image is used as verification.

## Gaps and approval gates

No production, DNS, Clerk, database, hostname, archive or broadcaster changes.
No PR merge or automatic merge is authorized by the name choice. Main pushes
trigger deployment, so the PR stays draft pending Kyle's approval.

Global `~/.claude/CLAUDE.md`, platform runbook, herman-op and the required Herman
skills are missing on this machine. Actual host topology/environment, old DNS,
production relay/hardening and the rollup LaunchAgent have not been inspected.
RadioMax's checked-in deployment docs describe retired infrastructure; do not use
them to recreate it. Keep the required current audio hostname and HTTP contract.

The initial run did not discover the available development credentials. This was
corrected in [the Clerk development follow-up](clerk-development.md): real Clerk
session authorization, persisted local profile edits, authenticated live socket,
navigation/reload and sign-out now pass using the existing development account.
The manual password-plus-email-code flow and production-domain/cutover checks
remain separate limitations. No production configuration has been changed.
