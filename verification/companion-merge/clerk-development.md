# Clerk development verification — 31 October 2026

Correction to the initial discovery: Forge's accessible 1Password service account
can read the **Clerk - ETS2 Dashboard - DEV** item and the existing **ETS2
Dashboard** login in the Forge vault. The absence of a local `.env` or a
`herman-op` executable did not establish that development credentials were
unavailable. No secret values, account identifiers or session tokens are included
in this evidence or screenshots.

## Real session check

The PR application was rebuilt with the development publishable key and run at
`http://localhost:3201` with the matching development secret key, using a separate
Postgres 17 container and disposable `cabmate_auth` database on loopback port
55440. These are local build/runtime settings only; production repository
variables, Clerk settings, DNS and host deployment state were not changed.

`bun run test:clerk` uses `playwright.clerk.config.ts` and the existing account.
The final run passed **1 test**, exercising:

- Signed-out `/profile` redirects to `/login`; the real Clerk widget loads.
- Clerk's official `clerk.signIn({ emailAddress })` helper establishes a real
  development session for the existing account. It does not mock application
  identity, cookies, API responses or server authorization.
- Protected profile and driver APIs return 200 with the real session.
- A profile name/username edit in the local disposable database persists across
  a page reload. No Clerk user metadata or production database is edited.
- The authenticated `/ws` connection receives a real `drivers` frame.
- Driver/map navigation and reload keep the session.
- Cabmate's actual Sign out button returns to login; the profile API then returns
  401, and revisiting `/profile` redirects to login.

An earlier direct password-form attempt accepted the saved password and reached
Clerk's `#/client-trust` new-device email verification step. That account is not a
reserved `+clerk_test` address, so we did not invent an OTP, disable Device Trust,
change its email address, or modify the Clerk application's settings. The
complete manual password-plus-inbox-code flow remains unverified. The official
helper is intentionally used for authenticated-application coverage and skips
verification steps; this limitation must not be described as a completed email
verification test.

References: [Clerk's supported Playwright helpers](https://clerk.com/docs/guides/development/testing/playwright/test-helpers),
[Device Trust](https://clerk.com/docs/guides/protect/device-trust).

## Branding issue found and fixed

The real widget exposed `Sign in to ETS2 Data Dashboard`, which was invisible in
the initial no-key test build. A test first failed on the intended Cabmate
heading. The provider now supplies supported localization overrides for Cabmate
in sign-in/sign-up headings and verification subtitles, without renaming or
reconfiguring the Clerk application. See [Clerk localization](https://clerk.com/docs/guides/customizing-clerk/localization).

## Reproduction and artifacts

Use Bun 1.4.4, a disposable local migrated database, the existing development
keys and the existing test account from the authorized credential store. Supply
`VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
`CLERK_TEST_IDENTIFIER`, and `CLERK_TEST_DISPOSABLE_DATABASE=true` privately;
never put them on a shell command line or commit them. Build/start the app with
matching keys, `APP_ORIGIN=http://localhost:3201`, and local-only database URL,
then run `bun run test:clerk`. The suite rejects production secret keys and
non-loopback base URLs. `CLERK_TEST_BASE_URL` can change the local port.

This suite is opt-in and does not add credentials to GitHub Actions. The default
CI suite continues to exercise signed-out guards without a Clerk account.

Ignored `.artifacts/clerk-auth/` contains the failed-heading log, successful real
session test log, build/typecheck logs, and inspected `clerk-login.png` and
`authenticated-drivers.png`. The login image was captured through T3's shared
browser at 1280×800; the driver page through Playwright Chromium at 1280×900.
Both are actual screenshots of the matching-key development build, not mockups.
Only the safe local display name `Cabmate test driver` is shown; profile/setup
pages containing connection keys were not captured. Source revision and image
hashes are recorded in `clerk-results.json`.

Development session handling is now verified. This does not verify production
Clerk domain configuration, a future hostname move, live radio private-network
reachability, or the production cutover. Those are separate deployment checks.
