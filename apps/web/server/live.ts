import type { ServerWebSocket, WebSocketHandler } from 'bun'
import { listDrivers } from './api'
import { database, sqlClient } from './db'
import { LIVE_CHANNEL } from './ingest'
import { validAppOrigin } from './origin'

// Sessions are re-checked on reconnect, so access removed through the allowlist
// also ends open sockets.
const MAX_SOCKET_AGE_MS = 15 * 60_000
// Catches drivers going offline (no sample for 30s), which produce no notification.
const SWEEP_MS = 5_000
const DEBOUNCE_MS = 200

export interface SocketData {
  expires?: ReturnType<typeof setTimeout>
}
type Socket = ServerWebSocket<SocketData>

const sockets = new Set<Socket>()
let current = ''
let pending: ReturnType<typeof setTimeout> | undefined

async function broadcast() {
  pending = undefined
  if (!sockets.size) {
    current = ''
    return
  }
  try {
    const message = JSON.stringify({
      type: 'drivers',
      drivers: await listDrivers(database())
    })
    if (message === current) return
    current = message
    for (const socket of sockets) socket.send(message)
  } catch (error) {
    console.error('Live broadcast failed', {
      code: (error as { code?: string }).code ?? 'internal'
    })
  }
}
function schedule() {
  pending ??= setTimeout(broadcast, DEBOUNCE_MS)
}

export async function startLive() {
  await sqlClient().listen(LIVE_CHANNEL, schedule)
  setInterval(() => {
    if (sockets.size) schedule()
  }, SWEEP_MS).unref()
}

export async function authorizeSocket(request: Request) {
  // Browsers always send Origin on WebSocket handshakes; reject cross-site pages riding the session cookie.
  const origin = process.env.APP_ORIGIN || new URL(request.url).origin
  if (!validAppOrigin(request, origin)) return false
  // Same rule as the API: a verified email that is still on the allowlist.
  const { verifiedUser } = await import('./better-auth')
  return Boolean(await verifiedUser(request.headers))
}

export const liveSocket: WebSocketHandler<SocketData> = {
  // Bun pings idle sockets, keeping them under proxy idle limits (Cloudflare drops after ~100s).
  idleTimeout: 60,
  sendPings: true,
  open(socket) {
    sockets.add(socket)
    socket.data.expires = setTimeout(
      () => socket.close(4000, 'Reauthenticate'),
      MAX_SOCKET_AGE_MS
    )
    // Everyone else already has `current`; a newcomer gets it now, or the next broadcast if none yet.
    if (current) socket.send(current)
    else schedule()
  },
  message() {},
  close(socket) {
    clearTimeout(socket.data.expires)
    sockets.delete(socket)
  }
}
