# Companion app merge: source review and proposed plan

Date: 2026-10-31. Status: source discovery complete. Kyle selected Cabmate; implementation evidence is recorded separately.
No application, production, DNS, Clerk, database, deployment or repository settings changed.

## Source and environment evidence

- ETS2: existing clean T3 worktree, branch `merge-companion-app`, commit
  `d35c428864b44fb7fa1dd22e0c7f8a7a169b54a0`, equal to remote `main` when inspected.
- RadioMax: cloned `https://github.com/kylescudder/radio-max.git` into local
  `radio-max/` (locally excluded from the parent Git repository), commit
  `241ced739763c40b6f551fdbb86cce11327f6112`, equal to remote `main` when inspected.
- Read the root ETS2 `CLAUDE.md` and both repositories' `deploy/README.md`,
  Compose, Dockerfile, workflows, route/server/client sources and test definitions.
- Requested `~/.claude/CLAUDE.md`, `/Users/kyle/platform/runbook.md`, `herman-op`,
  `herman-deploy` and `herman-ops` are absent on this machine. Searched local
  Claude/Codex skill directories. No host operations or credential retrieval attempted.
- Installed Bun is 1.4.2; both projects specify 1.4.4. Implementation verification
  should use 1.4.4 consistently with CI and Docker. ETS2's client release workflow
  separately uses 1.2.16 and should be aligned when touching release configuration.

## Stack, auth and route inventory

| Area | ETS2 | RadioMax |
| --- | --- | --- |
| Web | TanStack Start/Router/Query, React 19, TypeScript, Vite, Tailwind, Leaflet | Static Astro 7, TypeScript DOM rendering, CSS |
| Runtime | Bun workspace, separate Windows client and shared wire types | Bun workspace; one process serves static web, state, WebSocket and MP3 |
| Storage | Postgres, Drizzle; raw and rolled-up driving history | No database; in-memory station state and packaged audio |
| Browser auth | Clerk session; server-enforced reads/mutations and socket auth | No user authentication; state is public; WebSocket checks exact origin |
| Machine auth | Per-driver bearer API key for ingestion | Private relay token and trusted client identity for non-loopback audio |
| UI routes | `/`, `/drivers`, `/u/$name`, `/leaderboard`, `/profile`, `/login` | `/` |
| API | POST `/api/ingest`, POST `/functions/v1/ingest`; GET/PATCH `/api/profile`, POST `/api/profile/key`, GET `/api/drivers`, `/api/drivers/:name`, `/api/leaderboard` | `/api/state`, `/api/ws`, `/radio/:id` |
| Operational | `/healthz`, Clerk-authenticated `/ws`, static assets | `/healthz`, built assets; stream host allowlist, admission quotas and bounded state sockets |

ETS2 mutations require same-origin JSON except bearer-authenticated ingestion.
Its driver socket also checks the configured origin, authenticates with Clerk,
and reconnects after 15 minutes. RadioMax's origin checks are not user auth;
CORS is not an authorization boundary.

## Installed-client contracts

`apps/client/src/index.ts` is a Windows client reading the SCS shared-memory
plugin. It samples once a second and sends JSON batches with
`Authorization: Bearer <driver key>` to the configured `ingestUrl`. Failed
batches persist locally for retry. Configuration remains at
`%USERPROFILE%\.ets2-tracker\config.json`; earlier `apiUrl` configurations
implicitly append `/api/ingest`. `scripts/simulate.ts` uses the same API.
The setup UI distributes `ets2-tracker.exe` from the ETS2 repository's releases.

Preserve both POST ingestion paths on `ets2.kylescudder.co.uk` by direct
routing/proxying, preserving body, authorization and response. Do not depend on
cross-host redirects for machine traffic. Preserve keys, UUIDs, wire schema,
config directory and executable download. Installed users and additional external
senders have not been inventoried from host logs or a game machine.

The immutable public audio contract supplied by Kyle is:
`http://radio-max-audio.kylescudder.co.uk/radio/main`. Keep plain HTTP, path,
ICY headers, metadata framing, pacing, admission limits and origin-token checks.
The app's station setup copy must advertise this exact URL regardless of upstream
private aliases. An HTTPS browser player, if added, must use a verified HTTPS
endpoint; do not rewrite the in-game HTTP URL to accommodate browser playback.

