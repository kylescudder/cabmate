import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Nav } from '../components/Nav';

const signedIn = createServerFn().handler(async () => {
  const { identity } = await import('../../server/auth');
  return { signedIn: Boolean(await identity()) };
});
export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async ({ location }) => {
    const state = await signedIn();
    if (state.signedIn) return;
    // Sign-in returns to the page that was asked for; safeAppPath re-checks it client-side.
    throw redirect({ href: `/auth/sign-in?redirectTo=${encodeURIComponent(location.href)}` });
  },
  component: () => <><Nav /><main id="main" className="max-w-6xl mx-auto px-6 py-8"><Outlet /></main></>,
});
