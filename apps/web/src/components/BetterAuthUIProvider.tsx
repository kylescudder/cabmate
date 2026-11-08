import type { ReactNode } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { AuthProvider } from '@/components/auth/auth-provider'
import { passkeyPlugin } from '@/lib/auth/passkey-plugin'
import { emailOtpPlugin } from '@/lib/auth/email-otp-plugin'
import { magicLinkPlugin } from '@/lib/auth/magic-link-plugin'
import { authClient } from '@/lib/auth-client'
import { appHome, safeAppPath } from '@/lib/auth/safe-path'
import { profileAvatar } from '@/lib/profile-ui'

// Every navigation the auth UI makes goes through safeAppPath, so a crafted
// `?redirectTo=` can never leave Cabmate.
export function BetterAuthUIProvider({ children, redirectTo = appHome }: { children: ReactNode; redirectTo?: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  return (
    <AuthProvider
      authClient={authClient}
      queryClient={queryClient}
      navigate={({ to, replace }) => {
        void navigate({ href: safeAppPath(to), replace })
      }}
      Link={({ href, ...props }) => <Link to={safeAppPath(href)} {...props} />}
      redirectTo={safeAppPath(redirectTo)}
      basePaths={{ auth: '/auth' }}
      emailAndPassword={{
        enabled: true,
        forgotPassword: true,
        minPasswordLength: 12,
        maxPasswordLength: 128,
        rememberMe: false,
        requireEmailVerification: true
      }}
      avatar={profileAvatar}
      plugins={[emailOtpPlugin(), magicLinkPlugin(), passkeyPlugin()]}
    >
      {children}
    </AuthProvider>
  )
}
