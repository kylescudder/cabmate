import { z } from 'zod';
import { RADIO_STREAM_ORIGIN, type RadioState } from '@ets2/shared';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshot = z.object({ stations: z.array(z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/),
  name: z.string().min(1).max(160), genre: z.string().max(160),
  trackTitle: z.string().max(500), trackIndex: count, trackCount: count,
  positionBytes: count, trackSizeBytes: count, listeners: count,
  uptimeSec: z.number().finite().nonnegative(),
})).max(16) });

// One bounded request per process per interval, including failures. Never proxy
// caller URLs, credentials, headers, audio or the broadcaster's privileged routes.
export function createRadioState(origin = process.env.RADIO_ORIGIN || 'http://radio-max:8080') {
  const endpoint = new URL('/api/state', origin);
  if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
    throw new Error('RADIO_ORIGIN must be an HTTP origin without credentials');
  }
  let cached: { body: RadioState | { error: string }; status: number } | undefined;
  let expires = 0;
  let pending: Promise<void> | undefined;
  async function refresh() {
    try {
      const response = await fetch(endpoint, { redirect: 'error', signal: AbortSignal.timeout(2500) });
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error('Station unavailable');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 64_000) throw new Error('Station response too large');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      const parsed = snapshot.parse(JSON.parse(new TextDecoder().decode(bytes)));
      cached = { status: 200, body: { stations: parsed.stations.map(station => {
        const streamUrl = `${RADIO_STREAM_ORIGIN}/radio/${station.id}`;
        return { ...station, streamUrl,
          ets2Url: `${streamUrl}|${station.name.replaceAll('|', '')}|${station.genre.replaceAll('|', '')}|EN|128|1` };
      }) } };
    } catch {
      cached = { status: 503, body: { error: 'RadioMax is taking a break. Try again shortly.' } };
    }
    expires = Date.now() + 2000;
  }
  return async (request: Request) => {
    if (request.method !== 'GET') return new Response(null, { status: 405, headers: { Allow: 'GET' } });
    if (!cached || Date.now() >= expires) {
      pending ??= refresh().finally(() => { pending = undefined; });
      await pending;
    }
    return Response.json(cached!.body, { status: cached!.status, headers: { 'cache-control': 'no-store' } });
  };
}

let handler: ReturnType<typeof createRadioState> | undefined;
export const radioState = (request: Request) => (handler ??= createRadioState())(request);
