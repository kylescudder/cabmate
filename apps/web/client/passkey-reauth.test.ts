import { afterAll, beforeAll, expect, test } from 'bun:test'
import { Window } from 'happy-dom'
import { act, createElement } from 'react'
import type { Root } from 'react-dom/client'

const browser = new Window({ url: 'https://cabmate.test/profile' })
const originals = new Map<string, PropertyDescriptor | undefined>()
const originalFetch = globalThis.fetch
let registerOptionsRequests = 0
let signOuts = 0
let signedIn = true
let root: Root | undefined

beforeAll(async () => {
  const globals: Record<string, unknown> = {
    window: browser,
    document: browser.document,
    navigator: browser.navigator,
    localStorage: browser.localStorage,
    sessionStorage: browser.sessionStorage,
    HTMLElement: browser.HTMLElement,
    HTMLInputElement: browser.HTMLInputElement,
    HTMLButtonElement: browser.HTMLButtonElement,
    HTMLDivElement: browser.HTMLDivElement,
    Node: browser.Node,
    Element: browser.Element,
    Event: browser.Event,
    InputEvent: browser.InputEvent,
    // Dialogs dispatch these when they open and trap focus.
    CustomEvent: browser.CustomEvent,
    FocusEvent: browser.FocusEvent,
    KeyboardEvent: browser.KeyboardEvent,
    MutationObserver: browser.MutationObserver,
    ResizeObserver: browser.ResizeObserver,
    getComputedStyle: browser.getComputedStyle.bind(browser),
    requestAnimationFrame: browser.requestAnimationFrame.bind(browser),
    cancelAnimationFrame: browser.cancelAnimationFrame.bind(browser),
    IS_REACT_ACT_ENVIRONMENT: true
  }
  for (const [key, value] of Object.entries(globals)) {
    originals.set(key, Object.getOwnPropertyDescriptor(globalThis, key))
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value
    })
  }
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url,
      browser.location.origin
    )
    if (url.pathname === '/api/auth/passkey/generate-register-options') {
      registerOptionsRequests++
      // What production returned: the session is older than freshAge (1 h).
      return Response.json(
        { message: 'Session is not fresh', code: 'SESSION_NOT_FRESH' },
        { status: 403, statusText: 'Forbidden' }
      )
    }
    if (url.pathname === '/api/auth/sign-out') {
      signOuts++
      signedIn = false
      return Response.json({ success: true })
    }
    if (url.pathname === '/api/auth/get-session') {
      const stamp = '2026-01-01T00:00:00Z'
      return Response.json(
        signedIn
          ? {
              user: {
                id: 'user-1',
                name: 'Night Trucker',
                email: 'kyle@example.com',
                emailVerified: true,
                image: null,
                createdAt: stamp,
                updatedAt: stamp
              },
              session: {
                id: 'session-1',
                userId: 'user-1',
                expiresAt: '2030-01-01T00:00:00Z',
                createdAt: stamp,
                updatedAt: stamp
              }
            }
          : null
      )
    }
    if (url.pathname === '/api/auth/passkey/list-user-passkeys')
      return Response.json([])
    throw new Error(`Unexpected test request: ${url.pathname}`)
  }) as unknown as typeof fetch
})

afterAll(async () => {
  await act(async () => root?.unmount())
  // Nanostores delays session-store unmount cleanup by one second.
  await new Promise((resolve) => setTimeout(resolve, 1100))
  globalThis.fetch = originalFetch
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else delete (globalThis as Record<string, unknown>)[key]
  }
  await browser.happyDOM.abort()
})

const event = (type: string, cancelable = false) =>
  new browser.Event(type, { bubbles: true, cancelable }) as unknown as Event

test('adding a passkey with a stale session offers "Sign in again" and returns to the profile', async () => {
  const { createRoot } = await import('react-dom/client')
  const { QueryClient } = await import('@tanstack/react-query')
  const { AuthProvider } = await import('../src/components/auth/auth-provider')
  const { AddPasskeyDialog } =
    await import('../src/components/auth/passkey/add-passkey-dialog')
  const { passkeyPlugin } = await import('../src/lib/auth/passkey-plugin')
  const { authClient } = await import('../src/lib/auth-client')

  const navigations: string[] = []
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } }
  })
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => {
    root!.render(
      createElement(
        AuthProvider,
        {
          authClient,
          queryClient,
          navigate: ({ to }: { to: string }) => {
            navigations.push(to)
          },
          basePaths: { auth: '/auth' },
          emailAndPassword: { enabled: false },
          plugins: [passkeyPlugin()]
        } as never,
        createElement(AddPasskeyDialog, { open: true, onOpenChange: () => {} })
      )
    )
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  // The dialog renders in a portal on document.body.
  const dialog = () => document.querySelector('[role="dialog"]')!
  expect(dialog()).toBeTruthy()
  const name = dialog().querySelector<HTMLInputElement>('input[name="name"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      browser.HTMLInputElement.prototype,
      'value'
    )!.set!.call(name, '1Password')
    name.dispatchEvent(event('input'))
  })
  await act(async () => {
    dialog().querySelector('form')!.dispatchEvent(event('submit', true))
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(registerOptionsRequests).toBe(1)
  // Before the fix the 403 resolved as { error }, so the form stayed put with no message and no way forward.
  expect(dialog().querySelector('input[name="name"]')).toBeNull()
  const signInAgain = [...dialog().querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === 'Sign in again'
  )
  expect(signInAgain).toBeTruthy()
  await act(async () => {
    signInAgain!.click()
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
  expect(signOuts).toBe(1)
  expect(navigations).toEqual([
    '/auth/sign-in?reauthenticate=true&redirectTo=%2Fprofile'
  ])
})
