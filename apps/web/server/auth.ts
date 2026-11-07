import { auth } from '@clerk/tanstack-react-start/server';
import { getRequest } from '@tanstack/react-start/server';
import { readAuthEnv } from './env';
import type { Identity } from './identity';

export type { Identity };

export async function identity(request: Request = getRequest()): Promise<Identity | null> {
  if (readAuthEnv().AUTH_PROVIDER === 'better-auth') {
    const { betterAuthIdentity } = await import('./better-auth');
    return betterAuthIdentity(request.headers);
  }
  if (!process.env.CLERK_SECRET_KEY) return null;
  const session = await auth();
  return session.userId ? { provider: 'clerk', id: session.userId } : null;
}
