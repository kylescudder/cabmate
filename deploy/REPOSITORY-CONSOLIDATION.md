# One active repository: Cabmate

Cabmate is the source of truth for the companion web app, Windows agent and
RadioMax broadcaster. The broadcaster is in `services/radio-max`; its separate
process, Compose project, image name, network alias, stream URLs, listener limits
and relay credentials are unchanged. No application UI or stream code changes
are part of this move.

## Source and history

RadioMax main `241ced739763c40b6f551fdbb86cce11327f6112` was imported with
`git subtree add --prefix=services/radio-max` **without squash**. Its original
commits are ancestors of the consolidation branch. Merge the consolidation PR
with a merge commit (never squash/rebase) to retain that history on Cabmate main.

The old `kylescudder/radio-max` repository is retained as a read-only archive
after this PR merges, preserving issue/PR discussions and outstanding branches.
It is not a second active source repository. Do not delete it. The old
`ets2-data-dashboard` GitHub URL already redirects to `kylescudder/cabmate`.
Local checkout folder names do not create another GitHub repository.

The broadcaster keeps a separate Bun workspace and `bun.lock`, installed from
`services/radio-max`, with Bun 1.4.4 everywhere. This lets each service's existing
Docker build use an independent frozen lockfile. Root `radio:*` scripts provide
shortcuts; root web commands continue to target only the web workspace.
The root Renovate config covers both npm dependency declarations and Bun locks.
Nested workflows and Git hook installation were removed; active Actions live
only at the Cabmate root.

## CI and releases

- `.github/workflows/ci.yml`: existing companion checks.
- `.github/workflows/ci-radio.yml`: broadcaster build, typecheck, formatting,
  stream tests, deployment hooks, receiver, container and two-proxy checks. Run
  commands from `services/radio-max`; Docker's context is that directory.
- `.github/workflows/release-radio.yml`: independent AMD64/ARM64 broadcaster image,
  published to the existing `ghcr.io/kylescudder/radio-max` package and attested
  from **Cabmate**, with the OCI source label updated accordingly. Main pushes
  changing broadcaster source/workflows trigger publishing only after
  `RADIO_RELEASE_ENABLED=true`; a manual dispatch can verify publishing first.
  The publishing gate prevents failures before the existing package grants
  Cabmate write access.
- `.github/workflows/codeql.yml`: imported security analysis covers the monorepo.

Broadcaster deployment is deliberately gated by `RADIO_DEPLOY_ENABLED == true`
and a separate `radio-production` GitHub environment. Cabmate's existing
`DEPLOY_ENABLED` and web production secrets cannot accidentally trigger it.
Before enabling the broadcaster deploy job:

1. Grant Cabmate Actions write access to the existing RadioMax GHCR package.
   Verify a manual release, then set `RADIO_RELEASE_ENABLED=true` for automatic
   image publishing.
2. Configure `radio-production` with the broadcaster's existing
   `DEPLOY_WEBHOOK_SECRET`, `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET` and
   `RADIO_MAX_BASE_URL` (environment variable). Do not copy web hook credentials.
3. Update deploy-core's installed **radio-max** app definition to trust repo
   `kylescudder/cabmate`, workflow `release-radio.yml`, branch `main`. Keep the
   existing image, app directory, installed hook hashes and Compose service.
   Future tooling-source updates must use `services/radio-max/deploy/` in Cabmate;
   existing pinned tooling provenance remains a historical record.
4. Verify provenance against a Cabmate-built digest before enabling deployment;
   retain the previous trusted image and routing for rollback. Set
   `RADIO_DEPLOY_ENABLED=true` only after acceptance and production authorization.

These are host/credential configuration steps, not changes applied by this
source consolidation. The existing running broadcaster is untouched. The
archived repo and its workflow attestations remain available for old digests.
Do not weaken provenance verification or restart the station merely to move code.

## Outstanding RadioMax work at import

Open PRs and discussion are preserved in the archived source repository. Port
any changes still wanted to a Cabmate branch, applying source paths beneath
`services/radio-max` and workflow paths to their new root names; do not merge the
original branch directly into the monorepo root. Dependency PRs can be recreated
by Cabmate's Renovate configuration. In particular, #30 documents the current
Herman audio ingress and has not been silently merged by this consolidation.
Its production routing work and verification remain independent of this move.

| Original PR | Work | Preserved head |
| --- | --- | --- |
| [#30](https://github.com/kylescudder/radio-max/pull/30) | Serve public audio through the Herman relay and retire the old edge | `e0c22e55550123b3be721d68a8b02295215e9b74` |
| [#29](https://github.com/kylescudder/radio-max/pull/29) | Update dependency astro to v7.4.4 | `7f6c32935596605eacf01fca60b807769d2396df` |
| [#28](https://github.com/kylescudder/radio-max/pull/28) | Update Node.js to v26 | `46512ff6754344153888ef9cdbb8a9db2732b67d` |
| [#26](https://github.com/kylescudder/radio-max/pull/26) | Update docker/login-action action to v4.7.0 | `48f9556f73a9c8e5e07661a5227e7f47046ab915` |
| [#24](https://github.com/kylescudder/radio-max/pull/24) | Update Node.js to 6a1c190 | `4aaaf2111947df7d01a52bacaad34cd53e759ef5` |
| [#20](https://github.com/kylescudder/radio-max/pull/20) | Lock file maintenance | `012d2bcea8c132548dd4be15af989a05ca9aa05d` |
| [#15](https://github.com/kylescudder/radio-max/pull/15) | Update dependency ubuntu to v26 | `a6345dfe4c54822940a86910f10be8f5e2c77802` |
| [#14](https://github.com/kylescudder/radio-max/pull/14) | Update dependency typescript to v7 | `6addda0d8989327d7fca84e05c5ee1e5e0279eed` |
| [#12](https://github.com/kylescudder/radio-max/pull/12) | Update tailscale/tailscale Docker tag to v1.104.2 | `884c4ebb440058547c502219421e5fdedfc235fd` |

The original Dependency Dashboard is [radio-max#13](https://github.com/kylescudder/radio-max/issues/13).
