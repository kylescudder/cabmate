// Invite-only: AUTH_ALLOWED_EMAILS is the source of truth. Removing an address
// revokes access on the next request, even for existing sessions.
export function isAllowedEmail(
  email: string,
  allowedEmails: readonly string[]
) {
  return allowedEmails.includes(email.trim().toLowerCase())
}

export function isVerifiedAllowed(
  user: { email: string; emailVerified: boolean } | null | undefined,
  allowedEmails: readonly string[]
) {
  return !!user?.emailVerified && isAllowedEmail(user.email, allowedEmails)
}
