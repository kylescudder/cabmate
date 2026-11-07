import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { emailOTP, magicLink } from 'better-auth/plugins';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { passkey } from '@better-auth/passkey';
import type { Database } from './db';
import * as schema from './auth-schema';
import { reserveEmailDelivery, type LinkEmailKind } from './auth-email';
import { isAllowedEmail, isVerifiedAllowed } from './auth-policy';

const hasUnsafeCharacters = (value: string) => [...value].some(character => {
  const code = character.charCodeAt(0);
  return code < 0x20 || code === 0x7f || character === '\\';
});

// Relative paths, or absolute URLs on this origin, only. Resolve against the
// origin rather than inspecting the string: URL parsing strips tabs/newlines and
// treats backslashes as slashes, so `/\t/evil.example` would escape a prefix
// check. Control characters and backslashes are refused outright.
export function isSameSiteTarget(target: unknown, origin: string) {
  if (typeof target !== 'string' || hasUnsafeCharacters(target)) return false;
  if (!URL.canParse(target, origin)) return false;
  const url = new URL(target, origin);
  // Also refuse paths that normalise to `//host` (e.g. `/.//evil.example/`).
  return url.origin === origin && !url.pathname.startsWith('//');
}

export type AuthSettings = {
  baseURL: string;
  secret: string;
  allowedEmails: readonly string[];
  dailyEmailLimit: number;
};

export type SessionUser = { id: string; email: string; emailVerified: boolean; name: string; image?: string | null };
export type CabmateAuth = {
  handler: (request: Request) => Promise<Response>;
  api: { getSession: (input: { headers: Headers }) => Promise<{ user: SessionUser } | null> };
};

