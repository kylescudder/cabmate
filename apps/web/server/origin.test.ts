import { expect, test } from 'bun:test';
import { appOrigins, validAppOrigin } from './origin';

test('cutover accepts only the exact canonical and explicit legacy origins', () => {
  const saved = { origin: process.env.APP_ORIGIN, legacy: process.env.LEGACY_APP_ORIGIN };
  process.env.APP_ORIGIN = 'https://cabmate.test';
  process.env.LEGACY_APP_ORIGIN = 'https://ets2.test';
  const request = (origin?: string) => new Request('https://cabmate.test/ws', { headers: origin ? { origin } : {} });
  try {
    expect(appOrigins('https://fallback.test')).toEqual(['https://cabmate.test', 'https://ets2.test']);
    for (const origin of ['https://cabmate.test', 'https://ets2.test']) expect(validAppOrigin(request(origin))).toBe(true);
    for (const origin of [undefined, 'null', 'https://evil.test', 'https://cabmate.test.evil.test', 'http://cabmate.test']) expect(validAppOrigin(request(origin))).toBe(false);
    delete process.env.LEGACY_APP_ORIGIN;
    expect(validAppOrigin(request('https://ets2.test'))).toBe(false);
  } finally {
    if (saved.origin === undefined) delete process.env.APP_ORIGIN; else process.env.APP_ORIGIN = saved.origin;
    if (saved.legacy === undefined) delete process.env.LEGACY_APP_ORIGIN; else process.env.LEGACY_APP_ORIGIN = saved.legacy;
  }
});
