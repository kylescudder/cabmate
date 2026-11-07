import { useQuery } from '@tanstack/react-query';
import { createFileRoute, useLoaderData } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { api } from '../lib/api';
import { AgentSetup } from '../components/AgentSetup';
import { ProfileForm } from '../components/ProfileForm';
import { OnboardingBanner } from '../components/OnboardingBanner';
// Better Auth's account settings load only on this page, and only in that mode.
const BetterAuthAccount = lazy(() => import('../components/BetterAuthAccount').then(({ BetterAuthAccount }) => ({ default: BetterAuthAccount })));
interface Profile { id: string; name: string; display_name: string; avatar_url: string | null; api_key: string; sessionCount: number }
export const Route = createFileRoute('/_dashboard/profile')({ component: ProfilePage });
function ProfilePage() {
  const { provider } = useLoaderData({ from: '__root__' });
  const { data, error } = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/api/profile') });
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Getting your cab ready…</p>;
  return <div className="space-y-8"><h1 className="text-2xl font-bold">Your cab</h1>
    {data.sessionCount === 0 && <OnboardingBanner />}<ProfileForm initial={data} /><AgentSetup userId={data.id} apiKey={data.api_key} />
    {provider === 'better-auth' && <Suspense fallback={null}><BetterAuthAccount /></Suspense>}
  </div>;
}