export function createCabmateAuth(
  database: Database,
  settings: AuthSettings,
  sendOTP: (email: string, otp: string) => Promise<void>,
  sendLink: (email: string, kind: LinkEmailKind, url: string) => Promise<void>,
): CabmateAuth {
  const origin = new URL(settings.baseURL).origin;
  const publicPasskeyPaths = new Set(['/passkey/generate-authenticate-options', '/passkey/verify-authentication']);
  const refuseCrossSite = (headers: Headers | undefined, requireOrigin = false) => {
    const requestOrigin = headers?.get('origin');
    if ((requireOrigin ? requestOrigin !== origin : requestOrigin && requestOrigin !== origin) || headers?.get('sec-fetch-site') === 'cross-site')
      throw new APIError('FORBIDDEN', { message: 'Cross-site request refused' });
  };
  const instance = betterAuth({
    appName: 'Cabmate',
    baseURL: origin,
    basePath: '/api/auth',
    secret: settings.secret,
    trustedOrigins: [origin],
    database: drizzleAdapter(database, {
      provider: 'pg',
      transaction: true,
      schema: {
        user: schema.authUser, session: schema.authSession, account: schema.authAccount,
        verification: schema.authVerification, passkey: schema.authPasskey, rateLimit: schema.authRateLimit,
      },
    }),
    session: { expiresIn: 7 * 86400, updateAge: 86400, freshAge: 3600, cookieCache: { enabled: false } },
    emailAndPassword: {
      enabled: true,
      // Invite-only: accounts are created for allowlisted drivers by email code or
      // magic link; a password is added later through the reset email.
      disableSignUp: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        if (!isAllowedEmail(user.email, settings.allowedEmails)) return;
        await sendLink(user.email, 'reset-password', url);
      },
    },
    user: { changeEmail: { enabled: false } },
    advanced: {
      cookiePrefix: 'cabmate-auth',
      useSecureCookies: origin.startsWith('https://'),
      crossSubDomainCookies: { enabled: false },
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      // Only Cloudflare's tunnel reaches the origin, and Cloudflare replaces this
      // header rather than trusting a client-sent value.
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 60,
      customRules: {
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/sign-in/email-otp': { window: 60, max: 10 },
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-in/magic-link': { window: 60, max: 3 },
        '/magic-link/verify': { window: 60, max: 10 },
        '/request-password-reset': { window: 60, max: 3 },
        '/reset-password': { window: 60, max: 5 },
        '/change-password': { window: 60, max: 5 },
        '/passkey/*': { window: 60, max: 20 },
      },
    },
    hooks: {
      before: createAuthMiddleware(async ctx => {
        if (ctx.path === '/update-user') {
          // Cabmate's own profile owns names and avatars; only the account name may change here.
          refuseCrossSite(ctx.headers, true);
          const session = await getSessionFromCtx(ctx);
          if (!isVerifiedAllowed(session?.user, settings.allowedEmails))
            throw new APIError('UNAUTHORIZED', { message: 'Sign in with an invited, verified email first' });
          const body = ctx.body as Record<string, unknown> | undefined;
          const name = typeof body?.name === 'string' ? body.name.trim() : '';
          if (!body || Object.keys(body).some(key => key !== 'name') || !name || name.length > 80)
            throw new APIError('BAD_REQUEST', { message: 'Invalid profile update' });
          body.name = name;
        }
        if (ctx.path === '/email-otp/send-verification-otp') {
          refuseCrossSite(ctx.headers);
          const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
          if (ctx.body?.type !== 'sign-in') throw new APIError('BAD_REQUEST', { message: 'Unsupported sign-in method' });
          // Same answer for every address, so the form never reveals who is invited.
          if (!isAllowedEmail(email, settings.allowedEmails)) return ctx.json({ success: true });
          ctx.body.email = email;
          await reserveEmailDelivery(database, email, settings.dailyEmailLimit);
        }
        if (ctx.path === '/sign-in/magic-link' || ctx.path === '/request-password-reset') {
          refuseCrossSite(ctx.headers);
          // Emailed links may only return to this site.
          for (const key of ['callbackURL', 'newUserCallbackURL', 'errorCallbackURL', 'redirectTo']) {
            const target: unknown = ctx.body?.[key];
            if (target !== undefined && !isSameSiteTarget(target, origin)) throw new APIError('FORBIDDEN', { message: 'Invalid redirect' });
          }
          const email = typeof ctx.body?.email === 'string' ? ctx.body.email.trim().toLowerCase() : '';
          if (!isAllowedEmail(email, settings.allowedEmails)) return ctx.json({ status: true });
          ctx.body.email = email;
          await reserveEmailDelivery(database, email, settings.dailyEmailLimit);
        }
        if (ctx.path.startsWith('/passkey/') && !publicPasskeyPaths.has(ctx.path)) {
          const session = await getSessionFromCtx(ctx);
          if (!isVerifiedAllowed(session?.user, settings.allowedEmails))
            throw new APIError('UNAUTHORIZED', { message: 'Sign in with an invited, verified email first' });
        }
      }),
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => {
            if (!isAllowedEmail(user.email, settings.allowedEmails))
              throw new APIError('FORBIDDEN', { message: 'Cabmate is invite-only' });
            return { data: { ...user, email: user.email.trim().toLowerCase() } };
          },
        },
      },
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: { hash: async otp => createHmac('sha256', settings.secret).update('cabmate-email-otp:' + otp).digest('hex') },
        async sendVerificationOTP({ email, otp, type }) {
          if (type !== 'sign-in' || !isAllowedEmail(email, settings.allowedEmails))
            throw new APIError('FORBIDDEN', { message: 'Unsupported sign-in request' });
          await sendOTP(email, otp);
        },
      }),
      magicLink({
        expiresIn: 600,
        storeToken: 'hashed',
        async sendMagicLink({ email, url }) {
          if (!isAllowedEmail(email, settings.allowedEmails)) throw new APIError('FORBIDDEN', { message: 'Unsupported sign-in request' });
          await sendLink(email, 'magic-link', url);
        },
      }),
      passkey({
        rpID: new URL(origin).hostname,
        rpName: 'Cabmate',
        origin,
        registration: { requireSession: true },
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      }),
    ],
  });
  // Expose only the two operations the app uses, not every plugin's endpoint types.
  return {
    handler: instance.handler,
    api: { getSession: input => instance.api.getSession(input) as Promise<{ user: SessionUser } | null> },
  };
}
