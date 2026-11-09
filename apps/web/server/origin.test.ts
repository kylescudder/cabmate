import { expect, test } from 'bun:test'
import { appOrigin, validAppOrigin } from './origin'

test('accepts only the exact canonical origin', () => {
  const saved = process.env.APP_ORIGIN
  process.env.APP_ORIGIN = 'https://cabmate.test'
  const request = (origin?: string) =>
    new Request('https://cabmate.test/ws', {
      headers: origin ? { origin } : {}
    })
  try {
    expect(appOrigin('https://fallback.test')).toBe('https://cabmate.test')
    expect(validAppOrigin(request('https://cabmate.test'))).toBe(true)
    for (const origin of [
      undefined,
      'null',
      'https://evil.test',
      'https://old.test',
      'https://cabmate.test.evil.test',
      'http://cabmate.test'
    ])
      expect(validAppOrigin(request(origin))).toBe(false)
  } finally {
    if (saved === undefined) delete process.env.APP_ORIGIN
    else process.env.APP_ORIGIN = saved
  }
})
