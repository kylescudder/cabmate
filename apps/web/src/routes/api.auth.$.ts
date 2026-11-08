import { createFileRoute } from '@tanstack/react-router';

// Only the endpoints Cabmate's sign-in and account UI use. Sign-up, email change,
// account deletion and every other Better Auth endpoint stay unreachable.
const paths = new Set([
  '/get-session', '/sign-out', '/update-user',
  '/email-otp/send-verification-otp', '/sign-in/email-otp', '/sign-in/email',
  '/sign-in/magic-link', '/magic-link/verify',
  '/request-password-reset', '/reset-password', '/change-password', '/list-accounts',
  '/passkey/generate-register-options', '/passkey/verify-registration',
  '/passkey/generate-authenticate-options', '/passkey/verify-authentication',
  '/passkey/list-user-passkeys', '/passkey/update-passkey', '/passkey/delete-passkey',
]);

export async function authHandler(request: Request) {
  const path = new URL(request.url).pathname.slice('/api/auth'.length);
  // The emailed reset link lands on /reset-password/<token> before redirecting.
  const allowed = paths.has(path) || /^\/reset-password\/[\w-]+$/.test(path);
  if (!allowed)
    return new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } });
  const { getBetterAuth } = await import('../../server/better-auth');
  const response = await getBetterAuth().handler(request);
  response.headers.set('cache-control', 'no-store');
  return response;
}

export const Route = createFileRoute('/api/auth/$')({
  server: { handlers: { GET: ({ request }) => authHandler(request), POST: ({ request }) => authHandler(request) } },
});
