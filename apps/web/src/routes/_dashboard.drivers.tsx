import { createFileRoute } from '@tanstack/react-router'
;('use client')

import { useLiveDrivers } from '../lib/useLiveDrivers'
import { DriverCard } from '../components/DriverCard'

export const Route = createFileRoute('/_dashboard/drivers')({ component: Page })

function Page() {
  const { drivers, connected } = useLiveDrivers()
  const online = drivers.filter((d) => d.status === 'online')
  const offline = drivers.filter((d) => d.status !== 'online')

  return (
    <div>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Who&apos;s on the road</h1>
        <span
          className={`text-xs ${connected ? 'text-green-400' : 'text-slate-500'}`}
        >
          {connected ? '● live' : '○ disconnected'}
        </span>
      </div>

      {online.length === 0 && (
        <div className='mb-8 text-slate-400'>No-one online right now.</div>
      )}

      <div className='mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {online.map((d) => (
          <DriverCard key={d.userId} d={d} />
        ))}
      </div>

      {offline.length > 0 && (
        <>
          <h2 className='mb-3 text-sm tracking-wide text-slate-500 uppercase'>
            Offline
          </h2>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
            {offline.map((d) => (
              <DriverCard key={d.userId} d={d} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
