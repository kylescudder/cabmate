import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { api } from '../lib/api';
import { AgentSetup } from '../components/AgentSetup';
import { ProfileForm } from '../components/ProfileForm';
import { OnboardingBanner } from '../components/OnboardingBanner';
interface Profile { id: string; name: string; display_name: string; avatar_url: string | null; api_key: string; sessionCount: number }
export const Route = createFileRoute('/_dashboard/profile')({ component: ProfilePage });
function ProfilePage() {
  const { data, error } = useQuery({ queryKey: ['profile'], queryFn: () => api<Profile>('/api/profile') });
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Loading profile…</p>;
  return <div className="space-y-8"><h1 className="text-2xl font-bold">Profile</h1>
    {data.sessionCount === 0 && <OnboardingBanner />}<ProfileForm initial={data} /><AgentSetup userId={data.id} apiKey={data.api_key} />
  </div>;
}
