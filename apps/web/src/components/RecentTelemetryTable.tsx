import { formatDistance, formatSpeed, useUnits } from '../lib/units';

interface JobInfo {
  cargo: string;
  source_city: string | null;
  destination_city: string | null;
}

export interface RecentRow {
  time: string;
  speed_kph: number;
  fuel_litres: number;
  odometer_km: number;
  job_id: string | null;
  jobs: JobInfo | null;
}

export function RecentTelemetryTable({ rows }: { rows: RecentRow[] }) {
  const { units } = useUnits();
  return (
    <table className="w-full text-sm">
      <thead className="bg-edge/40 text-slate-400 text-xs uppercase">
        <tr>
          <th className="text-left px-4 py-2">Time</th>
          <th className="text-right px-4 py-2">Speed</th>
          <th className="text-right px-4 py-2">Fuel</th>
          <th className="text-right px-4 py-2">Odo</th>
          <th className="text-left px-4 py-2">Job</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 30).map((r, i) => (
          <tr key={`${r.time}-${i}`} className="border-t border-edge">
            <td className="px-4 py-2 font-mono text-xs">
              {new Date(r.time).toLocaleString()}
            </td>
            <td className="px-4 py-2 text-right font-mono">{formatSpeed(r.speed_kph, units)}</td>
            <td className="px-4 py-2 text-right font-mono">{Math.round(r.fuel_litres)} L</td>
            <td className="px-4 py-2 text-right font-mono">
              {formatDistance(r.odometer_km, units)}
            </td>
            <td className="px-4 py-2 text-slate-400">
              {r.jobs?.source_city && r.jobs?.destination_city
                ? `${r.jobs.source_city} → ${r.jobs.destination_city}`
                : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
