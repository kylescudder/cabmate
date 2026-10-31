# Repository consolidation verification — 31 October 2026

Source baseline: Cabmate `4009235`; RadioMax main
`241ced739763c40b6f551fdbb86cce11327f6112`.
Environment: Forge macOS host, Docker Linux ARM64, pinned `oven/bun:1.4.4`
image matching CI/Dockerfiles. Runtime probe revision: `consolidation-verification`.
No application UI/source behavior changes were introduced.

Local evidence is in ignored `.artifacts/repo-consolidation/`:

| Command / scenario | Observed result | Artifact |
| --- | --- | --- |
| `git merge-base --is-ancestor refs/remotes/radio-max/main HEAD` | Exit 0; imported source history is retained | Git commit graph |
| `git rev-parse refs/remotes/radio-max/main^{tree} HEAD:services/radio-max` immediately after import | Both trees `925c927c9c3e0c5fa4e377924bf3c29d223e3817` | Git subtree import commit |
| Root `bun install --frozen-lockfile`, `bun run build`, `bun run typecheck` | All pass | `web-checks.log` |
| Root `bun run db:migrate && bun run test` against disposable PostgreSQL 17 | 16 tests pass, 113 assertions; test DB removed | `web-tests.log` |
| Broadcaster `bun install --frozen-lockfile`, `bun run format:check`, `bun run typecheck`, `bun run test`, `bun run build` | All pass; 8 tests, 39 assertions; existing deprecated clipboard API hint only | `radio-checks.log` |
| `python3 -B -m unittest discover -s services/radio-max/deploy -p 'test_*.py' -v` | 2 pass | Tool output |
| `node --test services/radio-max/deploy/receiver/server.test.mjs` | 1 pass | Tool output |
| `actionlint .github/workflows/*.yml` | Exit 0 | Tool output |
| `docker build --build-arg RADIO_MAX_REVISION=consolidation-verification -t cabmate-radio:consolidation services/radio-max` | Pass, runtime user `bun` | `radio-docker-build.log` |
| Isolated Compose `up --wait`, then `exec -T -e VERIFY_EXCLUSIVE=true web bun /app/deploy/verify.ts` | Pass: static assets/private-file isolation, HTTP/HEAD, host restriction, continuous 128 kbps/ICY stream, read-only WebSocket/origin checks | `container-acceptance.log` |
| `RADIO_MAX_TEST_IMAGE=cabmate-radio:consolidation python3 -B services/radio-max/deploy/check-stream-proxy.py` (also `--public-edge`) | Both pass: limit 4, excess 429, forged headers denied, cleanup/reconnect, origin token enforcement | `proxy-checks.log`, `public-edge-checks.log` |
| `git diff --check` | Exit 0 | Tool output |

The first disposable DB attempt hit startup before PostgreSQL was ready. The
successful run used Compose's healthcheck and `up --wait` before migrations.

GitHub CI, published multi-platform image/provenance, GHCR package write access,
production deploy-core trust migration, GitHub radio-production secrets and
in-game playback are not proven by these local checks. Publishing/deployment
remain separately gated pending the setup documented in
[repository consolidation](../deploy/REPOSITORY-CONSOLIDATION.md). No host,
station, relay, database, credentials or DNS changes were made.
