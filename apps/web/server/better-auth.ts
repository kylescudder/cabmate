import { database } from './db';
import { readAuthEnv } from './env';
import { createCabmateAuth, type CabmateAuth, type SessionUser } from './auth-factory';
import { sendCodeEmail, sendLinkEmail } from './auth-email';
import { isVerifiedAllowed } from './auth-policy';
import type { Identity } from './identity';

let instance: CabmateAuth | undefined;

export function getBetterAuth() {
  if (instance) return instance;
  const env = readAuthEnv();
  const origin = env.BETTER_AUTH_URL;
  const mail = { apiKey: env.BREVO_API_KEY, from: env.AUTH_EMAIL_FROM };
  instance = createCabmateAuth(database(), {
    baseURL: origin, secret: env.BETTER_AUTH_SECRET, allowedEmails: env.AUTH_ALLOWED_EMAILS, dailyEmailLimit: env.AUTH_EMAIL_DAILY_LIMIT,
  }, (email, otp) => sendCodeEmail(mail, origin, email, otp), (email, kind, url) => sendLinkEmail(mail, origin, email, kind, url));
  return instance;
}

// A session counts only while its email is verified and still on the allowlist,
// so removing an address from AUTH_ALLOWED_EMAILS revokes access immediately.
export async function verifiedUser(headers: Headers, auth: CabmateAuth = getBetterAuth(), allowed: readonly string[] = readAuthEnv().AUTH_ALLOWED_EMAILS): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers });
  return session && isVerifiedAllowed(session.user, allowed) ? session.user : null;
}

export async function betterAuthIdentity(headers: Headers, auth?: CabmateAuth, allowed?: readonly string[]): Promise<Identity | null> {
  const user = await verifiedUser(headers, auth, allowed);
  return user ? { id: user.id, name: user.name } : null;
}
