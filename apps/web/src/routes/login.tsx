import { Nav } from '../components/Nav';
import { SignIn } from '@clerk/tanstack-react-start';
import { createFileRoute, Link, Navigate, useLoaderData } from '@tanstack/react-router';
export const Route = createFileRoute('/login')({ component: Login });
function Login() {
  const { provider } = useLoaderData({ from: '__root__' });
  // Better Auth has its own sign-in routes; /login stays as Clerk's page and a stable bookmark.
  if (provider === 'better-auth') return <Navigate to="/auth/$path" params={{ path: 'sign-in' }} replace />;
  return <><Nav publicView /><main id="main" className="max-w-md mx-auto mt-16 px-6">
    <h1 className="text-xl font-bold mb-4">Welcome to Cabmate</h1>
    <p className="mb-6 text-slate-300">Your friends, your next drive, and RadioMax along for the ride.</p>
    <Link to="/radio" className="inline-block mb-8 text-accent underline">Visit RadioMax without signing in</Link>
    {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignIn routing="hash" forceRedirectUrl="/profile" /> :
      <p role="status" className="rounded-lg border border-edge bg-panel p-6 text-slate-300">Sign-in is awaiting configuration. Please contact the Cabmate administrator.</p>}
  </main></>;
}
