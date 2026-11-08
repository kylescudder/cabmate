import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { connect } from './db';
import { createApi } from './api';
import { createCabmateAuth } from './auth-factory';
import { betterAuthIdentity } from './better-auth';
import { fetchClerkUsers, linkClerkUsers, type ClerkUser } from './link-clerk-users';
import { importLegacy } from './legacy';
import { createAvatarHandler } from './profile-avatar';
import { authUser, userProfile, users } from './schema';

// Runs against a migrated, disposable database (CI service container or `bun run db:up`).
const { db, client } = connect(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL);
const origin = 'https://cabmate.auth.test';
const allowed = ['driver@example.com', 'second@example.com'];
const secret = randomUUID() + randomUUID();
let fixtureNumber = 0;

beforeEach(async () => {
  // Truncating auth_user cascades to users through users.auth_user_id.
  await db.execute(sql`truncate auth_user, user_profile, auth_session, auth_account, auth_passkey, auth_verification, auth_rate_limit, auth_email_limit, users, vehicles, sessions, jobs, telemetry, telemetry_rollup_minute cascade`);
});
afterAll(() => client.end());

function authFixture({ dailyEmailLimit = 40, allowedEmails = allowed } = {}) {
  const codes = new Map<string, string>();
  const links: { email: string; kind: string; url: string }[] = [];
  const auth = createCabmateAuth(db, { baseURL: origin, secret, allowedEmails, dailyEmailLimit },
    async (email, otp) => { codes.set(email, otp); },
    async (email, kind, url) => { links.push({ email, kind, url }); });
  const ip = `203.0.113.${++fixtureNumber}`;
  const request = (path: string, body?: unknown, cookie = '', extra: Record<string, string> = {}) => auth.handler(new Request(origin + '/api/auth' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, Cookie: cookie, ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));
  // The real API, authorised exactly as the app route does it.
  const api = createApi(() => db, request => betterAuthIdentity(request.headers, auth, allowedEmails));
  const call = (path: string, cookie: string, init: RequestInit = {}) => api(new Request(origin + path, {
    ...init, headers: { Cookie: cookie, Origin: origin, 'Content-Type': 'application/json', ...init.headers },
  }));
  return { auth, request, codes, links, api, call };
}
type Fixture = ReturnType<typeof authFixture>;

function mergeCookies(response: Response, prior = '') {
  const values = new Map(prior.split('; ').filter(Boolean).map(part => [part.slice(0, part.indexOf('=')), part.slice(part.indexOf('=') + 1)]));
  for (const value of response.headers.getSetCookie()) {
    const pair = value.split(';')[0];
    values.set(pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1));
  }
  return [...values].map(([key, value]) => key + '=' + value).join('; ');
}

async function signIn(fixture: Fixture, email = 'driver@example.com') {
  expect((await fixture.request('/email-otp/send-verification-otp', { email, type: 'sign-in' })).status).toBe(200);
  const response = await fixture.request('/sign-in/email-otp', { email, otp: fixture.codes.get(email) });
  expect(response.status).toBe(200);
  return { cookie: mergeCookies(response), user: (await response.json()).user as { id: string; email: string } };
}

