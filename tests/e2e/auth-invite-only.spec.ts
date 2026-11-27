import { expect, test } from '@playwright/test'

// Signed-out journey: sign-in is invite-only, so the Better Auth endpoints must
// answer the same way for every address and refuse off-site or cross-site use.
const uninvited = 'uninvited@example.com'

// Each test uses its own client address so the app's per-IP auth rate limiter
// never couples one test's requests to another's.
const clientAddress = () => `198.51.100.${Math.floor(Math.random() * 250) + 1}`

test('email code sign-in gives the same answer for an uninvited address', async ({
  request
}) => {
  const response = await request.post(
    '/api/auth/email-otp/send-verification-otp',
    {
      headers: { 'cf-connecting-ip': clientAddress() },
      data: { email: uninvited, type: 'sign-in' }
    }
  )
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ success: true })
})

test('email code sign-in refuses methods other than sign-in', async ({
  request
}) => {
  const response = await request.post(
    '/api/auth/email-otp/send-verification-otp',
    {
      headers: { 'cf-connecting-ip': clientAddress() },
      data: { email: uninvited, type: 'forget-password' }
    }
  )
  expect(response.status()).toBe(400)
})

test('magic link sign-in gives the same answer for an uninvited address', async ({
  request
}) => {
  const response = await request.post('/api/auth/sign-in/magic-link', {
    headers: { 'cf-connecting-ip': clientAddress() },
    data: { email: uninvited, callbackURL: '/' }
  })
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: true })
})

test('magic link sign-in refuses off-site return addresses', async ({
  request
}) => {
  const response = await request.post('/api/auth/sign-in/magic-link', {
    headers: { 'cf-connecting-ip': clientAddress() },
    data: { email: uninvited, callbackURL: 'https://attacker.example/' }
  })
  expect(response.status()).toBe(403)
})

test('auth endpoints refuse cross-site requests', async ({ request }) => {
  const response = await request.post('/api/auth/sign-in/magic-link', {
    headers: {
      'cf-connecting-ip': clientAddress(),
      'sec-fetch-site': 'cross-site'
    },
    data: { email: uninvited, callbackURL: '/' }
  })
  expect(response.status()).toBe(403)
})
