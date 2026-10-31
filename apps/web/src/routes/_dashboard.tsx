import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { Nav } from '../components/Nav';

const signedIn = createServerFn().handler(async () => {
  const { identity } = await import('../../server/auth');
  return Boolean(await identity());
});
export const Route = createFileRoute('/_dashboard')({
  beforeLoad: async () => { if (!(await signedIn())) throw redirect({ to: '/login' }); },
  component: () => <><Nav /><main id="main" className="max-w-6xl mx-auto px-6 py-8"><Outlet /></main></>,
});
