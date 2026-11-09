import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { formatDistance, useUnits } from '../lib/units'

export interface LeaderboardRow {
  id: string
  name: string
  display_name: string
  totalKm: number
  allTimeKm: number
}

export function LeaderboardLive({
  initial = []
}: {
  initial?: LeaderboardRow[]
}) {
  const { units } = useUnits()
  const { data: rows = initial } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => api<LeaderboardRow[]>('/api/leaderboard'),
    refetchInterval: 3000
  })

  return (
    <div className='border-edge bg-panel overflow-hidden rounded-lg border'>
      <table className='w-full'>
        <thead className='bg-edge/40 text-xs text-slate-400 uppercase'>
          <tr>
            <th className='w-10 px-4 py-2 text-left'>#</th>
            <th className='px-4 py-2 text-left'>Driver</th>
            <th className='px-4 py-2 text-right'>Last 14 days</th>
            <th className='px-4 py-2 text-right'>All time</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id} className='border-edge border-t'>
              <td className='px-4 py-3 font-mono text-slate-500'>{i + 1}</td>
              <td className='px-4 py-3'>
                <Link
                  to='/u/$name'
                  params={{ name: r.name }}
                  className='hover:text-accent'
                >
                  {r.display_name}
                </Link>
              </td>
              <td className='px-4 py-3 text-right font-mono'>
                {formatDistance(r.totalKm, units, 1)}
              </td>
              <td className='px-4 py-3 text-right font-mono text-slate-400'>
                {formatDistance(r.allTimeKm, units, 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
