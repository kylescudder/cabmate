import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { api } from '../lib/api';
import { useLiveDrivers } from '../lib/useLiveDrivers';
import { formatSpeed, useUnits } from '../lib/units';
import { Distance } from '../components/Distance';
import { RecentTelemetryTable, type RecentRow } from '../components/RecentTelemetryTable';
// history has one row per UTC day driven, all time: raw telemetry plus the per-minute rollups.
interface Day { bucket: string; avg_speed: number | null; distance_km: number; top_speed_kph: number | null; minutes: number }
interface Driver { user: { name: string; display_name: string }; history: Day[]; recent: RecentRow[] }
export const Route = createFileRoute('/_dashboard/u/$name')({ component: DriverPage });
const DAY_MS = 86_400_000;
function DriverPage() {
  const { name } = Route.useParams();
  const { units } = useUnits();
  // The live socket invalidates this query whenever this driver sends samples.
  const { connected } = useLiveDrivers();
  const { data, error } = useQuery({ queryKey: ['driver', name], queryFn: () => api<Driver>(`/api/drivers/${encodeURIComponent(name)}`), refetchInterval: connected ? false : 2000 });
  if (error) return <p role="alert">{error.message}</p>;
  if (!data) return <p>Loading driver…</p>;
  const since = Date.now() - 14 * DAY_MS;
  const recentDays = data.history.filter(r => new Date(r.bucket).getTime() > since - DAY_MS);
  const totalKm = data.history.reduce((sum, r) => sum + r.distance_km, 0);
  const minutes = data.history.reduce((sum, r) => sum + r.minutes, 0);
  const topSpeed = data.history.reduce<number | null>((top, r) => r.top_speed_kph == null ? top : Math.max(top ?? 0, r.top_speed_kph), null);
  const months = [...data.history.reduce((m, r) => m.set(r.bucket.slice(0, 7), (m.get(r.bucket.slice(0, 7)) ?? 0) + r.distance_km), new Map<string, number>())].slice(-12);
  const maxMonth = Math.max(1, ...months.map(([, km]) => km));
  return <div><Link to="/" className="text-sm text-slate-400 hover:text-accent">← back</Link>
    <h1 className="text-2xl font-bold mt-2 mb-6">{data.user.display_name}</h1>
    <section className="mb-8"><h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Last 14 days</h2>
      <div className="rounded-lg border border-edge bg-panel p-5"><div className="text-3xl font-mono"><Distance km={recentDays.reduce((sum, r) => sum + r.distance_km, 0)} /></div>
        {recentDays.length ? <div className="mt-4 grid grid-cols-7 gap-1">{recentDays.slice(-14).map(r => <div key={r.bucket} className="flex flex-col items-center">
          <div className="w-full bg-accent/30 rounded" style={{ height: Math.min(60, Math.max(2, r.distance_km / 4)) }} />
          <span className="text-[10px] text-slate-500 mt-1">{new Date(r.bucket).toLocaleDateString(undefined, { weekday: 'short' })}</span>
        </div>)}</div> : <p className="mt-2 text-sm text-slate-500">No driving in the last 14 days.</p>}
      </div>
    </section>
    {data.history.length > 0 && <section className="mb-8"><h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">All time · since {new Date(data.history[0].bucket).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</h2>
      <div className="rounded-lg border border-edge bg-panel p-5">
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Stat label="Distance"><Distance km={totalKm} /></Stat>
          <Stat label="Time driving">{Math.floor(minutes / 60)}h {minutes % 60}m</Stat>
          <Stat label="Top speed">{formatSpeed(topSpeed, units)}</Stat>
          <Stat label="Days driven">{data.history.length}</Stat>
        </dl>
        <div className="mt-6 flex items-end gap-2 h-24">{months.map(([month, km]) => <div key={month} className="flex-1 flex flex-col items-center justify-end h-full" title={`${month}: ${Math.round(km)} km`}>
          <div className="w-full bg-accent/30 rounded" style={{ height: `${Math.max(2, (km / maxMonth) * 100)}%` }} />
          <span className="text-[10px] text-slate-500 mt-1">{new Date(`${month}-01T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}</span>
        </div>)}</div>
      </div>
    </section>}
    <section><h2 className="text-sm uppercase tracking-wide text-slate-500 mb-3">Recent telemetry</h2><div className="rounded-lg border border-edge bg-panel overflow-x-auto"><RecentTelemetryTable rows={data.recent} /></div></section>
  </div>;
}
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return <div><dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt><dd className="mt-1 text-2xl font-mono">{children}</dd></div>;
}
