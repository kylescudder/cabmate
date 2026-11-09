import { getRequest } from '@tanstack/react-start/server'
import type { Identity } from './identity'

export type { Identity }

export async function identity(
  request: Request = getRequest()
): Promise<Identity | null> {
  const { betterAuthIdentity } = await import('./better-auth')
  return betterAuthIdentity(request.headers)
}
