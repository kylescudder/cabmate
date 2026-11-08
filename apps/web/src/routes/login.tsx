import { createFileRoute, redirect } from '@tanstack/react-router';

// Old bookmark for the sign-in page; Better Auth's sign-in lives at /auth/sign-in.
export const Route = createFileRoute('/login')({
  beforeLoad: () => { throw redirect({ to: '/auth/$path', params: { path: 'sign-in' }, replace: true }); },
});
