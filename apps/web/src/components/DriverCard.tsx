import { Link } from '@tanstack/react-router'
import type { DriverRow } from '../lib/useLiveDrivers'
import { formatSpeed, useUnits } from '../lib/units'

function fmt(n: number | undefined, digits = 0) {
  if (n === undefined || n === null) return '—'
  return n.toLocaleString(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits
  })
}

export function DriverCard({ d }: { d: DriverRow }) {
  const { units } = useUnits()
  const sample = d.latest
  const fuelPct =
    sample && d.fuelCapacityLitres
      ? Math.round((sample.fuelLitres / d.fuelCapacityLitres) * 100)
      : null
  return (
    <Link
      to='/u/$name'
      params={{ name: d.name }}
      className='border-edge bg-panel hover:border-accent block rounded-lg border p-5 transition'
    >
      <div className='mb-3 flex items-center gap-3'>
        {d.avatarUrl ? (
          <img
            src={d.avatarUrl}
            alt=''
            className='bg-edge h-10 w-10 rounded-full'
          />
        ) : (
          <div className='bg-edge h-10 w-10 rounded-full' />
        )}
        <div className='flex-1'>
          <div className='font-semibold'>{d.displayName}</div>
          <div className='text-xs text-slate-400'>
            {d.truck ? `${d.truck.make} ${d.truck.model}` : 'no truck'}
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            d.status === 'online'
              ? 'bg-green-500/20 text-green-300'
              : 'bg-slate-700 text-slate-400'
          }`}
        >
          {d.status}
        </span>
      </div>

      <div className='mb-4 grid grid-cols-3 gap-3 text-center'>
        <Metric
          label='Speed'
          value={formatSpeed(sample?.speedKph, units)}
          unit=''
        />
        <Metric label='RPM' value={`${fmt(sample?.rpm, 0)}`} unit='' />
        <Metric label='Gear' value={`${sample?.gear ?? '—'}`} unit='' />
      </div>

      <div className='mb-3'>
        <div className='mb-1 flex justify-between text-xs text-slate-400'>
          <span>Fuel</span>
          <span>{fuelPct != null ? `${fuelPct}%` : '—'}</span>
        </div>
        <div className='bg-edge h-1.5 overflow-hidden rounded-full'>
          <div
            className='bg-accent h-full'
            style={{ width: `${fuelPct ?? 0}%` }}
          />
        </div>
      </div>

      {d.job ? (
        <div className='border-edge border-t pt-3 text-xs text-slate-300'>
          <div className='font-medium text-slate-100'>{d.job.cargo}</div>
          <div className='text-slate-400'>
            {d.job.sourceCity} → {d.job.destinationCity}
          </div>
        </div>
      ) : (
        <div className='border-edge border-t pt-3 text-xs text-slate-500'>
          no active job
        </div>
      )}
    </Link>
  )
}

function Metric({
  label,
  value,
  unit
}: {
  label: string
  value: string
  unit: string
}) {
  return (
    <div>
      <div className='text-[11px] tracking-wide text-slate-500 uppercase'>
        {label}
      </div>
      <div className='font-mono text-lg'>
        {value}
        {unit && <span className='ml-1 text-xs text-slate-400'>{unit}</span>}
      </div>
    </div>
  )
}
