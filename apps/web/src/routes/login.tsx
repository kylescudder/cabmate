import { SignIn } from '@clerk/tanstack-react-start';
import { createFileRoute } from '@tanstack/react-router';
export const Route = createFileRoute('/login')({ component: Login });
function Login() {
  return <main className="max-w-md mx-auto mt-16 px-6">
    <h1 className="text-xl font-bold mb-4">Euro Truck Simulator 2 Data Dashboard</h1>
    {import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ? <SignIn routing="hash" forceRedirectUrl="/profile" /> :
      <p role="status" className="rounded-lg border border-edge bg-panel p-6 text-slate-300">Sign-in is awaiting configuration. Please contact the dashboard administrator.</p>}
  </main>;
}
