import { Link } from "@tanstack/react-router";
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDistance, useUnits } from '../lib/units';

export interface LeaderboardRow {
  id: string;
  name: string;
  display_name: string;
  totalKm: number;
}

export function LeaderboardLive({ initial = [] }: { initial?: LeaderboardRow[] }) {
  const { units } = useUnits();
  const { data: rows = initial } = useQuery({ queryKey: ['leaderboard'], queryFn: () => api<LeaderboardRow[]>('/api/leaderboard'), refetchInterval: 3000 });

  return (
    <div className="rounded-lg border border-edge bg-panel overflow-hidden">
      <table className="w-full">
        <thead className="bg-edge/40 text-slate-400 text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2 w-10">#</th>
            <th className="text-left px-4 py-2">Driver</th>
            <th className="text-right px-4 py-2">Distance</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className="border-t border-edge">
              <td className="px-4 py-3 font-mono text-slate-500">{i + 1}</td>
              <td className="px-4 py-3">
                <Link to="/u/$name" params={{ name: r.name }} className="hover:text-accent">
                  {r.display_name}
                </Link>
              </td>
              <td className="px-4 py-3 text-right font-mono">
                {formatDistance(r.totalKm, units, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
