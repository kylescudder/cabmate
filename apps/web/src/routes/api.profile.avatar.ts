import { createFileRoute } from '@tanstack/react-router';
import { readAuthEnv } from '../../server/env';

// The driver's private profile photo (Better Auth only; 404 while Clerk is selected).
export async function avatarHandler(request: Request) {
  const env = readAuthEnv();
  if (env.AUTH_PROVIDER !== 'better-auth')
    return Response.json({ error: 'Not found' }, { status: 404, headers: { 'cache-control': 'no-store' } });
  const [{ createAvatarHandler }, { getBetterAuth }, { database }] = await Promise.all([
    import('../../server/profile-avatar'), import('../../server/better-auth'), import('../../server/db'),
  ]);
  return createAvatarHandler(database(), {
    origin: env.BETTER_AUTH_URL!, allowedEmails: env.AUTH_ALLOWED_EMAILS,
    getSession: headers => getBetterAuth().api.getSession({ headers }),
  })(request);
}

export const Route = createFileRoute('/api/profile/avatar')({
  server: { handlers: { GET: ({ request }) => avatarHandler(request), PUT: ({ request }) => avatarHandler(request), DELETE: ({ request }) => avatarHandler(request) } },
});
