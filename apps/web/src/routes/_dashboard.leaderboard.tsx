import { createFileRoute } from '@tanstack/react-router';
import { LeaderboardLive } from '../components/LeaderboardLive';
export const Route = createFileRoute('/_dashboard/leaderboard')({ component: () => <div><h1 className="text-2xl font-bold mb-6">Leaderboard · last 14 days</h1><LeaderboardLive /></div> });
