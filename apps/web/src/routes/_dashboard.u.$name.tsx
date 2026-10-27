import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from '../lib/api';
import { useLiveDrivers } from '../lib/useLiveDrivers';
import { Distance } from '../components/Distance';
import { RecentTelemetryTable, type RecentRow } from '../components/RecentTelemetryTable';
interface Driver { user: { name: string; display_name: string }; history: { bucket: string; avg_speed: number; distance_km: number }[]; recent: RecentRow[] }
export const Route = createFileRoute('/_dashboard/u/$name')({ component: DriverPage });
function DriverPage() {
  const { name } = Route.useParams();
  // The live socket invalidates this query whenever this driver sends samples.
  const { connected } = useLiveDrivers();
  const { data, error } = useQuery({ queryKey: ['driver', name], queryFn: () => api<Driver>(`/api/drivers/${encodeURIComponent(name)}`), refetchInterval: connected ? false : 2000 });
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Loading driver…</p>;
  return <div><Link to="/" className="text-sm text-slate-400 hover:text-accent">← back</Link>
    <h1 className="text-2xl font-bold mt-2 mb-6">{data.user.display_name}</h1>
    <section className="mb-8"><h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Last 14 days</h2>
      <div className="rounded-lg border border-edge bg-panel p-5"><div className="text-3xl font-mono"><Distance km={data.history.reduce((sum, r) => sum + Number(r.distance_km), 0)} /></div>
        <div className="mt-4 grid grid-cols-7 gap-1">{data.history.slice(-14).map(r => <div key={r.bucket} className="flex flex-col items-center">
          <div className="w-full bg-accent/30 rounded" style={{ height: Math.min(60, Math.max(2, r.distance_km / 4)) }} />
          <span className="text-[10px] text-slate-500 mt-1">{new Date(r.bucket).toLocaleDateString(undefined, { weekday: 'short' })}</span>
        </div>)}</div>
      </div>
    </section><section><h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Recent telemetry</h2><div className="rounded-lg border border-edge bg-panel overflow-x-auto"><RecentTelemetryTable rows={data.recent} /></div></section>
  </div>;
}
