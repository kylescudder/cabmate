import { useClerk } from '@clerk/tanstack-react-start';
import { Link } from '@tanstack/react-router';

function SignOut() {
  const clerk = useClerk();
  return <button onClick={() => clerk.signOut({ redirectUrl: '/login' })} className="nav-signout">Sign out</button>;
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
      {!publicView && import.meta.env.VITE_CLERK_PUBLISHABLE_KEY && <SignOut />}
    </div>
  </header>;
}
