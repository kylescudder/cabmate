import { useSession } from '@better-auth-ui/react'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { BetterAuthUIProvider } from '@/components/BetterAuthUIProvider'
import { Passkeys } from '@/components/auth/passkey/passkeys'
import { ChangePassword } from '@/components/auth/settings/security/change-password'
import { authClient } from '@/lib/auth-client'
import { clearPendingSignIn } from '@/lib/pending-sign-in'

// Sign-in settings for Better Auth. Display name and username stay in Cabmate's
// own profile form above, so they also reach the map, drivers and leaderboard.
export function BetterAuthAccount() {
  return (
    <BetterAuthUIProvider redirectTo='/profile'>
      <Account />
    </BetterAuthUIProvider>
  )
}

function Account() {
  // Better Auth UI's session query, not the client's nanostore, which can still
  // hold the signed-out value after a "Sign in again" round trip.
  const { data: session } = useSession(authClient)
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  useEffect(() => {
    if (session) clearPendingSignIn()
  }, [session])
  if (!session)
    return (
      <p role='status' className='text-slate-400'>
        Checking sign-in…
      </p>
    )
  async function signOut() {
    setSigningOut(true)
    setError('')
    try {
      const result = await authClient.signOut()
      if (result.error) {
        setError('Unable to sign out. Please try again.')
        return
      }
      queryClient.clear()
      await navigate({ to: '/' })
    } catch {
      setError('Unable to sign out. Please try again.')
    } finally {
      setSigningOut(false)
    }
  }
  return (
    <section aria-labelledby='account-heading' className='max-w-lg space-y-6'>
      <div>
        <h2 id='account-heading' className='text-lg font-bold'>
          Sign-in and security
        </h2>
        <p className='mt-1 text-sm text-slate-400'>
          Signed in as{' '}
          <span className='text-slate-200'>{session.user.email}</span>{' '}
          (verified).
        </p>
      </div>
      <ChangePassword />
      <Passkeys />
      <p className='text-sm text-slate-400'>
        Email codes remain available for recovery.
      </p>
      {error && (
        <p role='alert' className='text-sm text-red-400'>
          {error}
        </p>
      )}
      <button
        type='button'
        disabled={signingOut}
        onClick={() => void signOut()}
        className='border-edge hover:border-accent rounded border px-4 py-2 font-semibold text-slate-200 disabled:opacity-50'
      >
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </section>
  )
}
