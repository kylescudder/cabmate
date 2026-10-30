import { useClerk } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';
export function Nav() {
  const clerk = useClerk();
  return <header className="border-b border-edge bg-panel"><div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center gap-4">
    <Link to="/" className="flex items-center gap-2 font-bold text-accent text-base leading-tight"><img src="/favicon.svg" alt="" className="h-7 w-7" />Euro Truck Simulator 2 Data Dashboard</Link>
    <nav className="flex gap-4 text-sm text-slate-300 flex-1">
      <Link to="/">Map</Link><Link to="/drivers">Drivers</Link><Link to="/leaderboard">Leaderboard</Link><Link to="/profile">Profile</Link>
    </nav>
    <button onClick={() => clerk.signOut({ redirectUrl: '/login' })} className="text-xs text-slate-400 hover:text-accent">Sign out</button>
  </div></header>;
}