describe('Better Auth sign-in', () => {
  test('email codes go only to invited drivers, are hashed and single-use, and create the driver like Clerk did', async () => {
    const fixture = authFixture();
    const outsider = await fixture.request('/email-otp/send-verification-otp', { email: 'outsider@example.com', type: 'sign-in' });
    expect(outsider.status).toBe(200);
    expect(await outsider.json()).toEqual({ success: true });
    expect(fixture.codes.size).toBe(0);
    expect(await db.execute(sql`select id from auth_verification`)).toHaveLength(0);

    expect((await fixture.request('/email-otp/send-verification-otp', { email: ' DRIVER@example.com', type: 'sign-in' })).status).toBe(200);
    const otp = fixture.codes.get('driver@example.com')!;
    expect(otp).toMatch(/^\d{6}$/);
    const [stored] = await db.execute<{ value: string }>(sql`select value from auth_verification`);
    expect(stored.value).toMatch(/^[a-f0-9]{64}:0$/);
    expect(stored.value).not.toContain(otp);

    const signedIn = await fixture.request('/sign-in/email-otp', { email: 'driver@example.com', otp });
    expect(signedIn.status).toBe(200);
    const cookies = signedIn.headers.getSetCookie().join(';');
    expect(cookies).toContain('cabmate-auth');
    expect(cookies).toMatch(/HttpOnly/i);
    expect(cookies).toMatch(/Secure/i);
    expect(cookies).toMatch(/SameSite=Lax/i);
    expect(cookies).not.toMatch(/Domain=/i);
    expect((await fixture.request('/sign-in/email-otp', { email: 'driver@example.com', otp })).status).toBe(400);
    const cookie = mergeCookies(signedIn);
    const { user } = await signedIn.json() as { user: { id: string } };

    // First sign-in creates the driver row the same way Clerk-era sign-in did.
    const profile = await fixture.call('/api/profile', cookie);
    expect(profile.status).toBe(200);
    const own = await profile.json();
    expect(own.name).toMatch(/^driver-[0-9a-f-]{24}$/);
    expect(own.display_name).toBe('Driver');
    expect(own.avatar_url).toBeNull();
    expect(own.api_key).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect((await (await fixture.call('/api/profile', cookie)).json()).id).toBe(own.id);
    const [row] = await db.select().from(users).where(eq(users.id, own.id));
    expect(row.authUserId).toBe(user.id);
    expect(row.clerkUserId).toBeNull();

    // Display name edits also update the account menu name; cross-site writes are refused.
    const patch = (headers: Record<string, string> = {}) => fixture.call('/api/profile', cookie, {
      method: 'PATCH', headers, body: JSON.stringify({ name: 'night-trucker', display_name: 'Night Trucker' }),
    });
    expect((await patch({ Origin: 'https://evil.example' })).status).toBe(403);
    expect((await patch()).status).toBe(200);
    const [account] = await db.select({ name: authUser.name }).from(authUser).where(eq(authUser.id, user.id));
    expect(account.name).toBe('Night Trucker');

    // The desktop client keeps authenticating with users.api_key, independent of the session.
    const ingest = await fixture.api(new Request(origin + '/api/ingest', {
      method: 'POST', headers: { authorization: `Bearer ${own.api_key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: randomUUID(), truck: { make: 'Scania', model: 'S 730' }, samples: [{ recordedAt: new Date().toISOString(), speedKph: 80, rpm: 1400, gear: 10,
        fuelLitres: 600, odometerKm: 1000, truckDamage: 0, cargoDamage: 0, position: { x: 1, z: 2, heading: 0 } }] }),
    }));
    expect(await ingest.json()).toEqual({ ok: true, inserted: 1 });

    expect((await fixture.request('/sign-out', {}, cookie)).status).toBe(200);
    expect(await (await fixture.request('/get-session', undefined, cookie)).json()).toBeNull();
    expect((await fixture.call('/api/profile', cookie)).status).toBe(401);
  });

  test('unverified or removed emails lose API access and cannot enroll passkeys', async () => {
    const fixture = authFixture();
    const { cookie, user } = await signIn(fixture);
    expect((await fixture.call('/api/drivers', cookie)).status).toBe(200);
    expect((await fixture.request('/passkey/generate-register-options', undefined, cookie)).status).toBe(200);

    const removed = authFixture({ allowedEmails: ['second@example.com'] });
    expect((await removed.call('/api/drivers', cookie)).status).toBe(401);
    expect((await removed.request('/passkey/generate-register-options', undefined, cookie)).status).toBe(401);

    await db.update(authUser).set({ emailVerified: false }).where(eq(authUser.id, user.id));
    expect((await fixture.call('/api/drivers', cookie)).status).toBe(401);
    expect((await fixture.request('/passkey/generate-register-options', undefined, cookie)).status).toBe(401);
    expect((await fixture.request('/passkey/generate-register-options')).status).toBe(401);
  });

  test('wrong codes, expiry and cross-site requests are refused', async () => {
    const fixture = authFixture();
    const crossSite = await fixture.request('/email-otp/send-verification-otp', { email: 'driver@example.com', type: 'sign-in' }, '',
      { Origin: 'https://evil.example', 'Sec-Fetch-Site': 'cross-site' });
    expect(crossSite.status).toBe(403);
    expect(fixture.codes.size).toBe(0);
    await fixture.request('/email-otp/send-verification-otp', { email: 'driver@example.com', type: 'sign-in' });
    const otp = fixture.codes.get('driver@example.com')!;
    const wrong = otp === '000000' ? '111111' : '000000';
    for (let attempt = 0; attempt < 5; attempt++)
      expect((await fixture.request('/sign-in/email-otp', { email: 'driver@example.com', otp: wrong })).status).toBe(400);
    const exhausted = await fixture.request('/sign-in/email-otp', { email: 'driver@example.com', otp });
    expect(exhausted.status).toBe(403);
    await fixture.request('/email-otp/send-verification-otp', { email: 'second@example.com', type: 'sign-in' });
    await db.execute(sql`update auth_verification set expires_at = now() - interval '1 second'`);
    expect((await fixture.request('/sign-in/email-otp', { email: 'second@example.com', otp: fixture.codes.get('second@example.com') })).status).toBe(400);
    expect(await db.select().from(authUser)).toHaveLength(0);
  });

  test('per-recipient cooldown and the daily email budget hold under concurrent resends', async () => {
    const cooldown = authFixture();
    const send = () => cooldown.request('/email-otp/send-verification-otp', { email: 'driver@example.com', type: 'sign-in' });
    expect((await send()).status).toBe(200);
    const first = cooldown.codes.get('driver@example.com');
    expect((await send()).status).toBe(429);
    // The refused resend keeps the first code usable.
    expect((await cooldown.request('/sign-in/email-otp', { email: 'driver@example.com', otp: first })).status).toBe(200);

    await db.execute(sql`truncate auth_email_limit, auth_rate_limit`);
    const budget = authFixture({ dailyEmailLimit: 1 });
    const responses = await Promise.all(Array.from({ length: 4 }, () =>
      budget.request('/email-otp/send-verification-otp', { email: 'second@example.com', type: 'sign-in' })));
    expect(responses.filter(r => r.status === 200)).toHaveLength(1);
    expect(responses.filter(r => r.status === 429)).toHaveLength(3);
    expect((await budget.request('/email-otp/send-verification-otp', { email: 'driver@example.com', type: 'sign-in' })).status).toBe(429);
    const [global] = await db.execute<{ count: number }>(sql`select count from auth_email_limit where key = 'global:day'`);
    expect(global.count).toBe(1);
  });

  test('password, reset and magic links are invite-only, single-use and same-site; sign-up stays closed', async () => {
    const fixture = authFixture();
    const password = 'correct horse battery staple';
    expect((await fixture.request('/sign-up/email', { email: 'driver@example.com', password, name: 'Driver' })).status).toBe(400);
    const { user } = await signIn(fixture);
    expect((await fixture.request('/sign-in/email', { email: 'driver@example.com', password })).status).toBe(401);
    // The code above used this address's one-email-a-minute allowance.
    expect((await fixture.request('/request-password-reset', { email: 'driver@example.com', redirectTo: '/auth/reset-password' })).status).toBe(429);
    await db.execute(sql`truncate auth_email_limit`);

    for (const email of ['stranger@example.com', 'DRIVER@example.com '])
      expect((await fixture.request('/request-password-reset', { email, redirectTo: '/auth/reset-password' })).status).toBe(200);
    expect(fixture.links.map(({ email, kind }) => [email, kind])).toEqual([['driver@example.com', 'reset-password']]);
    const resetUrl = new URL(fixture.links[0].url);
    expect(resetUrl.origin).toBe(origin);
    const token = resetUrl.pathname.split('/').at(-1)!;
    expect(await db.execute(sql`select id from auth_verification where identifier = ${'reset-password:' + token}`)).toHaveLength(1);
    expect((await fixture.request('/reset-password', { newPassword: 'short', token })).status).toBe(400);
    expect((await fixture.request('/reset-password', { newPassword: password, token })).status).toBe(200);
    expect((await fixture.request('/reset-password', { newPassword: password + '!', token })).status).toBe(400);
    expect((await fixture.request('/sign-in/email', { email: 'driver@example.com', password: 'wrong password entirely' })).status).toBe(401);
    const passwordSignIn = await fixture.request('/sign-in/email', { email: 'driver@example.com', password });
    expect(passwordSignIn.status).toBe(200);
    expect((await (await fixture.request('/get-session', undefined, mergeCookies(passwordSignIn))).json()).user.id).toBe(user.id);

    fixture.links.length = 0;
    expect((await fixture.request('/sign-in/magic-link', { email: 'stranger@example.com', callbackURL: '/profile' })).status).toBe(200);
    expect(fixture.links).toHaveLength(0);
    for (const callbackURL of ['https://attacker.example/', '//attacker.example/', '/.//attacker.example/', '/\t/attacker.example/', '/\\attacker.example/']) {
      await db.execute(sql`truncate auth_rate_limit`);
      expect((await fixture.request('/sign-in/magic-link', { email: 'second@example.com', callbackURL })).status).toBe(403);
    }
    await db.execute(sql`truncate auth_rate_limit`);
    expect((await fixture.request('/request-password-reset', { email: 'driver@example.com', redirectTo: 'https://attacker.example/reset' })).status).toBe(403);
    expect(fixture.links).toHaveLength(0);

    expect((await fixture.request('/sign-in/magic-link', { email: 'second@example.com', callbackURL: origin + '/profile' })).status).toBe(200);
    expect(fixture.links.map(({ email, kind }) => [email, kind])).toEqual([['second@example.com', 'magic-link']]);
    const magic = new URL(fixture.links[0].url);
    expect(magic.origin).toBe(origin);
    const verify = () => fixture.auth.handler(new Request(magic, { headers: { 'CF-Connecting-IP': '203.0.113.250' }, redirect: 'manual' }));
    const verified = await verify();
    expect(verified.status).toBe(302);
    expect(verified.headers.get('location')).toBe(origin + '/profile');
    const magicUser = (await (await fixture.request('/get-session', undefined, mergeCookies(verified))).json()).user;
    expect(magicUser.email).toBe('second@example.com');
    expect(magicUser.emailVerified).toBe(true);
    expect(mergeCookies(await verify())).not.toContain('session_token');
    expect(await db.select().from(authUser).where(eq(authUser.email, 'stranger@example.com'))).toHaveLength(0);
  });
});

describe('profile photo', () => {
  const photo = (fixture: Fixture, allowedEmails = allowed) => {
    const handler = createAvatarHandler(db, { origin, allowedEmails, getSession: headers => fixture.auth.api.getSession({ headers }) });
    return (method = 'GET', cookie = '', body?: BodyInit, headers: Record<string, string> = {}) => handler(new Request(origin + '/api/profile/avatar', {
      method, body, headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'image/png', ...headers },
    }));
  };
  const png = () => sharp({ create: { width: 64, height: 32, channels: 3, background: '#fbbf24' } })
    .png().withMetadata({ exif: { IFD0: { Artist: 'metadata to strip' } } }).toBuffer();

  test('upload, replace and delete keep one re-encoded, private JPEG per driver', async () => {
    const fixture = authFixture();
    const { cookie, user } = await signIn(fixture);
    const other = await signIn(fixture, 'second@example.com');
    const request = photo(fixture);
    const image = new Uint8Array(await png());
    expect(await (await photo(fixture)('GET', cookie)).json()).toEqual({ error: 'No profile photo' });

    const first = await request('PUT', cookie, image);
    expect(first.status).toBe(200);
    expect(first.headers.get('Cache-Control')).toBe('no-store');
    const { image: firstUrl } = await first.json() as { image: string };
    expect(firstUrl).toMatch(/^\/api\/profile\/avatar\?v=[0-9a-f-]{36}$/);
    // The account menu (session user.image) and Your cab both see it.
    const session = await (await fixture.request('/get-session', undefined, cookie)).json();
    expect(session.user.image).toBe(firstUrl);
    expect((await (await fixture.call('/api/profile', cookie)).json()).photo).toBe(firstUrl);

    const served = await request('GET', cookie);
    expect(served.status).toBe(200);
    expect(served.headers.get('Content-Type')).toBe('image/jpeg');
    expect(served.headers.get('Cache-Control')).toBe('no-store');
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(served.headers.get('Cross-Origin-Resource-Policy')).toBe('same-origin');
    const metadata = await sharp(Buffer.from(await served.arrayBuffer())).metadata();
    expect(metadata).toMatchObject({ format: 'jpeg', width: 256, height: 256 });
    expect(metadata.exif).toBeUndefined();

    // Another driver only ever reads their own (missing) photo.
    expect((await request('GET', other.cookie)).status).toBe(404);
    expect((await (await fixture.call('/api/profile', other.cookie)).json()).photo).toBeNull();

    const replaced = await (await request('PUT', cookie, image)).json() as { image: string };
    expect(replaced.image).not.toBe(firstUrl);
    const [account] = await db.select({ image: authUser.image }).from(authUser).where(eq(authUser.id, user.id));
    expect(account.image).toBe(replaced.image);
    expect(await db.select().from(userProfile)).toHaveLength(1);

    // update-user still cannot point user.image anywhere.
    expect((await fixture.request('/update-user', { image: 'https://example.com/track.png' }, cookie)).status).toBe(400);

    const removed = await request('DELETE', cookie);
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ image: null });
    expect((await request('GET', cookie)).status).toBe(404);
    const [cleared] = await db.select({ image: authUser.image }).from(authUser).where(eq(authUser.id, user.id));
    expect(cleared.image).toBeNull();
    expect((await (await fixture.call('/api/profile', cookie)).json()).photo).toBeNull();
  });

  test('size, type, origin and access rules are enforced', async () => {
    const fixture = authFixture();
    const { cookie, user } = await signIn(fixture);
    const request = photo(fixture);
    const image = new Uint8Array(await png());
    expect((await request('PUT', '', image)).status).toBe(401);
    expect((await request('GET')).status).toBe(401);
    expect((await request('DELETE')).status).toBe(401);
    expect((await request('PUT', cookie, image, { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await request('PUT', cookie, image, { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
    expect((await request('PUT', cookie, '<svg onload="alert(1)"/>', { 'Content-Type': 'image/svg+xml' })).status).toBe(415);
    expect((await request('PUT', cookie, '<svg onload="alert(1)"/>')).status).toBe(400);
    expect((await request('PUT', cookie, 'GIF89a not really', { 'Content-Type': 'image/jpeg' })).status).toBe(400);
    // A PNG header on a corrupt body is still refused by the decoder.
    expect((await request('PUT', cookie, new Uint8Array([...image.subarray(0, 40), 0, 0, 0]))).status).toBe(400);
    const tooLarge = new Uint8Array(512_001);
    tooLarge.set(image);
    expect((await request('PUT', cookie, tooLarge)).status).toBe(413);
    const streamed = new ReadableStream({ start(controller) { controller.enqueue(image); controller.enqueue(new Uint8Array(512_000)); controller.close(); } });
    expect((await request('PUT', cookie, streamed)).status).toBe(413);
    expect((await request('PATCH', cookie)).status).toBe(405);
    expect(await db.select().from(userProfile)).toHaveLength(0);

    // Removed from AUTH_ALLOWED_EMAILS, or no longer verified: no access to the photo.
    expect((await request('PUT', cookie, image)).status).toBe(200);
    expect((await photo(fixture, ['second@example.com'])('GET', cookie)).status).toBe(403);
    expect((await photo(fixture, ['second@example.com'])('DELETE', cookie)).status).toBe(403);
    await db.update(authUser).set({ emailVerified: false }).where(eq(authUser.id, user.id));
    expect((await request('GET', cookie)).status).toBe(403);
    expect((await request('PUT', cookie, image)).status).toBe(403);
  });
});

describe('app routes', () => {
  const settings = {
    AUTH_PROVIDER: 'better-auth', BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret, BREVO_API_KEY: 'fixture-never-used',
    AUTH_EMAIL_FROM: 'cabmate@example.com', AUTH_ALLOWED_EMAILS: allowed.join(','),
  };
  const original = Object.fromEntries(Object.keys(settings).map(key => [key, process.env[key]]));
  const restore = () => { for (const [key, value] of Object.entries(original)) if (value === undefined) delete process.env[key]; else process.env[key] = value; };
  const post = (handler: (r: Request) => Promise<Response>, path: string, method = 'POST') => handler(new Request(origin + '/api/auth' + path, {
    method, headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': '198.51.100.7' }, body: method === 'POST' ? '{}' : undefined,
  }));

  test('only the endpoints Cabmate uses are reachable, and none in Clerk mode', async () => {
    const { authHandler } = await import('../src/routes/api.auth.$');
    try {
      Object.assign(process.env, settings);
      for (const path of ['/sign-in/email', '/sign-in/magic-link', '/request-password-reset', '/reset-password', '/email-otp/send-verification-otp', '/sign-in/email-otp', '/change-password'])
        expect([path, (await post(authHandler, path)).status]).not.toEqual([path, 404]);
      for (const path of ['/get-session', '/list-accounts', '/passkey/list-user-passkeys'])
        expect([path, (await post(authHandler, path, 'GET')).status]).not.toEqual([path, 404]);
      for (const path of ['/sign-up/email', '/email-otp/get-verification-otp', '/delete-user', '/change-email', '/admin/list-users'])
        expect([path, (await post(authHandler, path)).status]).toEqual([path, 404]);
      process.env.AUTH_PROVIDER = 'clerk';
      for (const path of ['/get-session', '/sign-in/email-otp', '/sign-in/email'])
        expect((await post(authHandler, path, path === '/get-session' ? 'GET' : 'POST')).status).toBe(404);
    } finally { restore(); }
  });

  test('the photo route is 404 in Clerk mode and needs a session in Better Auth mode', async () => {
    const { avatarHandler } = await import('../src/routes/api.profile.avatar');
    const get = () => avatarHandler(new Request(origin + '/api/profile/avatar'));
    try {
      process.env.AUTH_PROVIDER = 'clerk';
      expect((await get()).status).toBe(404);
      expect((await avatarHandler(new Request(origin + '/api/profile/avatar', { method: 'DELETE', headers: { Origin: origin } }))).status).toBe(404);
      Object.assign(process.env, settings);
      expect((await get()).status).toBe(401);
    } finally { restore(); }
  });

  test('the live socket accepts only an invited Better Auth session from the app origin', async () => {
    const { authorizeSocket } = await import('./live');
    const fixture = authFixture();
    const { cookie } = await signIn(fixture);
    try {
      Object.assign(process.env, settings, { APP_ORIGIN: origin });
      const socket = (headers: Record<string, string>) => authorizeSocket(new Request(origin + '/ws', { headers }));
      expect(await socket({ origin, cookie })).toBe(true);
      expect(await socket({ origin })).toBe(false);
      expect(await socket({ origin: 'https://evil.example', cookie })).toBe(false);
      // Clerk mode without Clerk keys stays signed out, exactly as before.
      process.env.AUTH_PROVIDER = 'clerk';
      expect(await socket({ origin, cookie })).toBe(false);
    } finally { restore(); delete process.env.APP_ORIGIN; }
  });

  test('Clerk identities keep resolving drivers through clerk_user_id', async () => {
    const api = createApi(() => db, async () => ({ provider: 'clerk', id: 'user_clerk_1' }));
    const first = await (await api(new Request(origin + '/api/profile'))).json();
    expect(first.display_name).toBe('Driver');
    expect((await (await api(new Request(origin + '/api/profile'))).json()).id).toBe(first.id);
    const [row] = await db.select().from(users).where(eq(users.id, first.id));
    expect(row.clerkUserId).toBe('user_clerk_1');
    expect(row.authUserId).toBeNull();
    expect((await createApi(() => db, async () => null)(new Request(origin + '/api/profile'))).status).toBe(401);
  });
});

describe('link-clerk-users', () => {
  const clerkUser = (id: string, email: string, status = 'verified'): ClerkUser => ({
    id, primary_email_address_id: 'e_' + id, email_addresses: [{ id: 'e_other', email_address: 'other@example.com', verification: { status: 'verified' } },
      { id: 'e_' + id, email_address: email, verification: { status } }],
  });

  test('links existing drivers by verified primary email, dry-run first, idempotently', async () => {
    const [driver] = await db.insert(users).values({ clerkUserId: 'user_a', name: 'mike', displayName: 'Mike', apiKey: 'key-mike' }).returning();
    await db.insert(users).values([
      { clerkUserId: 'user_b', name: 'sarah', displayName: 'Sarah', apiKey: 'key-sarah' },
      { clerkUserId: 'user_c', name: 'early', displayName: 'Early', apiKey: 'key-early' },
    ]);
    // user_c already signed in with Better Auth before cutover and got a fresh driver: a conflict to resolve by hand.
    const fixture = authFixture({ allowedEmails: [...allowed, 'early@example.com'] });
    const early = await signIn(fixture, 'early@example.com');
    await fixture.call('/api/profile', early.cookie);
    const clerk = [clerkUser('user_a', 'Driver@Example.com'), clerkUser('user_b', 'sarah@example.com', 'unverified'),
      clerkUser('user_c', 'early@example.com'), clerkUser('user_d', 'nobody@example.com')];

    const dry = await linkClerkUsers(db, clerk, { apply: false, allowedEmails: allowed });
    expect(dry).toEqual({ clerkUsers: 4, linked: 1, alreadyLinked: 0, createdAuthUsers: 1, noDriver: 1, noVerifiedEmail: 1, conflicts: 1, notAllowlisted: 1 });
    expect(await db.select().from(authUser).where(eq(authUser.email, 'driver@example.com'))).toHaveLength(0);

    expect(await linkClerkUsers(db, clerk, { apply: true })).toMatchObject({ linked: 1, createdAuthUsers: 1, conflicts: 1 });
    expect(await linkClerkUsers(db, clerk, { apply: true })).toMatchObject({ linked: 0, alreadyLinked: 1, createdAuthUsers: 0 });
    const [account] = await db.select().from(authUser).where(eq(authUser.email, 'driver@example.com'));
    expect(account).toMatchObject({ emailVerified: true, name: 'Mike' });

    // After cutover, the Clerk-era driver signs in by email code and keeps their profile and agent key.
    await db.execute(sql`truncate auth_email_limit, auth_rate_limit`);
    const { cookie } = await signIn(authFixture());
    const own = await (await authFixture().call('/api/profile', cookie)).json();
    expect(own).toMatchObject({ id: driver.id, name: 'mike', display_name: 'Mike', api_key: 'key-mike' });
    expect(await db.select().from(users)).toHaveLength(4);
  });

  test('lists Clerk users page by page and reports only the HTTP status on failure', async () => {
    const requested: string[] = [];
    const page = (n: number) => Array.from({ length: n }, (_, i) => clerkUser(`user_${requested.length}_${i}`, 'x@example.com'));
    const fetcher = (async (url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('authorization')).toBe('Bearer sk_test_fixture');
      requested.push(url);
      return Response.json(page(requested.length === 1 ? 100 : 3));
    }) as unknown as typeof fetch;
    expect(await fetchClerkUsers('sk_test_fixture', fetcher)).toHaveLength(103);
    expect(requested.map(url => new URL(url).searchParams.get('offset'))).toEqual(['0', '100']);
    const failing = (async () => new Response('{"email":"secret@example.com"}', { status: 401 })) as unknown as typeof fetch;
    await expect(fetchClerkUsers('sk_test_fixture', failing)).rejects.toThrow('Clerk user listing failed with HTTP 401');
  });

  test('the legacy Supabase import never treats its auth_user_id as a Better Auth link', async () => {
    const legacyUser = { id: randomUUID(), auth_user_id: randomUUID(), name: 'legacy', display_name: 'Legacy', avatar_url: null, api_key: 'key-legacy', created_at: new Date().toISOString() };
    const tables = { users: [legacyUser], vehicles: [], sessions: [], jobs: [], telemetry: [], telemetry_rollup_minute: [] };
    await importLegacy(db, { version: 1, tables }, { [legacyUser.auth_user_id]: 'user_legacy' });
    const [row] = await db.select().from(users).where(eq(users.id, legacyUser.id));
    expect(row).toMatchObject({ clerkUserId: 'user_legacy', authUserId: null, apiKey: 'key-legacy' });
  });
});
