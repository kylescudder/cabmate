import { Link } from "@tanstack/react-router";
import type { DriverRow } from "../lib/useLiveDrivers";
import { formatSpeed, useUnits } from "../lib/units";

function fmt(n: number | undefined, digits = 0) {
  if (n === undefined || n === null) return "—";
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

export function DriverCard({ d }: { d: DriverRow }) {
  const { units } = useUnits();
  const sample = d.latest;
  const fuelPct =
    sample && d.fuelCapacityLitres
      ? Math.round((sample.fuelLitres / d.fuelCapacityLitres) * 100)
      : null;
  return (
    <Link
      to="/u/$name"
      params={{ name: d.name }}
      className="block rounded-lg border border-edge bg-panel p-5 hover:border-accent transition"
    >
      <div className="flex items-center gap-3 mb-3">
        {d.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.avatarUrl} alt="" className="h-10 w-10 rounded-full bg-edge" />
        ) : (
          <div className="h-10 w-10 rounded-full bg-edge" />
        )}
        <div className="flex-1">
          <div className="font-semibold">{d.displayName}</div>
          <div className="text-xs text-slate-400">
            {d.truck ? `${d.truck.make} ${d.truck.model}` : "no truck"}
          </div>
        </div>
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            d.status === "online" ? "bg-green-500/20 text-green-300" : "bg-slate-700 text-slate-400"
          }`}
        >
          {d.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 text-center mb-4">
        <Metric label="Speed" value={formatSpeed(sample?.speedKph, units)} unit="" />
        <Metric label="RPM" value={`${fmt(sample?.rpm, 0)}`} unit="" />
        <Metric label="Gear" value={`${sample?.gear ?? "—"}`} unit="" />
      </div>

      <div className="mb-3">
        <div className="flex justify-between text-xs text-slate-400 mb-1">
          <span>Fuel</span>
          <span>{fuelPct != null ? `${fuelPct}%` : "—"}</span>
        </div>
        <div className="h-1.5 bg-edge rounded-full overflow-hidden">
          <div
            className="h-full bg-accent"
            style={{ width: `${fuelPct ?? 0}%` }}
          />
        </div>
      </div>

      {d.job ? (
        <div className="text-xs text-slate-300 border-t border-edge pt-3">
          <div className="font-medium text-slate-100">{d.job.cargo}</div>
          <div className="text-slate-400">
            {d.job.sourceCity} → {d.job.destinationCity}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500 border-t border-edge pt-3">no active job</div>
      )}
    </Link>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-lg">
        {value}
        {unit && <span className="text-xs text-slate-400 ml-1">{unit}</span>}
      </div>
    </div>
  );
}
