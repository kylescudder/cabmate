import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Nav } from '../components/Nav';

const signedIn = createServerFn().handler(async () => {
  const [{ identity }, { readAuthEnv }] = await Promise.all([import('../../server/auth'), import('../../server/env')]);
  return { signedIn: Boolean(await identity()), provider: readAuthEnv().AUTH_PROVIDER };
});
export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async ({ location }) => {
    const state = await signedIn();
    if (state.signedIn) return;
    // Better Auth returns to the page that was asked for; safeAppPath re-checks it client-side.
    if (state.provider === 'better-auth') throw redirect({ href: `/auth/sign-in?redirectTo=${encodeURIComponent(location.href)}` });
    throw redirect({ to: '/login' });
  },
  component: () => <><Nav /><main id="main" className="max-w-6xl mx-auto px-6 py-8"><Outlet /></main></>,
});
