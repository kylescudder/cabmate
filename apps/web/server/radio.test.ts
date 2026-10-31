import { afterAll, expect, test } from 'bun:test';
import { createRadioState } from './radio';

const station = { id: 'main', name: 'RadioMax', genre: 'Gaming Music', trackTitle: 'Road song',
  trackIndex: 0, trackCount: 2, positionBytes: 1000, trackSizeBytes: 4000, listeners: 3, uptimeSec: 90,
  streamUrl: 'http://obsolete.invalid/radio/main', ets2Url: 'obsolete', secret: 'must not leak' };
let calls = 0;
let reply = () => Response.json({ stations: [station] });
const upstream = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch(request) {
  calls++;
  expect(new URL(request.url).pathname).toBe('/api/state');
  expect(request.headers.get('authorization')).toBeNull();
  expect(request.headers.get('x-radio-max-relay-token')).toBeNull();
  return reply();
} });
afterAll(() => upstream.stop(true));
const request = () => new Request('http://cabmate.test/api/radio/state?url=http://ignored.invalid', {
  headers: { authorization: 'Bearer must-not-forward', 'x-radio-max-relay-token': 'must-not-forward' },
});
const adapter = () => createRadioState(`http://127.0.0.1:${upstream.port}`);

test('public station adapter uses the fixed upstream and immutable audio contract, coalescing calls', async () => {
  reply = () => Response.json({ stations: [station] });
  const get = adapter();
  const before = calls;
  const responses = await Promise.all(Array.from({ length: 8 }, () => get(request())));
  expect(calls - before).toBe(1);
  for (const response of responses) {
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.stations[0].streamUrl).toBe('http://radio-max-audio.kylescudder.co.uk/radio/main');
    expect(body.stations[0].ets2Url).toBe('http://radio-max-audio.kylescudder.co.uk/radio/main|RadioMax|Gaming Music|EN|128|1');
    expect(body.stations[0].secret).toBeUndefined();
  }
  await get(request());
  expect(calls - before).toBe(1);
});

test('upstream failure, bad payload, redirects and oversized responses fail closed', async () => {
  for (const failure of [
    () => new Response('private upstream detail', { status: 500 }),
    () => Response.json({ stations: [{ ...station, listeners: -1 }] }),
    () => new Response('x'.repeat(64_001)),
    () => new Response(null, { status: 302, headers: { location: 'http://example.invalid' } }),
  ]) {
    reply = failure;
    const get = adapter();
    const response = await get(request());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private');
    const before = calls;
    await get(request());
    expect(calls).toBe(before);
  }
});

test('unreachable station fails without affecting other app routes; mutations never contact it', async () => {
  const get = createRadioState('http://127.0.0.1:1');
  expect((await get(request())).status).toBe(503);
  const response = await adapter()(new Request('http://cabmate.test/api/radio/state', { method: 'POST' }));
  expect(response.status).toBe(405);
  expect(response.headers.get('allow')).toBe('GET');
});
