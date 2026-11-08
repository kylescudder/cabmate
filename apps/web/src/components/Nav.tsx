import { Link } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

// Better Auth UI loads only for signed-in drivers, never on public pages.
const BetterAuthUserMenu = lazy(() => import('./BetterAuthUserMenu').then(({ BetterAuthUserMenu }) => ({ default: BetterAuthUserMenu })));

function Account() {
  return <div className="nav-account">
    <Suspense fallback={<span className="block size-8 rounded-full bg-edge" />}><BetterAuthUserMenu /></Suspense>
  </div>;
}
export function Nav({ publicView = false }: { publicView?: boolean }) {
  return <header className="cab-header">
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="cab-nav">
      <Link to="/" className="cab-brand"><img src="/favicon.svg" alt="" width="36" height="36" /><span>Cabmate<span className="cab-tagline">Good company for the road.</span></span></Link>
      <nav aria-label="Main navigation">
        <Link to="/" activeOptions={{ exact: true }}>Map</Link>
        <Link to="/drivers">Drivers</Link>
        <Link to="/leaderboard">On the road</Link>
        <Link to="/radio">Radio</Link>
        <Link to="/profile">Your cab</Link>
      </nav>
      {!publicView && <Account />}
    </div>
  </header>;
}
