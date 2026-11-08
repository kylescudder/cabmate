// Cutover helper: links existing Clerk-era drivers to Better Auth accounts by each
// Clerk user's verified primary email, so drivers keep their profile, agent key,
// vehicles and telemetry after AUTH_PROVIDER switches to better-auth.
//
//   bun apps/web/server/link-clerk-users.ts           # dry run (default)
//   bun apps/web/server/link-clerk-users.ts --apply   # write the links
//
// Needs CLERK_SECRET_KEY and DATABASE_URL (the app's runtime role is enough).
// Idempotent. Prints counts only: never emails, IDs or keys.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Database } from './db';
import { isAllowedEmail } from './auth-policy';
import { authUser, users } from './schema';

export type ClerkUser = {
  id: string;
  primary_email_address_id: string | null;
  email_addresses: { id: string; email_address: string; verification: { status: string } | null }[];
};

export async function fetchClerkUsers(secretKey: string, fetcher: typeof fetch = fetch): Promise<ClerkUser[]> {
  const all: ClerkUser[] = [];
  for (let offset = 0; ; offset += 100) {
    const response = await fetcher(`https://api.clerk.com/v1/users?limit=100&offset=${offset}&order_by=created_at`, {
      headers: { authorization: `Bearer ${secretKey}` }, signal: AbortSignal.timeout(10_000),
    });
    // Status only: Clerk error bodies can echo identifiers.
    if (!response.ok) throw new Error(`Clerk user listing failed with HTTP ${response.status}`);
    const page = await response.json() as ClerkUser[];
    all.push(...page);
    if (page.length < 100) return all;
  }
}

export function verifiedPrimaryEmail(user: ClerkUser) {
  const primary = user.email_addresses.find(address => address.id === user.primary_email_address_id);
  return primary?.verification?.status === 'verified' ? primary.email_address.trim().toLowerCase() : null;
}

export type LinkCounts = {
  clerkUsers: number; linked: number; alreadyLinked: number; createdAuthUsers: number;
  noDriver: number; noVerifiedEmail: number; conflicts: number; notAllowlisted: number;
};

export async function linkClerkUsers(db: Database, clerkUsers: ClerkUser[], { apply, allowedEmails }: { apply: boolean; allowedEmails?: readonly string[] }) {
  const counts: LinkCounts = { clerkUsers: clerkUsers.length, linked: 0, alreadyLinked: 0, createdAuthUsers: 0, noDriver: 0, noVerifiedEmail: 0, conflicts: 0, notAllowlisted: 0 };
  for (const clerkUser of clerkUsers) {
    const [driver] = await db.select({ id: users.id, authUserId: users.authUserId, displayName: users.displayName }).from(users).where(eq(users.clerkUserId, clerkUser.id));
    if (!driver) { counts.noDriver++; continue; }
    const email = verifiedPrimaryEmail(clerkUser);
    if (!email) { counts.noVerifiedEmail++; continue; }
    // Linking never grants access by itself; sign-in still requires the allowlist.
    if (allowedEmails && !isAllowedEmail(email, allowedEmails)) counts.notAllowlisted++;
    const [account] = await db.select({ id: authUser.id }).from(authUser).where(eq(authUser.email, email));
    if (account && driver.authUserId === account.id) { counts.alreadyLinked++; continue; }
    if (driver.authUserId) { counts.conflicts++; continue; }
    if (account) {
      const [other] = await db.select({ id: users.id }).from(users).where(eq(users.authUserId, account.id));
      // Already a different driver (e.g. signed in with Better Auth before cutover): resolve by hand.
      if (other) { counts.conflicts++; continue; }
    }
    if (!account) counts.createdAuthUsers++;
    counts.linked++;
    if (!apply) continue;
    await db.transaction(async tx => {
      let authUserId = account?.id;
      if (!authUserId) {
        // The Clerk address was verified, so the Better Auth account starts verified.
        [{ id: authUserId }] = await tx.insert(authUser).values({ id: randomUUID(), name: driver.displayName, email, emailVerified: true }).returning({ id: authUser.id });
      }
      await tx.update(users).set({ authUserId }).where(eq(users.id, driver.id));
    });
  }
  return counts;
}

if (import.meta.main) {
  const apply = process.argv.includes('--apply');
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is required');
  const { connectOneShot } = await import('./db');
  const { readAuthEnv } = await import('./env');
  const allowed = readAuthEnv().AUTH_ALLOWED_EMAILS;
  const { db, client } = connectOneShot();
  try {
    const counts = await linkClerkUsers(db, await fetchClerkUsers(secretKey), { apply, allowedEmails: allowed.length ? allowed : undefined });
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counts }));
  } finally { await client.end(); }
}
