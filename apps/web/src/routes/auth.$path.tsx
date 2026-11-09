import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { Auth } from '../components/auth/auth'
import { BetterAuthUIProvider } from '../components/BetterAuthUIProvider'
import { Nav } from '../components/Nav'

export const Route = createFileRoute('/auth/$path')({
  head: () => ({ meta: [{ title: 'Sign in | Cabmate' }] }),
  component: AuthPage
})

function AuthPage() {
  const { path } = Route.useParams()
  // Cabmate is invite-only: there is no sign-up.
  if (path === 'sign-up')
    return <Navigate to='/auth/$path' params={{ path: 'sign-in' }} replace />
  return (
    <>
      <Nav publicView />
      <main
        id='main'
        className='cab-auth mx-auto mt-10 flex w-full max-w-sm flex-col gap-6 px-4 pb-12 sm:mt-16'
      >
        <div>
          <h1 className='mb-2 text-xl font-bold'>Welcome to Cabmate</h1>
          <p className='text-slate-300'>
            Your friends, your next drive, and RadioMax along for the ride.
          </p>
        </div>
        <BetterAuthUIProvider>
          <Auth path={path} className='w-full text-left' />
        </BetterAuthUIProvider>
        <Link to='/radio' className='text-center text-accent underline'>
          Visit RadioMax without signing in
        </Link>
      </main>
    </>
  )
}