**Source/operations discrepancy:** RadioMax's current deployment guide,
`compose.yaml` defaults and `server/stations.json` still reference
`api.radio-max.kylescudder.co.uk`; the guide describes a Linux edge Kyle says
has been retired. Treat these as stale, not a recipe to restore. Establish current
Herman relay topology and environment overrides from the platform runbook before
changing deployment. No live topology or stream verification has been claimed.

## Recommendation

Keep `ets2-data-dashboard` as the surviving application repository, retaining
its existing internal service/image/package names initially. This preserves
database ownership, Clerk identities, Windows releases and the attested deploy
chain. Port the small RadioMax view into React rather than running two frontend
frameworks in the companion app. Keep RadioMax as the station's name.

Keep the broadcaster in its existing independent container and deployment
lifecycle. The merged web image must neither contain nor restart the audio
process. Initially retain `radio-max` as the broadcaster repository; retiring its
old web page or consolidating backend source can follow separately. Do not archive
either repository during this merge.

Add a public `/radio` companion page so existing station visitors retain access
without a new account. Keep driver/profile content behind Clerk. Start with a
same-origin, read-only `/api/radio/state` adapter fetching the fixed private
RadioMax `/api/state` endpoint with a short timeout and bounded polling/cache;
no user-selected URLs, credentials, telemetry or arbitrary upstream routes.
This avoids changing the broadcaster's WebSocket origin configuration in the
first web release. Radio failures must show a reconnect/unavailable state without
breaking the map, sign-in or database health. Preserve the legacy station state
and WebSocket URLs during eventual hostname cutover for existing open clients.

Navigation: Map, Drivers, On the road (existing leaderboard), Radio, Your cab
(profile). Use friendly in-cab language across title, login, navigation,
onboarding, errors and install manifest. Preserve technical protocol identifiers.

## Name shortlist (historical; Kyle selected Cabmate)

- **Cabmate** (recommended): personal companion, naturally fits the cab.
  Proposed hostname: `cabmate.kylescudder.co.uk`.
- **Convoy**: strongest group-driving feel. `convoy.kylescudder.co.uk`.
- **Roadmate**: broader, friendly road companion. `roadmate.kylescudder.co.uk`.
- **Cabside**: short, in-cab feel. `cabside.kylescudder.co.uk`.

Hostnames are proposals only; availability/current DNS have not been checked.
All are one label beneath `kylescudder.co.uk`. No name has been applied to code.

## Delivery and approval stages

1. Get Kyle's name choice before applying branding. Restore access to the global
   instructions, platform runbook and required Herman skills before host work.
2. Build on `merge-companion-app`: React radio view, read-only private adapter,
   common navigation and complete copy/manifest pass. No production schema change
   is expected; retain the database and rollup task unchanged.
3. Add meaningful API and Playwright success/failure coverage: station display,
   exact copied ETS2 stream entry, upstream failure/recovery, login protection,
   both ingest paths and rejected credentials. Use e2e-testing, web-browser and
   pr-screenshots skills; verify actual app on desktop/mobile and save inspected
   screenshots with revision/scenario/environment. Prove a web restart leaves an
   isolated broadcaster connection alive. Run build/typecheck and database tests
   only against a disposable migrated database (the suite truncates its database).
4. Open reviewable PRs without merging; `main` deploys automatically. Include
   evidence and any broadcaster/release-doc changes in separately scoped PRs.
5. Once code is ready, present the exact cutover and rollback for approval:
   save current DNS records under `verification/*-dns-before.json`, inspect Clerk
   secondary-application domain requirements, route the new hostname, keep old
   browser hosts as redirects with machine-route exceptions, and keep old audio
   routes untouched. Confirm before DNS, Clerk, production migrations/cutover,
   archiving or removing a hostname. A deploy/merge that changes production is
   part of this approval gate.
6. After approved changes land, update the actual platform runbook and evidence;
   verify auth, existing senders, rollup schedule, public HTTP audio/ICY/decoding,
   relay token protection and rollback. In-game playback requires a game client;
   decoder acceptance alone is not proof of that experience.

## Checks completed and gaps

On macOS, Bun 1.4.2, unmodified RadioMax revision above:

```sh
cd radio-max
bun test server/test/stream-limits.test.ts server/test/stream-eviction.test.ts
# 7 pass, 0 fail, 30 assertions across 2 files
```

These baseline checks cover admission, reconnect quotas, bounded bookkeeping,
relay identity and slow-listener eviction only. They do not establish live audio,
correct DNS, host hardening at runtime, browser journeys, database behavior or
in-game playback. No UI implementation or screenshots yet; no PR or deployment
has been created. The live runbook and required host skills remain unavailable.
